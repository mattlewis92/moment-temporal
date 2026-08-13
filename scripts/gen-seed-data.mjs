// Generates src/tz/seed-data.js from data/packed/latest.json: the zone NAME
// list and link pairs only — no offset/transition timelines (those come
// from the host via Temporal) and no country data (tz.countries() et al.
// keep requiring loaded data). This is what lets tz.names() match
// upstream's data-shipping entry point.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(
    readFileSync(join(root, 'data/packed/latest.json'), 'utf8')
);

const zoneNames = data.zones.map((z) => z.split('|')[0]);

const out = `// Generated from data/packed/latest.json (tzdata ${data.version})
// by scripts/gen-seed-data.mjs — do not edit by hand.
//
// Names and links only: no offset/transition timelines are shipped. Zone
// math resolves through the host's IANA database (Temporal).
export var seedVersion = ${JSON.stringify(data.version)};
export var zoneNames = ${JSON.stringify(zoneNames)};
export var links = ${JSON.stringify(data.links)};
`;

writeFileSync(join(root, 'src/tz/seed-data.js'), out);
console.log(
    'seed-data.js: ' +
        zoneNames.length +
        ' zones, ' +
        data.links.length +
        ' links, ' +
        (out.length / 1024).toFixed(1) +
        'KB raw'
);
