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

| consumer bundle (tsdown, minified ESM)                    |     raw |    gzip |
| ---------------------------------------------------------- | ------: | ------: |
| `moment` + `moment-timezone` (with data)                    |  781 KB | 58.7 KB |
| **`moment-temporal`**                                       | **73 KB** | **24.5 KB** |
| `@js-temporal/polyfill`, if your targets need one (opt-in)  | +163 KB | +47 KB |
| each additional locale (e.g. `de`)                          | +1.6 KB | +0.7 KB |

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
  are shipping it). Nothing to do, nothing extra to ship.
- **Everywhere else**: bring your own polyfill — none is installed by
  default (`@js-temporal/polyfill` is an *optional* peer dependency). Either
  install any Temporal polyfill and assign `globalThis.Temporal` yourself
  (e.g. [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill)
  is a lighter alternative), or install
  [`@js-temporal/polyfill`](https://github.com/js-temporal/temporal-polyfill)
  and use the built-in hookup:
  - CJS: `require('moment-temporal')` picks it up automatically when it is
    installed;
  - ESM: `import 'moment-temporal/polyfill'` before the library.

Without `globalThis.Temporal` the library throws a descriptive error on first
use. The full bundle-size win arrives with native Temporal (already in
Firefox and Node 25, in progress in Chrome/Safari) — there you ship no
polyfill at all.

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

### Does it still ship IANA data?

The tz data *files* are included in the npm package on disk (`data/`), purely
for compatibility — **no entry point ever imports them**, so they are never
in your bundle and never parsed at runtime. All timezone math works without
them because the runtime's own IANA database (the one `Intl` uses, kept
current by OS/browser updates) supplies offsets and transitions through
Temporal.

"Loaded data" means you explicitly opted in, exactly like upstream's
data-loading API:

```js
moment.tz.load(require('moment-timezone/data/packed/latest.json'));
```

Doing so restores byte-for-byte upstream behavior where the divergences below
matter (name/country enumeration, tzdata abbreviation strings) — at upstream's
bundle cost.

### Documented divergences (without loaded data)

- `moment.tz.names()` and `moment.tz.countries()` enumerate the *loaded*
  registry — they return `[]` when nothing was loaded (upstream's default
  entry preloads every name). Any zone still resolves directly by name; for
  enumeration without data, `Intl.supportedValuesOf('timeZone')` is the
  platform's list. Zone→country mappings aren't exposed by any web API, so
  `zone.countries()`/`zonesForCountry()` genuinely need loaded data.
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

### Why locale files instead of Intl?

`Intl` can render localized month and weekday names, and
`Intl.RelativeTimeFormat` covers some relative time — but moment's locale
behavior is *not* CLDR, and a drop-in replacement has to reproduce moment's
exact strings (the 3262 ported locale tests pin them). Locale files carry
what `Intl` cannot supply:

- moment's community-authored phrasing — `"vor ein paar Sekunden"`, where
  `Intl` would say `"vor 3 Sekunden"`;
- calendar phrases (`"Last Monday at 8:30 PM"`) and per-locale `L`/`LL`/`LLL`
  long-format patterns;
- ordinal suffix strings (`"31st"`, `"1er"` — `Intl.PluralRules` classifies
  ordinals but provides no suffixes);
- **parsing** tables: turning `"3 de enero"` or Arabic-digit input back into a
  date, with moment's exact strict/lenient rules, `preparse`/`postformat`
  digit maps, meridiem tables, locale week rules (`dow`/`doy`), and eras.

They're opt-in and tree-shaken: you pay ~0.7 KB gzipped per locale you
actually import; `en` is built in.

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
npm run build    # tsdown (rolldown): root CJS bundles, CJS locales, browser builds, ESM dist
npm test         # build + all four suites + tzdata validation
```

## License

MIT. This project reimplements the APIs of, and vendors locale data and test
suites from, [moment](https://github.com/moment/moment) and
[moment-timezone](https://github.com/moment/moment-timezone) — both MIT,
(c) JS Foundation and other contributors. See `THIRD-PARTY-NOTICES.md`.
