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

console.log('tz-fallback: ' + pass + ' checks passed');
