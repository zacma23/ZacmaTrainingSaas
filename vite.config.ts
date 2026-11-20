import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type ResolvedConfig } from 'vite';

const rootDir = import.meta.dirname;

export default defineConfig(() => {
  let resolvedOutDir = path.resolve(rootDir, 'dist');

  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into the resolved production outDir (dist/src/assets)
      // so root-relative URLs like "/src/assets/images/..." resolve in Vercel builds.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        configResolved(config: ResolvedConfig): void {
          resolvedOutDir = path.resolve(rootDir, config.build.outDir || 'dist');
        },
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(resolvedOutDir, 'src/assets');
          if (fs.existsSync(resolvedOutDir) && fs.existsSync(srcAssets)) {
            fs.mkdirSync(distAssets, { recursive: true });
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
              {
                name: 'vendor-firebase',
                test: /node_modules[\\/](firebase|@firebase)[\\/]/,
              },
              {
                name: 'vendor-charts',
                test: /node_modules[\\/](recharts|d3-|victory-vendor)[\\/]/,
              },
              {
                name: 'vendor-xlsx',
                test: /node_modules[\\/]xlsx[\\/]/,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
