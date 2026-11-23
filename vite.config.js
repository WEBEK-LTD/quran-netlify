import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  build: {
    // Optimize for mobile WebView
    target: 'es2015',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    
    rollupOptions: {
      output: {
        // Code splitting for faster load
        manualChunks: {
          'react-core':  ['react', 'react-dom', 'react-router-dom'],
          'quran-data':  ['./src/data.js', './src/hifzData.js'],
          'i18n':        ['./src/i18n.js'],
        },
      },
    },
    
    // Increase chunk size limit for Quran data
    chunkSizeWarningLimit: 1000,
  },

  // For Capacitor: use relative paths
  base: '/',
  
  server: {
    port: 3000,
    host: true,
  },
});
