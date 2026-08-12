// Vendors ONLY compatibility fixtures from upstream checkouts:
//   - moment's test suites (the behavioral contract this library implements)
//   - moment's locale configuration files (translation data, MIT, attribution kept)
//   - moment-timezone's test suites and packed tz data (test fixtures / opt-in data,
//     never imported by the library entry points)
// The engine itself is NOT vendored — it is reimplemented on the Temporal API.
//
// Usage: node scripts/vendor.mjs /path/to/moment-checkout /path/to/moment-timezone-checkout
import { cpSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const momentSrc = process.argv[2];
const tzSrc = process.argv[3];

if (!momentSrc || !tzSrc) {
  console.error('usage: node scripts/vendor.mjs <moment-checkout> <moment-timezone-checkout>');
  process.exit(1);
}

// --- moment: tests + locale data (same relative layout as upstream src/) ---
cpSync(join(momentSrc, 'src', 'test'), join(root, 'src', 'test'), { recursive: true });
cpSync(join(momentSrc, 'src', 'locale'), join(root, 'src', 'locale'), { recursive: true });

// Rewrite extensionless relative ESM imports to explicit .js so the files run
// natively in Node. Test/locale content is otherwise untouched.
const importRe = /(from\s+|import\s+)(['"])(\.[^'"]+)\2/g;
function rewrite(file) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(importRe, (m, kw, q, path) =>
    /\.(js|json|mjs|cjs)$/.test(path) ? m : `${kw}${q}${path}.js${q}`
  );
  if (after !== before) writeFileSync(file, after);
}
function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, fn);
    else if (p.endsWith('.js')) fn(p);
  }
}
walk(join(root, 'src', 'test'), rewrite);
walk(join(root, 'src', 'locale'), rewrite);

// src/ must be ESM regardless of the root package type.
writeFileSync(join(root, 'src', 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');

// --- moment-timezone: tests (CJS nodeunit style, untouched) + packed data ---
mkdirSync(join(root, 'test'), { recursive: true });
cpSync(join(tzSrc, 'tests'), join(root, 'test', 'tz'), { recursive: true });
cpSync(join(tzSrc, 'data'), join(root, 'data'), { recursive: true });

console.log('vendored ok');
