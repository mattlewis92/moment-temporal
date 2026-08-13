// Regression tests for the zero-data Temporal fallback layer: tz.guess()
// host-zone handling and zone abbreviation quality. These cover bugs found
// in real-app testing that the ported upstream suites don't reach (upstream
// always runs with data loaded).
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

if (!globalThis.Temporal) {
    globalThis.Temporal = require('@js-temporal/polyfill').Temporal;
}
const moment = require(root);

let pass = 0;
function check(actual, expected, label) {
    assert.strictEqual(actual, expected, label + ': ' + actual);
    pass++;
}

// --- tz.guess() must work in every host zone, including short names -------
// (guess reads host state at process start, so each zone gets a subprocess)
function guessIn(tz) {
    return execFileSync(
        process.execPath,
        [
            '-e',
            `globalThis.Temporal = require('@js-temporal/polyfill').Temporal;
             const moment = require(${JSON.stringify(root)});
             const g = moment.tz.guess();
             // must chain: a real app does moment().tz(guess()).format()
             process.stdout.write(g + '|' + moment().tz(g).format('Z'));`,
        ],
        { env: { ...process.env, TZ: tz }, cwd: root, encoding: 'utf8' }
    ).split('|');
}

check(guessIn('UTC')[0], 'UTC', 'guess under TZ=UTC');
check(guessIn('UTC')[1], '+00:00', 'guess under TZ=UTC chains into .tz()');
check(guessIn('GMT')[0], 'UTC', 'guess under TZ=GMT normalizes to UTC');
check(
    guessIn('Europe/London')[0],
    'Europe/London',
    'guess under TZ=Europe/London'
);
check(
    guessIn('Pacific/Auckland')[0],
    'Pacific/Auckland',
    'guess under TZ=Pacific/Auckland'
);

// --- zone abbreviations without loaded data --------------------------------
// CLDR keeps alphabetic short names in region-matched locales; the fallback
// must find them rather than degrading to numeric offsets.
function abbr(date, zone) {
    return moment.tz(date, zone).format('z');
}

check(abbr('2024-01-15', 'Pacific/Auckland'), 'NZDT', 'Auckland summer');
check(abbr('2024-07-15', 'Pacific/Auckland'), 'NZST', 'Auckland winter');
check(abbr('2024-01-15', 'America/St_Johns'), 'NST', 'Newfoundland winter');
check(abbr('2024-07-15', 'America/St_Johns'), 'NDT', 'Newfoundland summer');
check(abbr('2024-01-15', 'Australia/Sydney'), 'AEDT', 'Sydney summer');
check(abbr('2024-07-15', 'Australia/Sydney'), 'AEST', 'Sydney winter');
check(abbr('2024-01-15', 'America/New_York'), 'EST', 'New York winter');
check(abbr('2024-07-15', 'America/New_York'), 'EDT', 'New York summer');
check(abbr('2024-01-15', 'Asia/Kolkata'), 'IST', 'Kolkata');
check(abbr('2024-01-15', 'Europe/London'), 'GMT', 'London winter');
check(abbr('2024-07-15', 'Europe/London'), 'BST', 'London summer');
check(abbr('2024-01-15', 'UTC'), 'UTC', 'UTC');

// zones with no CLDR abbreviation anywhere keep the tzdata numeric form
assert.match(
    abbr('2024-01-15', 'Asia/Dubai'),
    /^(\+04|GST)$/,
    'Dubai: numeric or GST'
);
pass++;

// --- invalid inputs with a default zone set ---------------------------------
// updateOffset runs on every construction; the Temporal-backed zone must
// tolerate the NaN timestamps invalid moments carry instead of letting
// Temporal.Instant throw. Upstream moment-timezone returns isValid=false
// for all of these.
const oldSuppress = moment.suppressDeprecationWarnings;
moment.suppressDeprecationWarnings = true; // 'garbage' hits the Date fallback
moment.tz.setDefault('America/New_York');
try {
    for (const [label, input] of [
        ['new Date(NaN)', new Date(NaN)],
        ["new Date('garbage')", new Date('garbage')],
        ['NaN', NaN],
        ["'garbage'", 'garbage'],
    ]) {
        const m = moment(input);
        check(m.isValid(), false, 'invalid moment with default zone: ' + label);
        check(m.format(), 'Invalid date', 'formats as Invalid date: ' + label);
    }
    // invalid moments through the explicit .tz() path must not throw either
    const inv = moment(NaN).tz('America/New_York');
    check(inv.isValid(), false, 'invalid moment via .tz()');
    check(inv.zoneAbbr(), '', 'invalid moment zoneAbbr');
    check(
        isNaN(moment.tz.zone('America/New_York').parse(NaN)),
        true,
        'zone.parse(NaN) is NaN'
    );
} finally {
    moment.tz.setDefault(null);
    moment.suppressDeprecationWarnings = oldSuppress;
}

console.log('tz-fallback: ' + pass + ' checks passed');
