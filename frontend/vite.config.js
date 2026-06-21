import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true binds to 0.0.0.0 so phones/tablets on the same Wi-Fi can reach
    // the dev server at http://<laptop-ip>:3000 (equivalent to `vite --host`).
    host: true,
    port: 3000,
  },
});
