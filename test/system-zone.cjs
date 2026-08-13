// Regression tests for host-zone resolution: the library must observe the
// *current* host time zone on every local-time operation, like upstream
// moment does through Date prototype methods — not latch the zone that was
// current on first use. Each scenario mutates process state (TZ env, Date /
// Intl patches), so every one runs in its own subprocess.
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

const PRELUDE = `
globalThis.Temporal = require(${JSON.stringify(
    path.join(root, 'node_modules/@js-temporal/polyfill')
)}).Temporal;
const moment = require(${JSON.stringify(root)});
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

// --- 1. host zone changes mid-process (TZ env) ------------------------------
// Covers every systemZoneId() consumer: format('Z'), utcOffset(), field
// getters, and wall-clock (array) construction.
const out1 = runIsolated(
    `
const before = moment(t).format('Z');
process.env.TZ = 'Asia/Tokyo';
console.log([
    before,
    moment(t).format('Z'),
    moment(t).format('YYYY-MM-DD HH:mm'),
    moment(t).utcOffset(),
    moment(t).hours(),
    moment(t).date(),
    moment([2026, 0, 1]).format('Z'),
].join('|'));
`,
    'America/New_York'
).split('|');

check(out1[0], '-05:00', 'zone change: offset before switch');
check(out1[1], '+09:00', 'zone change: format(Z) follows');
check(out1[2], '2026-01-01 09:00', 'zone change: local wall time follows');
check(out1[3], '540', 'zone change: utcOffset() follows');
check(out1[4], '9', 'zone change: hours() getter follows');
check(out1[5], '1', 'zone change: date() getter follows');
check(out1[6], '+09:00', 'zone change: array construction follows');

// --- 2. Date/Intl host-zone mock (replay-harness style) ---------------------
// A harness pins the recording's zone by patching Date#getTimezoneOffset and
// default-zone Intl resolution. The library must follow the mock. Explicit
// { timeZone } formatter requests pass through untouched (zone math by id).
const out2 = runIsolated(
    `
// warm the cache in the real host zone first — the mock must displace it
moment(t).format('Z');

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

console.log([
    moment(t).format('Z'),
    moment(t).format('YYYY-MM-DD HH:mm'),
    moment(t).hours(),
    moment.tz.guess(true),
].join('|'));
`,
    'America/New_York'
).split('|');

check(out2[0], '+09:00', 'Date/Intl mock: format(Z) follows the mock');
check(out2[1], '2026-01-01 09:00', 'Date/Intl mock: wall time follows');
check(out2[2], '9', 'Date/Intl mock: hours() follows');
check(out2[3], 'Asia/Tokyo', 'Date/Intl mock: guess(true) follows');

// --- 3. host-zone DST transitions keep working (cache refresh is benign) ----
const out3 = runIsolated(
    `
console.log([moment('2026-01-15').format('Z'), moment('2026-07-15').format('Z')].join('|'));
`,
    'America/New_York'
).split('|');
check(out3[0], '-05:00', 'NY winter offset');
check(out3[1], '-04:00', 'NY summer offset');

console.log('system-zone: ' + pass + ' checks passed');
