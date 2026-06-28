// Default Lucky Wheel layout — must match the backend (backend/src/config/wheel.js):
// exactly 10 equal 36° sectors, in this exact order so the spin API's returned
// index maps to the correct on-screen sector.
export const defaultWheelSegments = [
  { text: '+1', value: 1, color: '#06b6d4' },
  { text: '+1', value: 1, color: '#0ea5e9' },
  { text: '+2', value: 2, color: '#22c55e' },
  { text: '+2', value: 2, color: '#16a34a' },
  { text: '+3', value: 3, color: '#f59e0b' },
  { text: '+3', value: 3, color: '#f97316' },
  { text: '+4', value: 4, color: '#ef4444' },
  { text: '+4', value: 4, color: '#e11d48' },
  { text: 'Not lucky', value: 0, color: '#8b5cf6' },
  { text: '+10', value: 10, color: '#eab308' },
];
