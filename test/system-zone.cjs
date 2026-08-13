// Regression tests for host-zone resolution. The host zone is resolved once
// on first use (mid-session zone changes are out of scope by design), but
// resolution must go through the patchable Intl surface so that test
// harnesses which pin the zone — by patching Date/Intl before the app runs —
// are honored, including on runtimes with native Temporal. Each scenario
// mutates process state, so every one runs in its own subprocess.
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

const PRELUDE = `
globalThis.Temporal = require(${JSON.stringify(
    path.join(root, 'node_modules/@js-temporal/polyfill')
)}).Temporal;
const t = 1767225600000; // 2026-01-01T00:00:00Z
`;

function runIsolated(code, tz) {
    return execFileSync(process.execPath, ['-e', PRELUDE + code], {
        env: { ...process.env, TZ: tz },
        cwd: root,
        encoding: 'utf8',
    }).trim();
}

let pass = 0;
function check(actual, expected, label) {
    assert.strictEqual(actual, expected, label + ': got ' + actual);
    pass++;
}

// --- 1. Date/Intl host-zone mock (replay-harness style) ---------------------
// A harness pins the recording's zone by patching default-zone Intl
// resolution (and Date) before the app boots. The library must resolve the
// host zone through the mock, not the real host. Explicit { timeZone }
// formatter requests pass through untouched (zone math by id). Covers every
// systemZoneId() consumer: format('Z'), utcOffset(), field getters, and
// wall-clock (array) construction.
const out1 = runIsolated(
    `
const RealDTF = Intl.DateTimeFormat;
function MockDTF(locale, opts) {
    const inst = new RealDTF(locale, opts);
    if (!opts || !opts.timeZone) {
        const orig = inst.resolvedOptions.bind(inst);
        inst.resolvedOptions = () => Object.assign(orig(), { timeZone: 'Asia/Tokyo' });
    }
    return inst;
}
MockDTF.prototype = RealDTF.prototype;
MockDTF.supportedLocalesOf = RealDTF.supportedLocalesOf.bind(RealDTF);
Intl.DateTimeFormat = MockDTF;
Date.prototype.getTimezoneOffset = function () { return -540; };

const moment = require(${JSON.stringify(root)});
console.log([
    moment(t).format('Z'),
    moment(t).format('YYYY-MM-DD HH:mm'),
    moment(t).utcOffset(),
    moment(t).hours(),
    moment(t).date(),
    moment([2026, 0, 1]).format('Z'),
    moment.tz.guess(true),
].join('|'));
`,
    'America/New_York'
).split('|');

check(out1[0], '+09:00', 'Date/Intl mock: format(Z) follows the mock');
check(out1[1], '2026-01-01 09:00', 'Date/Intl mock: wall time follows');
check(out1[2], '540', 'Date/Intl mock: utcOffset() follows');
check(out1[3], '9', 'Date/Intl mock: hours() getter follows');
check(out1[4], '1', 'Date/Intl mock: date() getter follows');
check(out1[5], '+09:00', 'Date/Intl mock: array construction follows');
check(out1[6], 'Asia/Tokyo', 'Date/Intl mock: guess(true) follows');

// --- 2. TZ env is respected at first use ------------------------------------
const out2 = runIsolated(
    `
const moment = require(${JSON.stringify(root)});
console.log([moment(t).format('Z'), moment(t).format('YYYY-MM-DD HH:mm')].join('|'));
`,
    'Asia/Tokyo'
).split('|');
check(out2[0], '+09:00', 'TZ env: offset');
check(out2[1], '2026-01-01 09:00', 'TZ env: wall time');

// --- 3. host-zone DST transitions within a session keep working -------------
const out3 = runIsolated(
    `
const moment = require(${JSON.stringify(root)});
console.log([moment('2026-01-15').format('Z'), moment('2026-07-15').format('Z')].join('|'));
`,
    'America/New_York'
).split('|');
check(out3[0], '-05:00', 'NY winter offset');
check(out3[1], '-04:00', 'NY summer offset');

console.log('system-zone: ' + pass + ' checks passed');
