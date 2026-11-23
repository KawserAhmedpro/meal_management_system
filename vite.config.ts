import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // 1. Detect Vercel environment (VERCEL=1 or NOW_BUILDER)
  const isVercel = Boolean(process.env.VERCEL || process.env.NOW_BUILDER);

  // 2. Detect GitHub Actions environment
  const isGitHubActions = Boolean(process.env.GITHUB_ACTIONS);

  // 3. Optional explicit override via VITE_BASE_PATH
  const customBase = process.env.VITE_BASE_PATH;

  let base = '/meal_management_system/';
  if (customBase !== undefined) {
    base = customBase.endsWith('/') ? customBase : `${customBase}/`;
  } else if (isVercel) {
    base = '/';
  } else if (isGitHubActions) {
    base = '/meal_management_system/';
  }

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: false,
    },
    build: {
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            dexie: ['dexie', 'dexie-react-hooks'],
            charts: ['recharts'],
            xlsx: ['xlsx'],
            pdf: ['jspdf', 'jspdf-autotable'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
});
