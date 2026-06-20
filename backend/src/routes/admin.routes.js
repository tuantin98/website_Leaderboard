const express = require('express');
const { authenticate, authorizeRole } = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');
const { getIO } = require('../sockets');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

const broadcastLeaderboard = async () => {
  const io = getIO();
  const leaderboard = await User.find({ role: 'student' })
    .sort({ totalScore: -1, spinCount: -1, username: 1 })
    .select('-password');

  io.emit('leaderboard:update', leaderboard);
  return leaderboard;
};

const getLatestSession = async () => {
  return Session.findOne().sort({ createdAt: -1 });
};

const broadcastSession = async (session) => {
  const io = getIO();
  io.emit('session:update', session);
  io.emit('wheel:update', session.wheelSegments || []);
};

router.get('/session', async (_req, res, next) => {
  try {
    const session = await getLatestSession();
    res.status(200).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.get('/wheel-config', async (_req, res, next) => {
  try {
    const session = await getLatestSession();
    res.status(200).json({
      success: true,
      wheelSegments: session?.wheelSegments || [],
    });
  } catch (error) {
    next(error);
  }
});

router.put('/wheel-config', async (req, res, next) => {
  try {
    const { wheelSegments } = req.body;

    if (!Array.isArray(wheelSegments) || wheelSegments.length === 0) {
      return res.status(400).json({ success: false, message: 'wheelSegments must be a non-empty array' });
    }

    const session = await getLatestSession();
    if (!session) {
      return res.status(404).json({ success: false, message: 'No session found' });
    }

    const updatedSession = await Session.findByIdAndUpdate(
      session._id,
      { wheelSegments },
      { new: true }
    );

    await broadcastSession(updatedSession);

    return res.status(200).json({ success: true, session: updatedSession });
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
      status: ['active', 'paused', 'ended'].includes(status) ? status : 'paused',
    });

    const io = getIO();
    await broadcastSession(session);
    io.emit('session:created', session);

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
    io.emit('wheel:update', session.wheelSegments || []);

    if (status !== 'active') {
      // Pausing/ending the session instantly locks every student out of spinning.
      const result = await User.updateMany({ role: 'student' }, { canSpin: false });
      await broadcastLeaderboard();
      io.emit('users:permission:update', { canSpin: false, updatedCount: result.modifiedCount });
      io.emit('spinStatusUpdate', { canSpin: false });
    }

    res.status(200).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'student' })
      .select('-password')
      .sort({ totalScore: -1, spinCount: -1, username: 1 });

    res.status(200).json({ success: true, users });
  } catch (error) {
    next(error);
  }
});

router.put('/users/toggle-spin', async (req, res, next) => {
  try {
    const { userId, canSpin } = req.body;
    const io = getIO();

    if (userId) {
      const user = await User.findByIdAndUpdate(
        userId,
        { canSpin },
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const payload = { userId: String(user._id), canSpin: user.canSpin };
      // Targeted real-time toggle to the affected student only.
      io.to(`user:${user._id}`).emit('user:permission', payload);
      io.to(`user:${user._id}`).emit('spinStatusUpdate', payload);

      await broadcastLeaderboard();
      return res.status(200).json({ success: true, user });
    }

    const result = await User.updateMany(
      { role: 'student' },
      { canSpin }
    );

    // Global toggle: broadcast to every connected student in real-time.
    io.emit('users:permission:update', {
      canSpin,
      updatedCount: result.modifiedCount,
    });
    io.emit('spinStatusUpdate', { canSpin });

    await broadcastLeaderboard();

    return res.status(200).json({ success: true, updatedCount: result.modifiedCount });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
