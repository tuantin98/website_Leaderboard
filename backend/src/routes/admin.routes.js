const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, authorizeRole } = require('../middleware/auth');
const Session = require('../models/Session');
const User = require('../models/User');
const { getIO, broadcastLeaderboard, emitToUser, forceLogoutUser } = require('../sockets');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

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
    // Students gate their SPIN button on session.status === 'active', so simply
    // broadcasting the new session state instantly locks/unlocks everyone.
    // Spin balances (spinsRemaining) are preserved across pause/resume.
    io.emit('session:update', session);
    io.emit('wheel:update', session.wheelSegments || []);

    res.status(200).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'student' })
      .select('-password')
      .sort({ totalScore: -1, spinsExecuted: -1, username: 1 });

    res.status(200).json({ success: true, users });
  } catch (error) {
    next(error);
  }
});

// Coerce a possibly-string body value into a non-negative integer, or null if invalid.
const toNonNegativeInt = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

// Admin manually creates a student account (username, password, starting score
// and spin balance). Password is hashed; role is forced to 'student'.
router.post('/users/create', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Strict input validation (prevents injection / malformed docs / crashes).
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Username and password must be strings' });
    }
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 40) {
      return res.status(400).json({ success: false, message: 'Username must be 3-40 characters' });
    }
    if (password.length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
    }

    const totalScore = toNonNegativeInt(req.body.totalScore, 0);
    const spinsRemaining = toNonNegativeInt(req.body.spinsRemaining, 0);
    if (totalScore === null || spinsRemaining === null) {
      return res.status(400).json({ success: false, message: 'totalScore and spinsRemaining must be non-negative integers' });
    }

    // Duplicate check (case-insensitive exact match).
    const existing = await User.findOne({ username: trimmedUsername });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await User.create({
      username: trimmedUsername,
      password: hashedPassword,
      role: 'student',
      totalScore,
      spinsRemaining,
      spinsExecuted: 0,
    });

    const user = await User.findById(created._id).select('-password');

    // Real-time: refresh every admin roster (and leaderboard) with the new student.
    await broadcastLeaderboard();

    return res.status(201).json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

// Push a single student's current spin balance to their private room in
// real-time, targeting the stable User ID (reaches every tab they have open).
const emitSpinsUpdate = (user) => {
  emitToUser(user._id, 'spinsUpdated', {
    totalScore: user.totalScore,
    spinsRemaining: user.spinsRemaining,
    spinsExecuted: user.spinsExecuted,
  });
};

// Allocate spins to a student (or all students when userId is omitted).
// mode: 'add' increments the current balance, 'set' overwrites it.
router.put('/users/spins', async (req, res, next) => {
  try {
    const { userId, amount, mode = 'add' } = req.body;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ success: false, message: 'amount must be a non-negative number' });
    }
    if (!['add', 'set'].includes(mode)) {
      return res.status(400).json({ success: false, message: "mode must be 'add' or 'set'" });
    }

    const update = mode === 'set'
      ? { $set: { spinsRemaining: numericAmount } }
      : { $inc: { spinsRemaining: numericAmount } };

    if (userId) {
      const user = await User.findOneAndUpdate(
        { _id: userId, role: 'student' },
        update,
        { new: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      // Real-time: instantly update the affected student and unlock their button.
      emitSpinsUpdate(user);
      await broadcastLeaderboard();
      return res.status(200).json({ success: true, user });
    }

    // Bulk allocation to every student.
    const result = await User.updateMany({ role: 'student' }, update);
    const students = await User.find({ role: 'student' }).select('-password');
    students.forEach((student) => emitSpinsUpdate(student));

    await broadcastLeaderboard();
    return res.status(200).json({ success: true, updatedCount: result.modifiedCount });
  } catch (error) {
    next(error);
  }
});

// Manually set a student's total score.
router.put('/users/:id/update-score', async (req, res, next) => {
  try {
    const { totalScore } = req.body;
    const score = Number(totalScore);

    // Must be a valid non-negative integer.
    if (!Number.isInteger(score) || score < 0) {
      return res.status(400).json({ success: false, message: 'totalScore must be a non-negative integer' });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student' },
      { $set: { totalScore: score } },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Real-time: push the new score to the student (buffered on their side if
    // they are mid-spin, so it never interrupts a wheel animation).
    emitSpinsUpdate(user);
    // Re-rank everyone's leaderboard instantly.
    await broadcastLeaderboard();

    return res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

// Permanently delete a student account and force their live sessions offline.
router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, role: 'student' });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Real-time: kick every open tab of the deleted user back to the login page.
    forceLogoutUser(user._id);
    // Refresh everyone's leaderboard / the admin roster.
    await broadcastLeaderboard();

    return res.status(200).json({ success: true, id: String(user._id) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
