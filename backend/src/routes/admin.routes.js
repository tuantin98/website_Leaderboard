const express = require('express');
const { authenticate, authorizeRole } = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');
const { getIO } = require('../sockets');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

router.get('/session', async (_req, res, next) => {
  try {
    const session = await Session.findOne().sort({ createdAt: -1 });
    res.status(200).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.post('/session', async (req, res, next) => {
  try {
    const { sessionName, status } = req.body;

    if (!sessionName) {
      return res.status(400).json({ success: false, message: 'sessionName is required' });
    }

    const session = await Session.create({
      sessionName,
      status: status || 'paused',
    });

    const io = getIO();
    io.emit('session:update', session);

    res.status(201).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.put('/session/:id', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'paused', 'ended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const session = await Session.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const io = getIO();
    io.emit('session:update', session);

    res.status(200).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'student' }).select('-password').sort({ totalScore: -1 });
    res.status(200).json({ success: true, users });
  } catch (error) {
    next(error);
  }
});

router.put('/users/toggle-spin', async (req, res, next) => {
  try {
    const { userId, canSpin } = req.body;

    if (userId) {
      const user = await User.findByIdAndUpdate(
        userId,
        { canSpin },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const io = getIO();
      io.to(`user:${user._id}`).emit('user:permission', { userId: user._id, canSpin: user.canSpin });
      io.emit('leaderboard:update', await User.find({ role: 'student' }).sort({ totalScore: -1 }).select('-password'));

      return res.status(200).json({ success: true, user });
    }

    const users = await User.updateMany(
      { role: 'student' },
      { canSpin }
    );

    const io = getIO();
    io.emit('users:permission:update', { canSpin, updatedCount: users.modifiedCount });
    io.emit('leaderboard:update', await User.find({ role: 'student' }).sort({ totalScore: -1 }).select('-password'));

    return res.status(200).json({ success: true, updatedCount: users.modifiedCount });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
