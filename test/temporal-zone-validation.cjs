// Validates the zero-data Temporal fallback zones against real tzdata.
//
// For every zone in the packed 2025c fixture, builds a packed-data Zone
// (without loading it into the registry, so moment.tz.zone() serves the
// Temporal-backed fallback) and compares utcOffset() at every transition
// boundary (±1ms) plus parse() disambiguation around each transition.
//
// The host's ICU tzdata version and the fixture version may differ slightly
// (historical corrections, freshly-announced rule changes), so the suite
// asserts a >= 99.9% agreement rate rather than exact equality, and prints
// every disagreement for inspection.
'use strict';

// The library takes no polyfill stance; the test environment supplies one.
if (!globalThis.Temporal) {
    globalThis.Temporal = require('@js-temporal/polyfill').Temporal;
}

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const moment = require(root);

// Prefer the packed data matching the host's own tzdata version — that
// isolates implementation fidelity from tz database version skew. Fall back
// to the latest fixture (lenient threshold) when no exact match is vendored.
const hostVersionFile = path.join(
    root,
    'data/packed/' + (process.versions.tz || '') + '.json'
);
const exactMatch = fs.existsSync(hostVersionFile);
const data = require(
    exactMatch ? hostVersionFile : path.join(root, 'data/packed/latest.json')
);
const threshold = exactMatch ? 0.0005 : 0.005;

console.log(
    'fixture tzdata: ' +
        data.version +
        ', host tzdata: ' +
        (process.versions.tz || 'unknown') +
        ', icu: ' +
        (process.versions.icu || 'unknown')
);

let checks = 0,
    mismatches = 0,
    parseChecks = 0,
    parseMismatches = 0,
    unresolved = [];
const details = [];

function close(a, b) {
    return Math.abs(a - b) < 1e-6;
}

for (const packed of data.zones) {
    const ref = new moment.tz.Zone(packed);
    const zone = moment.tz.zone(ref.name); // Temporal fallback (no data loaded)
    if (!zone || !zone._zoneId) {
        unresolved.push(ref.name);
        continue;
    }
    const untils = ref.untils;
    for (let i = 0; i < untils.length; i++) {
        const u = untils[i];
        if (!isFinite(u)) {
            continue;
        }
        for (const t of [u - 1, u]) {
            checks++;
            if (!close(ref.utcOffset(t), zone.utcOffset(t))) {
                mismatches++;
                if (details.length < 50) {
                    details.push(
                        ref.name +
                            ' @ ' +
                            new Date(t).toISOString() +
                            ' packed=' +
                            ref.utcOffset(t) +
                            ' temporal=' +
                            zone.utcOffset(t)
                    );
                }
            }
        }
        // parse(): wall-clock disambiguation just around the transition
        // (30 min before/after in "local fields encoded as UTC" space)
        const offBefore = ref.utcOffset(u - 1);
        for (const flags of [
            { inv: true, amb: false }, // defaults
            { inv: false, amb: true },
        ]) {
            moment.tz.moveInvalidForward = flags.inv;
            moment.tz.moveAmbiguousForward = flags.amb;
            for (const dt of [-30, 30]) {
                const wall = u - offBefore * 60000 + dt * 60000;
                parseChecks++;
                if (!close(ref.parse(wall), zone.parse(wall))) {
                    parseMismatches++;
                    if (details.length < 50) {
                        details.push(
                            ref.name +
                                ' parse @ ' +
                                new Date(wall).toISOString() +
                                ' inv=' +
                                flags.inv +
                                ' amb=' +
                                flags.amb +
                                ' packed=' +
                                ref.parse(wall) +
                                ' temporal=' +
                                zone.parse(wall)
                        );
                    }
                }
            }
        }
        moment.tz.moveInvalidForward = true;
        moment.tz.moveAmbiguousForward = false;
    }
}

const offsetRate = mismatches / Math.max(checks, 1);
const parseRate = parseMismatches / Math.max(parseChecks, 1);

console.log(
    'zones: ' +
        data.zones.length +
        ' (unresolved by host: ' +
        unresolved.length +
        (unresolved.length ? ': ' + unresolved.slice(0, 10).join(', ') : '') +
        ')'
);
console.log(
    'offset checks: ' +
        checks +
        ', mismatches: ' +
        mismatches +
        ' (' +
        (offsetRate * 100).toFixed(4) +
        '%)'
);
console.log(
    'parse checks: ' +
        parseChecks +
        ', mismatches: ' +
        parseMismatches +
        ' (' +
        (parseRate * 100).toFixed(4) +
        '%)'
);
for (const d of details) {
    console.log('  ✖ ' + d);
}

const ok =
    unresolved.length === 0 &&
    offsetRate < threshold &&
    parseRate < threshold;
console.log(ok ? 'VALIDATION PASSED' : 'VALIDATION FAILED');
process.exit(ok ? 0 : 1);
