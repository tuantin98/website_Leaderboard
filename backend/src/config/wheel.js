// Canonical Lucky Wheel layout: exactly 10 equal sectors (36° each).
// Order matters — the frontend renders sectors in this exact order and the spin
// API returns the chosen sector's index so the pointer aligns precisely, even
// though several labels repeat (two "+1", two "+2", etc.).
const DEFAULT_WHEEL_SEGMENTS = [
  { text: '+1', value: 1, color: '#06b6d4' },   // 1
  { text: '+1', value: 1, color: '#0ea5e9' },   // 2
  { text: '+2', value: 2, color: '#22c55e' },   // 3
  { text: '+2', value: 2, color: '#16a34a' },   // 4
  { text: '+3', value: 3, color: '#f59e0b' },   // 5
  { text: '+3', value: 3, color: '#f97316' },   // 6
  { text: '+4', value: 4, color: '#ef4444' },   // 7
  { text: '+4', value: 4, color: '#e11d48' },   // 8
  { text: 'Not lucky', value: 0, color: '#8b5cf6' }, // 9
  { text: '+10', value: 10, color: '#eab308' }, // 10
];

module.exports = { DEFAULT_WHEEL_SEGMENTS };
