// Chromium 53 (webOS 4.x) lacks Object.values/entries (Chrome 54); norigin-spatial-navigation calls them.
if (!Object.values) Object.values = (o: object) => Object.keys(o).map((k) => (o as Record<string, unknown>)[k]);
if (!Object.entries) Object.entries = (o: object) => Object.keys(o).map((k): [string, unknown] => [k, (o as Record<string, unknown>)[k]]);
export {}; // make it a module so main.tsx and the test can import it
