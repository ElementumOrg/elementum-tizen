// Checks the build output; `npm test` runs `vite build` first (pretest).
import { expect, test } from 'vitest';
import pkg from '../package.json';
import html from '../dist/index.html?raw';
import configXml from '../dist/config.xml?raw';
import icon from '../dist/icon.png?raw';
import appinfoJson from '../dist/appinfo.json?raw';
import icon80 from '../dist/icon-80.png?raw';
import icon130 from '../dist/icon-130.png?raw';

const bundles = import.meta.glob<string>('../dist/assets/*.js', { query: '?raw', import: 'default', eager: true });

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

test('dist/appinfo.json matches package.json and ships its icons', () => {
  const info = JSON.parse(appinfoJson);
  expect(info.version).toBe(pkg.version);
  expect(info.disableBackHistoryAPI).toBe(true);
  expect(info.resolution).toBe('1920x1080');
  expect([info.icon, info.largeIcon]).toEqual(['icon-80.png', 'icon-130.png']);
  expect(icon80.length).toBeGreaterThan(0);
  expect(icon130.length).toBeGreaterThan(0);
});

test('the bundle has no async/await (lowered for Chromium 53)', () => {
  // The bundle name is hashed, so glob it instead of importing it by name.
  expect(Object.keys(bundles).length).toBeGreaterThan(0);
  const js = Object.keys(bundles).map((k) => bundles[k]).join('');
  expect(js).not.toMatch(/\basync\b|\bawait\b/);
});
