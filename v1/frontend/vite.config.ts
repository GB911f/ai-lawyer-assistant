import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import demoApi from './demo-api';

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [demoApi()] : [])],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: mode === 'demo' ? undefined : {
      '/auth': 'http://127.0.0.1:8000',
      '/chat': 'http://127.0.0.1:8000',
      '/documents': 'http://127.0.0.1:8000',
      '/templates': 'http://127.0.0.1:8000',
      '/index': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/frontend-error': 'http://127.0.0.1:8000',
    },
  },
}));
