const express = require('express');
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const Session = require('../models/Session');
const { emitToUser, scheduleLeaderboardBroadcast } = require('../sockets');

const router = express.Router();

router.use(authenticate);

const getWeightedResult = (segments) => {
  const validSegments = segments.filter((segment) => segment && typeof segment.value === 'number');
  if (!validSegments.length) {
    return null;
  }

  const totalWeight = validSegments.reduce((sum, segment) => sum + Math.max(1, segment.weight || 1), 0);
  const random = Math.random() * totalWeight;

  let running = 0;
  for (const segment of validSegments) {
    running += Math.max(1, segment.weight || 1);
    if (random < running) {
      return {
        text: segment.text,
        value: segment.value,
        color: segment.color,
      };
    }
  }

  return {
    text: validSegments[validSegments.length - 1].text,
    value: validSegments[validSegments.length - 1].value,
    color: validSegments[validSegments.length - 1].color,
  };
};

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
    const users = await User.find({ role: 'student' })
      .sort({ totalScore: -1, spinsExecuted: -1, username: 1 })
      .select('-password');

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

    if (user.spinsRemaining <= 0) {
      return res.status(403).json({ success: false, message: 'No spins remaining' });
    }

    const wheelSegments = session.wheelSegments?.length
      ? session.wheelSegments
      : [
          { text: '+10', value: 10, color: '#06b6d4' },
          { text: '+20', value: 20, color: '#22c55e' },
          { text: '+50', value: 50, color: '#f59e0b' },
          { text: '+100', value: 100, color: '#ef4444' },
          { text: 'Better luck next time', value: 0, color: '#8b5cf6' },
        ];

    const result = getWeightedResult(wheelSegments);
    if (!result) {
      return res.status(400).json({ success: false, message: 'No wheel segments configured' });
    }

    // Quota spend is atomic: the `spinsRemaining > 0` guard in the query prevents
    // a double-click / concurrent request from spending more spins than allowed.
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, spinsRemaining: { $gt: 0 } },
      {
        $inc: {
          totalScore: result.value,
          spinsRemaining: -1,
          spinsExecuted: 1,
        },
      },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(403).json({ success: false, message: 'No spins remaining' });
    }

    // 1. Privately sync the spinner's own quota (covers any of their other tabs).
    //    The spinning tab also gets the result via this HTTP response below.
    emitToUser(updatedUser._id, 'spinsUpdated', {
      totalScore: updatedUser.totalScore,
      spinsRemaining: updatedUser.spinsRemaining,
      spinsExecuted: updatedUser.spinsExecuted,
    });

    // 2. DELAY the global leaderboard reveal until the wheel has stopped. The
    //    spinner's client emits 'spin:settled' when its animation ends (flushing
    //    immediately); this server-side timer is the fallback if that never lands.
    scheduleLeaderboardBroadcast(5000);

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
