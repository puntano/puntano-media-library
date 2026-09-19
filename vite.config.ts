import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Prevent Vite from clearing console and obscuring Rust compiler output
  clearScreen: false,
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5183,
        }
      : undefined,
    watch: {
      // 3. Tell Vite to ignore watching `src-tauri` so Rust compilation/target files don't trigger HMR loops
      ignored: ['**/src-tauri/**'],
    },
  },
  // envPrefix is needed so Tauri env variables can be accessed in frontend:
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify in debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps in debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Code splitting for optimal desktop WebView startup performance
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-map': ['maplibre-gl', 'supercluster'],
          'vendor-react': ['react', 'react-dom', 'zustand'],
          'vendor-virtual': ['@tanstack/react-virtual', 'lucide-react'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
}));
