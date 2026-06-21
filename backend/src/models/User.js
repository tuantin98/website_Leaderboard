const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'student'],
    required: true,
  },
  totalScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  spinsRemaining: {
    type: Number,
    default: 0,
    min: 0,
  },
  spinsExecuted: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema);
