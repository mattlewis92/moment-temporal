# moment-temporal

A drop-in replacement for **moment + moment-timezone**, reimplemented on the
[Temporal API](https://tc39.es/proposal-temporal/docs/). Full API and
test-suite compatibility with `moment@2.30.1` and `moment-timezone@0.6.3` —
with **zero bundled timezone data**: timezone math comes from the host's IANA
database through `Temporal` and `Intl`.

```jsonc
// package.json — drop-in via npm alias
{
  "dependencies": {
    "moment-timezone": "npm:moment-temporal"
  }
}
```

```js
const moment = require('moment-timezone'); // now moment-temporal
moment.tz('2024-07-04 12:00', 'America/New_York').format(); // "2024-07-04T12:00:00-04:00"
```

It also replaces plain `moment` (the default export *is* a full moment):
`"moment": "npm:moment-temporal"`.

## Why

| consumer bundle (esbuild, minified ESM)       |     raw |    gzip |
| --------------------------------------------- | ------: | ------: |
| `moment` + `moment-timezone` (with data)       |  783 KB | 59.2 KB |
| **`moment-temporal`**                          | **74 KB** | **24.5 KB** |
| `moment-temporal` + bundled Temporal polyfill  |  237 KB | 71.5 KB |
| each additional locale (e.g. `de`)             | +1.5 KB | +0.7 KB |

- **No timezone data in your bundle.** Offsets, transitions and DST rules come
  from the runtime's own IANA database (the same one `Intl.DateTimeFormat`
  uses), via `Temporal.ZonedDateTime`.
- **Real ESM with tree-shakeable, opt-in locales** (`import 'moment-temporal/locale/de'`),
  while the CJS entry keeps moment's classic lazy `moment.locale('de')`
  auto-loading in Node.
- **All date/calendar math runs on Temporal** — legacy `Date` is kept only as
  an inert epoch-milliseconds container (`_d`) for internals compatibility.

## Temporal runtime requirement

The library needs `globalThis.Temporal`:

- **Available natively**: Node ≥ 25 (and recent Deno / Firefox; other engines
  are shipping it).
- **Everywhere else**: the [`@js-temporal/polyfill`](https://github.com/js-temporal/temporal-polyfill)
  is a regular dependency.
  - the CJS entry (`require('moment-temporal')`) installs it automatically
    when `globalThis.Temporal` is missing;
  - ESM users on older runtimes import the tiny installer entry first:
    `import 'moment-temporal/polyfill'`.

The polyfill costs ~47 KB gzipped in a browser bundle, so the full bundle-size
win arrives with native Temporal (already in Firefox, in progress in
Chrome/Safari, shipped in Node 25). On runtimes with native Temporal you pay
nothing.

## Compatibility

The ported upstream test suites are the compatibility contract, running
verbatim against this implementation:

| suite                                       | result |
| ------------------------------------------- | ------ |
| moment core (52 files, ~17k assertions)      | **626/626 tests pass** |
| moment locales (139 files, 138 locales)      | **3262/3262 tests pass** |
| moment-timezone (core + 340 zones + countries) | **112,193 assertions pass** |
| Temporal-fallback vs real tzdata (2025b)     | **239,986 offset checks, 0 mismatches** |

Run them with `npm test`.

`moment.version` reports `2.30.1` and `moment.tz.version` reports `0.6.3`,
so version sniffing by dependents keeps working.

### How zone resolution works

1. `tz.add()` / `tz.load()` packed data, when you load any, always wins —
   the full moment-timezone data pipeline (`unpack`, `pack`, `link`,
   `filterYears`, `moment-timezone-utils`, …) is implemented and tested.
2. Otherwise the zone name is resolved case-insensitively against the host's
   IANA database and served by a Temporal-backed `Zone` object with the same
   interface (`utcOffset`, `abbr`, `parse`, `untils`, `offsets`, `abbrs`,
   `population`), including moment-timezone's exact
   `moveInvalidForward`/`moveAmbiguousForward` DST disambiguation semantics.

`data/` ships in the npm package (it is **never** imported by the entry
points, so it costs bundles nothing): `require('moment-timezone/data/packed/latest.json')`
keeps working, and loading it restores byte-for-byte upstream behavior where
the divergences below matter.

### Documented divergences (without loaded data)

- `moment.tz.names()` and `moment.tz.countries()` list only *loaded* data —
  they return `[]` when nothing was loaded (the upstream default entry ships
  with all names preloaded). Zone→country mappings aren't exposed by `Intl`,
  so `zone.countries()` also needs loaded data.
- Zone **abbreviations** (`z`/`zz` tokens) are ICU-derived: familiar ones like
  `EST`/`EDT`/`GMT`/`BST` match tzdata, but zones for which ICU only offers a
  localized GMT offset render numerically (`+04`, `+0530`, `AEDT` → `+11`).
  Offsets and instants are always correct; load data if you need tzdata's
  exact abbreviation strings.
- `zone.untils/offsets/abbrs` arrays of fallback zones are materialized
  lazily over 1800–2040 (`parse()`/`utcOffset()` remain correct outside that
  horizon).
- Timezone data reflects the *host's* tzdb version, which may differ from the
  latest IANA release (usually newer than what an app was shipping!).

### Architectural notes

- `src/lib/` — the moment engine. The parsing/formatting/locale layer (token
  tables, regexes, locale configs) follows moment's MIT-licensed
  implementation closely — it *is* the API contract the tests encode. Every
  Date-based time computation (field get/set, wall-clock construction,
  `add`/`startOf`/`diff` calendar math, week calendars, offsets) is
  reimplemented in `src/lib/temporal.js` + the modules that consume it.
- `src/tz/` — moment-timezone reimplemented as ESM: the packed-data engine,
  plus the Temporal-backed fallback zones (`temporal-zone.js`).
- `src/locale/` — moment's 138 locale definitions, vendored as data (MIT,
  headers preserved).
- `src/test/`, `test/tz/` — upstream test suites, vendored verbatim, running
  on `node:test` (QUnit shim) and a nodeunit-compatible runner.

## Development

```bash
npm run vendor   # re-vendor tests/locales/data from upstream checkouts
npm run build    # root CJS bundles, CJS locales, browser builds, ESM dist
npm test         # build + all four suites + tzdata validation
```

## License

MIT. This project reimplements the APIs of, and vendors locale data and test
suites from, [moment](https://github.com/moment/moment) and
[moment-timezone](https://github.com/moment/moment-timezone) — both MIT,
(c) JS Foundation and other contributors. See `THIRD-PARTY-NOTICES.md`.
