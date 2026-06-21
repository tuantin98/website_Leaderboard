// Resolve the backend host dynamically. When a phone on the LAN opens
// http://192.168.1.50:3000, window.location.hostname is "192.168.1.50", so the
// API/socket calls automatically target http://192.168.1.50:5000 — no hardcoded
// localhost. Override with VITE_API_URL / VITE_SOCKET_URL when needed.
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || '5000';
const backendOrigin = `http://${hostname}:${BACKEND_PORT}`;

export const API_URL = import.meta.env.VITE_API_URL || `${backendOrigin}/api`;
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || backendOrigin;
