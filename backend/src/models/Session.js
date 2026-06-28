const mongoose = require('mongoose');
const { DEFAULT_WHEEL_SEGMENTS } = require('../config/wheel');

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
    default: () => DEFAULT_WHEEL_SEGMENTS,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Session', sessionSchema);
