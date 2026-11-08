import { expect, test } from 'vitest';

/** Returns an error text for the first unbalanced brace, or '' when the CSS is well formed (rules may nest only inside @-rules). */
export function braceProblem(css: string): string {
  const stack: boolean[] = []; // true = @-rule
  let start = 0;
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      if (stack.length && !stack[stack.length - 1]) return 'rule opened inside a rule near: ' + text.slice(start, i).trim().slice(-40);
      stack.push(text.slice(start, i).trim().charAt(0) === '@');
      start = i + 1;
    } else if (c === '}') {
      if (!stack.length) return 'stray }';
      stack.pop();
      start = i + 1;
    } else if (c === ';') start = i + 1;
  }
  return stack.length ? 'unclosed {' : '';
}

const files = import.meta.glob<string>('../src/**/*.css', { query: '?raw', import: 'default', eager: true });

test('braceProblem catches an unclosed rule', () => {
  expect(braceProblem('.a { color: red; }\n.b { color: blue;\n\n/* x */\n.c { top: 0; }')).toMatch(/inside a rule/);
  expect(braceProblem('.a { color: red;')).toBe('unclosed {');
  expect(braceProblem('@media (x) { .a { top: 0; } }\n@keyframes k { to { top: 1px; } }')).toBe('');
});

test('every src css file is balanced', () => {
  expect(Object.keys(files).length).toBeGreaterThan(1);
  for (const f in files) expect([f, braceProblem(files[f])]).toEqual([f, '']);
});
