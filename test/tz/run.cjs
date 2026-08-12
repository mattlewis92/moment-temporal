// Nodeunit-compatible runner for the vendored moment-timezone test suites.
// Mirrors upstream's environment: tests run against the built package root
// with the packed tzdata fixture loaded (upstream's index.js ships data
// preloaded; here the runner loads the same data explicitly).
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const moment = require(root); // installs Temporal polyfill if needed
const data = require(path.join(root, 'data/packed/latest.json'));

// Same execution order as upstream's Gruntfile (zones, countries, core):
// the core suite mutates the shared registries (names.js clears them), so it
// must run last, exactly as it does upstream.
const suites = ['zones', 'countries', 'moment-timezone'];
const files = [];
for (const suite of suites) {
    collect(path.join(__dirname, suite));
}
function collect(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) {
            collect(p);
        } else if (p.endsWith('.js')) {
            files.push(p);
        }
    }
}

let pass = 0,
    fail = 0;
const failures = [];

function makeT(name) {
    let count = 0,
        expected = null,
        doneCalled = false;
    const record = (fn) => {
        count++;
        fn();
    };
    return {
        expect(n) {
            expected = n;
        },
        ok(v, msg) {
            record(() => assert.ok(v, msg));
        },
        equal(a, b, msg) {
            record(() => assert.equal(a, b, msg));
        },
        notEqual(a, b, msg) {
            record(() => assert.notEqual(a, b, msg));
        },
        strictEqual(a, b, msg) {
            record(() => assert.strictEqual(a, b, msg));
        },
        deepEqual(a, b, msg) {
            record(() => assert.deepEqual(a, b, msg));
        },
        throws(fn, msg) {
            record(() => assert.throws(fn, undefined, msg));
        },
        doesNotThrow(fn, msg) {
            record(() => assert.doesNotThrow(fn, undefined, msg));
        },
        done() {
            doneCalled = true;
            if (expected !== null && expected !== count) {
                throw new Error(
                    name +
                        ': expected ' +
                        expected +
                        ' assertions, got ' +
                        count
                );
            }
        },
        get _done() {
            return doneCalled;
        },
    };
}

function runTest(name, fn, group) {
    const t = makeT(name);
    try {
        if (group && group.setUp) {
            let ok = false;
            group.setUp(() => (ok = true));
            if (!ok) throw new Error('async setUp is not supported');
        }
        fn(t);
        if (!t._done) {
            throw new Error('test.done() was not called');
        }
        if (group && group.tearDown) {
            let ok = false;
            group.tearDown(() => (ok = true));
            if (!ok) throw new Error('async tearDown is not supported');
        }
        pass++;
    } catch (e) {
        fail++;
        failures.push({ name, error: e });
    }
}

function runGroup(prefix, group) {
    for (const key of Object.keys(group)) {
        if (key === 'setUp' || key === 'tearDown') continue;
        const value = group[key];
        const name = prefix + ' > ' + key;
        if (typeof value === 'function') {
            runTest(name, value, group);
        } else if (value && typeof value === 'object') {
            runGroup(name, value);
        }
    }
}

const only = process.argv[2]; // optional substring filter

for (const file of files) {
    const rel = path.relative(__dirname, file);
    if (only && !rel.includes(only)) continue;
    // Fresh fixture data before every file: mirrors upstream where index.js
    // always has data loaded, while letting registry-clearing tests
    // (names.js) stay isolated.
    moment.tz.load(data);
    const mod = require(file);
    runGroup(rel, mod);
}

console.log('pass ' + pass + ' fail ' + fail);
for (const f of failures.slice(0, 20)) {
    console.log('\n✖ ' + f.name);
    console.log(
        String((f.error && (f.error.stack || f.error.message)) || f.error)
            .split('\n')
            .slice(0, 6)
            .join('\n')
    );
}
if (failures.length > 20) {
    console.log('\n… and ' + (failures.length - 20) + ' more failures');
}
process.exit(fail ? 1 : 0);
