const mongoose = require('mongoose');

const wheelSegmentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
  },
  value: {
    type: Number,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
}, { _id: false });

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
  wheelSegments: {
    type: [wheelSegmentSchema],
    default: [
      { text: '+10', value: 10, color: '#06b6d4' },
      { text: '+20', value: 20, color: '#22c55e' },
      { text: '+50', value: 50, color: '#f59e0b' },
      { text: '+100', value: 100, color: '#ef4444' },
      { text: 'Better luck next time', value: 0, color: '#8b5cf6' },
    ],
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Session', sessionSchema);
