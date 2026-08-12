// Builds the distributable entry points with tsdown (rolldown).
//
// Root files mirror moment-timezone's package layout so this package works as
// a drop-in npm alias replacement:
//   index.js                  CJS entry (Temporal polyfill hookup, no tz data)
//   moment-timezone.js        CJS bundle: moment core + tz layer, zero tzdata
//   moment-timezone-utils.js  CJS: pack/filter utilities attached to the above
//   locale/*.js               CJS locales (lazy-required by moment.locale())
//   builds/*.js               browser IIFE builds (with and without data)
//   dist/moment-timezone.esm.js  single-file ESM bundle (CDN use)
import { build } from 'tsdown';
import {
    readFileSync,
    writeFileSync,
    mkdirSync,
    readdirSync,
    copyFileSync,
    rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.tsdown');
rmSync(tmp, { recursive: true, force: true });

const banner = `//! moment-temporal
//! moment + moment-timezone reimplemented on the Temporal API — no bundled tz data
//! moment.js and moment-timezone are (c) JS Foundation and contributors, MIT
`;

// require('moment-timezone') must yield the moment function itself, exactly
// like upstream's UMD build (which also tolerates a .default property).
const cjsDefaultInterop = `
module.exports = module.exports.default;
module.exports.default = module.exports;
`;

// The IIFE global must be the callable moment function regardless of the
// export mode rolldown picks, and script-tag consumers may read .default.
const iifeDefaultInterop = `
;moment = moment && moment.default ? moment.default : moment;
moment.default = moment;
`;

const forceJs = { js: '.js' };

async function run(opts) {
    await build({
        config: false,
        dts: false,
        clean: true,
        target: 'es2020',
        outExtensions: () => forceJs,
        ...opts,
    });
}

// --- root moment-timezone.js (CJS, self-contained except lazy locales) -----
await run({
    entry: { 'moment-timezone': join(root, 'src/tz/moment-timezone.js') },
    format: 'cjs',
    platform: 'node',
    outDir: join(tmp, 'root'),
    outputOptions: {
        banner,
        footer: cjsDefaultInterop,
        exports: 'named',
    },
});
copyFileSync(join(tmp, 'root', 'moment-timezone.js'), join(root, 'moment-timezone.js'));

// --- root moment-timezone-utils.js (attaches to the sibling bundle) --------
await run({
    entry: {
        'moment-timezone-utils': join(root, 'src/tz/moment-timezone-utils.js'),
    },
    format: 'cjs',
    platform: 'node',
    outDir: join(tmp, 'utils'),
    deps: { neverBundle: [/\.\/moment-timezone\.js$/] },
    outputOptions: {
        banner,
        footer: cjsDefaultInterop,
        exports: 'named',
    },
});
copyFileSync(
    join(tmp, 'utils', 'moment-timezone-utils.js'),
    join(root, 'moment-timezone-utils.js')
);

// --- root index.js ----------------------------------------------------------
// Requires globalThis.Temporal: native on modern runtimes; on older ones,
// install a Temporal polyfill of your choice and assign globalThis.Temporal
// before loading this module.
writeFileSync(
    join(root, 'index.js'),
    banner + `module.exports = require('./moment-timezone.js');\n`
);

// --- CJS locales (lazy-loaded by moment.locale() in Node) -------------------
await run({
    entry: [join(root, 'src/locale/*.js')],
    format: 'cjs',
    platform: 'node',
    outDir: join(tmp, 'locale'),
    // each locale stays a single flat file binding to the root bundle
    deps: { neverBundle: [/\.\.\/moment\.js$/] },
    outputOptions: { exports: 'named' },
});
const localeDir = join(root, 'locale');
rmSync(localeDir, { recursive: true, force: true });
mkdirSync(localeDir, { recursive: true });
for (const f of readdirSync(join(tmp, 'locale'))) {
    if (!f.endsWith('.js')) continue;
    // '../moment.js' must resolve to the root CJS bundle at runtime
    writeFileSync(
        join(localeDir, f),
        readFileSync(join(tmp, 'locale', f), 'utf8').replace(
            /require\((['"])\.\.\/moment\.js\1\)/g,
            "require('../moment-timezone.js')"
        )
    );
}

// --- browser builds ----------------------------------------------------------
mkdirSync(join(root, 'builds'), { recursive: true });

async function browserBuild(outfile, { withData, minify }) {
    const dataFooter = withData
        ? `\nmoment.tz.load(${readFileSync(
              join(root, 'data/packed/latest.json'),
              'utf8'
          ).trim()});\n`
        : '';
    await run({
        entry: { 'moment-timezone': join(root, 'src/tz/moment-timezone.js') },
        format: 'iife',
        platform: 'browser',
        globalName: 'moment',
        minify: !!minify,
        outDir: join(tmp, 'iife'),
        outputOptions: {
            banner,
            footer: iifeDefaultInterop + dataFooter,
            exports: 'named',
        },
    });
    // tsdown names iife output <name>.iife.js regardless of outExtensions
    copyFileSync(
        join(tmp, 'iife', 'moment-timezone.iife.js'),
        join(root, 'builds', outfile)
    );
}

await browserBuild('moment-timezone.js', {});
await browserBuild('moment-timezone.min.js', { minify: true });
await browserBuild('moment-timezone-with-data.js', { withData: true });
await browserBuild('moment-timezone-with-data.min.js', {
    withData: true,
    minify: true,
});

// --- ESM dist (single-file, for CDN use) ------------------------------------
await run({
    entry: { 'moment-timezone.esm': join(root, 'src/tz/moment-timezone.js') },
    format: 'esm',
    platform: 'neutral',
    outDir: join(tmp, 'esm'),
    outputOptions: { banner },
});
mkdirSync(join(root, 'dist'), { recursive: true });
copyFileSync(
    join(tmp, 'esm', 'moment-timezone.esm.js'),
    join(root, 'dist', 'moment-timezone.esm.js')
);

rmSync(tmp, { recursive: true, force: true });
console.log('build ok');
