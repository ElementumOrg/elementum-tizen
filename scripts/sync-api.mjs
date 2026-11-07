// Copies the API spec from the Elementum repo, regenerates the TS types and records the commit in api/SPEC_REF.
// Env: ELEMENTUM_REPO (default ../elementum), ELEMENTUM_REF (default api).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, process.env.ELEMENTUM_REPO || '../elementum');
const ref = process.env.ELEMENTUM_REF || 'api';
if (!/^[\w./-]+$/.test(ref) || ref.startsWith('-')) throw new Error(`invalid ELEMENTUM_REF: ${ref}`);

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 64 << 20 });
const sha = git('rev-parse', '--verify', `${ref}^{commit}`).toString().trim();
const spec = git('show', `${sha}:apiv1/openapi.yaml`);

// Generate from a temp copy first, so a failed generation leaves the committed spec and types in sync.
const tmp = mkdtempSync(join(tmpdir(), 'elementum-api-'));
try {
  writeFileSync(join(tmp, 'openapi.yaml'), spec);
  execFileSync(
    resolve(root, 'node_modules/.bin/openapi-typescript'),
    [join(tmp, 'openapi.yaml'), '-o', join(tmp, 'schema.d.ts')],
    { stdio: 'inherit' },
  );
  writeFileSync(resolve(root, 'src/api/schema.d.ts'), readFileSync(join(tmp, 'schema.d.ts')));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
writeFileSync(resolve(root, 'api/openapi.yaml'), spec);
writeFileSync(resolve(root, 'api/SPEC_REF'), `${sha}\n`);
console.log(`api/openapi.yaml <- ${repo} @ ${ref} (${sha})`);
