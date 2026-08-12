// The Temporal-backed Zone: a drop-in for moment-timezone's packed-data Zone
// that computes offsets, abbreviations and transitions from the host's IANA
// timezone database (via Temporal + Intl) instead of bundled data. This is
// what lets the library ship with zero timezone payload.

// Lazily built map of lowercase zone id -> canonically cased zone id.
var canonicalCaseMap = null;

function buildCaseMap() {
    var map = {},
        list,
        i;
    try {
        list = Intl.supportedValuesOf('timeZone');
    } catch (e) {
        list = [];
    }
    for (i = 0; i < list.length; i++) {
        map[list[i].toLowerCase()] = list[i];
    }
    // UTC is not always in supportedValuesOf
    map.utc = 'UTC';
    return map;
}

function isValidZoneId(id) {
    try {
        globalThis.Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(
            id
        );
        return true;
    } catch (e) {
        return false;
    }
}

// Resolve `name` (case-insensitively) to a zone id the host understands,
// preserving IANA canonical casing where known. Returns null when the host
// has no such zone.
export function resolveZoneId(name) {
    if (!name || typeof name !== 'string' || !globalThis.Temporal) {
        return null;
    }
    if (canonicalCaseMap === null) {
        canonicalCaseMap = buildCaseMap();
    }
    var lower = name.toLowerCase(),
        cased = canonicalCaseMap[lower];
    if (cased !== undefined) {
        return cased;
    }
    // Aliases absent from supportedValuesOf (e.g. US/Eastern): accept them
    // as typed if the host validates them, remembering the result.
    if (isValidZoneId(name)) {
        canonicalCaseMap[lower] = name;
        return name;
    }
    return null;
}

function zdtAt(ms, zoneId) {
    return globalThis.Temporal.Instant.fromEpochMilliseconds(ms)
        .toZonedDateTimeISO(zoneId);
}

// minutes west of UTC (moment-timezone's Zone convention), sub-minute
// precision preserved for the LMT era
function offsetWestAt(ms, zoneId) {
    return -zdtAt(ms, zoneId).offsetNanoseconds / 6e10;
}

function nextTransition(ms, zoneId) {
    var zdt = zdtAt(ms, zoneId),
        next;
    if (typeof zdt.getTimeZoneTransition === 'function') {
        next = zdt.getTimeZoneTransition('next');
        return next === null ? null : next.epochMilliseconds;
    }
    return null;
}


// Format an abbreviation the way tzdata does where Intl gives us a usable
// short name ("EST", "PDT"), and fall back to tzdata's numeric convention
// ("+0530", "-03") where Intl only offers a localized GMT offset.
var abbrFormatters = {};

function abbrAt(ms, zoneId) {
    var fmt = abbrFormatters[zoneId],
        parts,
        i,
        name = '';
    if (!fmt) {
        try {
            fmt = abbrFormatters[zoneId] = new Intl.DateTimeFormat('en-US', {
                timeZone: zoneId,
                timeZoneName: 'short',
            });
        } catch (e) {
            abbrFormatters[zoneId] = null;
        }
    }
    if (fmt) {
        parts = fmt.formatToParts(new Date(ms));
        for (i = 0; i < parts.length; i++) {
            if (parts[i].type === 'timeZoneName') {
                name = parts[i].value;
                break;
            }
        }
    }
    if (!name || name === 'GMT' || name === 'UTC') {
        return zoneId === 'UTC' || /^Etc\/UTC|^Etc\/Universal/i.test(zoneId)
            ? 'UTC'
            : name || numericAbbr(ms, zoneId);
    }
    // "GMT+5:30" / "GMT-4" style -> "+0530" / "-04"
    if (/^GMT[+-]/.test(name)) {
        return numericAbbr(ms, zoneId);
    }
    return name;
}

function numericAbbr(ms, zoneId) {
    var minutesEast = Math.round(-offsetWestAt(ms, zoneId)),
        sign = minutesEast < 0 ? '-' : '+',
        abs = Math.abs(minutesEast),
        hh = String(Math.floor(abs / 60)).padStart(2, '0'),
        mm = abs % 60;
    return sign + hh + (mm ? String(mm).padStart(2, '0') : '');
}

// Transition enumeration bounds: covers everything tzdata publishes
// (pre-1900 LMT eras through the rule-generated near future). Beyond the
// horizon, parse() switches to on-the-fly era reconstruction.
var ENUM_START = Date.UTC(1800, 0, 1),
    ENUM_END = Date.UTC(2040, 0, 1),
    MAX_TRANSITIONS = 2500,
    PARSE_WINDOW = 2 * 86400000, // 2 days ≫ any legal utc offset
    PARSE_LOOKBACK = 740 * 86400000; // two years

// The exact packed-data Zone.parse() scan (moment-timezone 0.6.3), including
// its offsetPrev-dependent gap handling, over {untils, offsets} era arrays.
function runParse(eras, target) {
    var flags = TemporalZone._flags,
        untils = eras.untils,
        offsets = eras.offsets,
        max = untils.length - 1,
        offset,
        offsetNext,
        offsetPrev,
        i;

    for (i = 0; i < max; i++) {
        offset = offsets[i];
        offsetNext = offsets[i + 1];
        offsetPrev = offsets[i ? i - 1 : i];

        if (offset < offsetNext && flags.moveAmbiguousForward) {
            offset = offsetNext;
        } else if (offset > offsetPrev && flags.moveInvalidForward) {
            offset = offsetPrev;
        }

        if (target < untils[i] - offset * 60000) {
            return offsets[i];
        }
    }

    return offsets[max];
}

// Era arrays for the two-year stretch leading up to (and just past) target.
function eraWindowAround(zoneId, target) {
    var cursor = target - PARSE_LOOKBACK,
        hi = target + PARSE_WINDOW,
        untils = [],
        offsets = [offsetWestAt(cursor, zoneId)],
        next;

    while (
        untils.length < 24 &&
        (next = nextTransition(cursor, zoneId)) !== null &&
        next <= hi
    ) {
        untils.push(next);
        offsets.push(offsetWestAt(next, zoneId));
        cursor = next;
    }
    untils.push(Infinity);

    return { untils: untils, offsets: offsets };
}

export function TemporalZone(name, zoneId) {
    this.name = name;
    this._zoneId = zoneId;
    this.population = 0;
}

function materialize(zone) {
    if (zone._untils) {
        return;
    }
    var untils = [],
        offsets = [],
        abbrs = [],
        cursor = ENUM_START,
        next;

    offsets.push(offsetWestAt(cursor, zone._zoneId));
    abbrs.push(abbrAt(cursor, zone._zoneId));

    while (
        untils.length < MAX_TRANSITIONS &&
        (next = nextTransition(cursor, zone._zoneId)) !== null &&
        next < ENUM_END
    ) {
        untils.push(next);
        offsets.push(offsetWestAt(next, zone._zoneId));
        abbrs.push(abbrAt(next, zone._zoneId));
        cursor = next;
    }
    untils.push(Infinity);

    zone._untils = untils;
    zone._offsets = offsets;
    zone._abbrs = abbrs;
}

TemporalZone.prototype = {
    // moment-timezone Zone interface -------------------------------------

    utcOffset: function (mom) {
        return offsetWestAt(+mom, this._zoneId);
    },

    abbr: function (mom) {
        return abbrAt(+mom, this._zoneId);
    },

    offset: function (mom) {
        // deprecated upstream; kept for API compatibility
        return this.utcOffset(mom);
    },

    // `timestamp` carries wall-clock fields encoded as a UTC epoch (the way
    // moment-timezone resolves "this local time in this zone"). Runs the
    // exact packed-data Zone.parse() algorithm over an era window
    // reconstructed from the host's transition data, so the disambiguation —
    // including its dependence on the *previous* era's offset and the
    // moveAmbiguousForward / moveInvalidForward flags (injected by the tz
    // module) — matches data-backed zones bit for bit.
    parse: function (timestamp) {
        var target = +timestamp;
        if (target >= ENUM_END - PARSE_WINDOW) {
            // beyond the materialized horizon: reconstruct the eras around
            // the target on the fly (rule-based zones transition at most
            // every ~8 months, so a two-year lookback always captures the
            // predecessor era the algorithm needs)
            return runParse(eraWindowAround(this._zoneId, target), target);
        }
        materialize(this);
        return runParse(
            { untils: this._untils, offsets: this._offsets },
            target
        );
    },

    countries: function () {
        var zone_name = this.name,
            countries = TemporalZone._countries || {};
        return Object.keys(countries).filter(function (country_code) {
            return countries[country_code].zones.indexOf(zone_name) !== -1;
        });
    },

    _index: function (timestamp) {
        var target = +timestamp,
            untils = this.untils,
            i;
        for (i = 0; i < untils.length; i++) {
            if (target < untils[i]) {
                return i;
            }
        }
    },
};

// Lazy array properties matching the packed-data Zone shape.
['untils', 'offsets', 'abbrs'].forEach(function (prop) {
    Object.defineProperty(TemporalZone.prototype, prop, {
        configurable: true,
        get: function () {
            materialize(this);
            return this['_' + prop];
        },
    });
});

// Injected by the tz module: { moveAmbiguousForward, moveInvalidForward }
TemporalZone._flags = {
    moveInvalidForward: true,
    moveAmbiguousForward: false,
};
TemporalZone._countries = null;
