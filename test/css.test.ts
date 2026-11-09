import postcss from 'postcss';
import { expect, test } from 'vitest';

/** Returns an error text for the first sign of a dropped brace, or '' when the CSS is well formed. */
export function braceProblem(css: string): string {
  let root;
  try {
    root = postcss.parse(css);
  } catch (e) {
    return (e as Error).message; // unclosed block / stray }
  }
  let problem = '';
  root.walkRules((rule) => {
    if (problem) return;
    const p = rule.parent as postcss.Container | undefined;
    const inKeyframes = p?.type === 'atrule' && /keyframes$/i.test((p as postcss.AtRule).name);
    // A missing } swallows the next rule into the open one (or into @keyframes, whose children must be from/to/N%).
    if (p?.type === 'rule') problem = 'rule nested in rule: ' + rule.selector;
    else if (inKeyframes && !/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/i.test(rule.selector)) problem = 'bad keyframe selector: ' + rule.selector;
    else if (/[{;]/.test(rule.selector)) problem = 'declaration in selector: ' + rule.selector;
  });
  root.walkDecls((d) => {
    if (!problem && /[{}]/.test(d.value)) problem = 'brace in value: ' + d.prop;
  });
  return problem;
}

const files = import.meta.glob<string>('../src/**/*.css', { query: '?raw', import: 'default', eager: true });
const good = '@media (min-width: 1px) {\n  .a {\n    top: 0;\n  }\n  .b {\n    top: 1px;\n  }\n}\n@keyframes k {\n  to {\n    top: 1px;\n  }\n}\n.c {\n  top: 0;\n}\n.d {\n  top: 0;\n}\n';

test('braceProblem accepts well-formed css', () => {
  expect(braceProblem(good)).toBe('');
});

test('braceProblem catches a } dropped inside an @media block', () => {
  expect(braceProblem(good.replace('top: 0;\n  }\n  .b', 'top: 0;\n  .b'))).not.toBe('');
});

test('braceProblem catches a } dropped inside @keyframes', () => {
  expect(braceProblem(good.replace('top: 1px;\n  }\n}\n.c', 'top: 1px;\n}\n.c'))).not.toBe('');
});

test('braceProblem catches a } dropped from a top-level rule', () => {
  expect(braceProblem(good.replace('top: 0;\n}\n.d', 'top: 0;\n.d'))).not.toBe('');
});

test('every src css file is balanced', () => {
  expect(Object.keys(files).length).toBeGreaterThan(1);
  for (const f in files) expect([f, braceProblem(files[f])]).toEqual([f, '']);
});
