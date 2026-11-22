import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Privy SDK mentions these loaders. The extension stubs the packages and
// also rewrites any leftover URL so the store package does not fetch them.
const REMOTE_LOADER_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['/js/telegram-login.js', '/js/disabled-telegram'],
  ['https://challenges.cloudflare.com', ''],
  ['challenges.cloudflare.com', ''],
  ['https://js.hcaptcha.com', ''],
  ['js.hcaptcha.com', ''],
  ['https://crypto-js.stripe.com', ''],
  ['crypto-js.stripe.com', ''],
  ['https://js.stripe.com', ''],
  ['https://issuing-key.stripe.com', ''],
];

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'strip-remote-script-loaders',
      generateBundle(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type !== 'chunk') continue;
          for (const [from, to] of REMOTE_LOADER_REPLACEMENTS) file.code = file.code.replaceAll(from, to);
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@marsidev/react-turnstile': resolve('stubs/empty-captcha.js'),
      '@hcaptcha/react-hcaptcha': resolve('stubs/empty-captcha.js'),
      '@stripe/stripe-js': resolve('stubs/empty-stripe.js'),
      '@stripe/crypto': resolve('stubs/empty-stripe-crypto.js'),
      buffer: 'buffer',
    },
  },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: {
        popup: resolve('popup.html'),
        auth: resolve('auth.html'),
        offscreen: resolve('offscreen.html'),
        background: resolve('src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
