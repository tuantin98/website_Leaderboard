const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionName: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'ended'],
    default: 'paused',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Session', sessionSchema);
