import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import pkg from './package.json' with { type: 'json' };

// Tizen 4.0 (Chrome 56) and webOS 4.x (Chromium 53) have no ES module scripts and load the app from file://,
// so ship a classic deferred script instead of type="module" + crossorigin.
const classicScript: Plugin = {
  name: 'classic-script',
  apply: 'build',
  transformIndexHtml(html) {
    const out = html.replace(/\s+type="module"/g, ' defer').replace(/\s+crossorigin(="[^"]*")?/g, '');
    if (/type="module"|crossorigin/.test(out)) throw new Error('classic-script: module script left in index.html');
    return out;
  },
};

export default defineConfig({
  base: './',
  plugins: [preact(), classicScript],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'chrome53',
    modulePreload: false,
    rolldownOptions: { output: { format: 'iife' } },
  },
});
