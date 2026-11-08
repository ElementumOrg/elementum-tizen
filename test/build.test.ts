// Checks the build output; `npm test` runs `vite build` first (pretest).
import { expect, test } from 'vitest';
import pkg from '../package.json';
import html from '../dist/index.html?raw';
import configXml from '../dist/config.xml?raw';
import icon from '../dist/icon.png?raw';

test('dist/index.html loads a classic script with a relative src', () => {
  expect(html).not.toMatch(/type="module"|crossorigin/);
  expect(html).toMatch(/<script defer src="\.\/assets\/[^"]+\.js"><\/script>/);
});

test('dist has config.xml with the package.json version, and the icon', () => {
  expect(configXml).toMatch(new RegExp(`<widget [^>]*version="${pkg.version.replace(/\./g, '\\.')}"`));
  expect(icon.length).toBeGreaterThan(0);
});

test('dist/index.html injects webapis.js on Tizen only', () => {
  expect(html).toContain('$WEBAPIS/webapis/webapis.js');
  expect(html).toMatch(/typeof tizen !== 'undefined'[^\n]*document\.write/);
});
