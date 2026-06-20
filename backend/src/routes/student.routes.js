const express = require('express');
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const Session = require('../models/Session');
const { getIO } = require('../sockets');

const router = express.Router();

router.use(authenticate);

router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

router.get('/leaderboard', async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'student' }).sort({ totalScore: -1 }).select('-password');
    res.status(200).json({ success: true, users });
  } catch (error) {
    next(error);
  }
});

router.get('/session', async (_req, res, next) => {
  try {
    const session = await Session.findOne().sort({ createdAt: -1 });
    res.status(200).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.post('/spin', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const session = await Session.findOne().sort({ createdAt: -1 });
    if (!session || session.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Session is not active' });
    }

    if (!user.canSpin) {
      return res.status(403).json({ success: false, message: 'You do not have permission to spin' });
    }

    const wheelSegments = [
      { label: '+10', points: 10 },
      { label: '+20', points: 20 },
      { label: '+50', points: 50 },
      { label: '+100', points: 100 },
      { label: 'Try Again', points: 0 },
    ];

    const result = wheelSegments[Math.floor(Math.random() * wheelSegments.length)];

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $inc: { totalScore: result.points },
        canSpin: false,
      },
      { new: true }
    ).select('-password');

    const io = getIO();
    io.emit('leaderboard:update', await User.find({ role: 'student' }).sort({ totalScore: -1 }).select('-password'));
    io.to(`user:${updatedUser._id}`).emit('spin:result', {
      userId: updatedUser._id,
      result,
      totalScore: updatedUser.totalScore,
    });

    return res.status(200).json({
      success: true,
      result,
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
