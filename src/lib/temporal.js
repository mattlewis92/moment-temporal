// The Temporal-backed time engine. Everything moment.js computed with Date
// methods (field reads, wall-clock construction, week math) goes through
// here instead, using Temporal.ZonedDateTime/PlainDate so that timezone
// arithmetic comes from the host's IANA database rather than bundled data.
import mod from './utils/mod.js';
import { isLeapYear } from './utils/is-leap-year.js';

function daysInYear(year) {
    return isLeapYear(year) ? 366 : 365;
}

var cachedTemporal = null;

export function T() {
    if (cachedTemporal === null) {
        cachedTemporal =
            (typeof globalThis !== 'undefined' && globalThis.Temporal) || null;
    }
    if (!cachedTemporal) {
        throw new Error(
            'moment-temporal requires the Temporal API. Use a runtime with native ' +
                'Temporal support, or install @js-temporal/polyfill and assign ' +
                'globalThis.Temporal before importing moment-temporal.'
        );
    }
    return cachedTemporal;
}

// Allows the CJS entry (and tests) to inject a polyfill explicitly.
export function setTemporal(impl) {
    cachedTemporal = impl || null;
}

var systemZone = null;

export function systemZoneId() {
    if (systemZone === null) {
        systemZone = T().Now.timeZoneId();
    }
    return systemZone;
}

// Fixed utc-offset minutes -> Temporal offset time zone identifier.
export function offsetToZoneId(minutes) {
    if (!minutes) {
        return 'UTC';
    }
    var sign = minutes < 0 ? '-' : '+',
        abs = Math.abs(minutes),
        hh = String(Math.floor(abs / 60)).padStart(2, '0'),
        mm = String(Math.floor(abs % 60)).padStart(2, '0');
    return sign + hh + ':' + mm;
}

// ---------------------------------------------------------------------------
// Field views: wall-clock fields of an instant in a given zone. Months are
// 0-indexed and weekdays are 0=Sunday to match moment's public API.
// ---------------------------------------------------------------------------

var fieldsCache = new Map(),
    NAN_FIELDS = {
        years: NaN,
        months: NaN,
        date: NaN,
        hours: NaN,
        minutes: NaN,
        seconds: NaN,
        milliseconds: NaN,
        day: NaN,
        isoWeekday: NaN,
        dayOfYear: NaN,
        offset: NaN,
    };

export function fieldsAt(ms, zoneId) {
    if (!isFinite(ms)) {
        return NAN_FIELDS;
    }
    var key = zoneId + '@' + ms,
        hit = fieldsCache.get(key);
    if (hit !== undefined) {
        return hit;
    }
    var zdt = T()
            .Instant.fromEpochMilliseconds(ms)
            .toZonedDateTimeISO(zoneId),
        f = {
            years: zdt.year,
            months: zdt.month - 1,
            date: zdt.day,
            hours: zdt.hour,
            minutes: zdt.minute,
            seconds: zdt.second,
            milliseconds: zdt.millisecond,
            day: zdt.dayOfWeek % 7, // 0=Sunday..6=Saturday
            isoWeekday: zdt.dayOfWeek, // 1=Monday..7=Sunday
            dayOfYear: zdt.dayOfYear,
            // utc offset in minutes, positive east of UTC (moment convention)
            offset: zdt.offsetNanoseconds / 6e10,
        };
    if (fieldsCache.size > 8192) {
        fieldsCache.clear();
    }
    fieldsCache.set(key, f);
    return f;
}

// ---------------------------------------------------------------------------
// Wall-clock -> instant, replicating legacy Date "rolling" overflow semantics
// (month 13 rolls into the next year, day 0 into the previous month, hour 25
// into the next day, ...) which several moment behaviors rely on. Ambiguous or
// nonexistent local times resolve like Date does ('compatible').
// Returns epoch milliseconds, or NaN when out of range.
// ---------------------------------------------------------------------------

// ToIntegerOrInfinity, like legacy Date applies to each of its arguments.
function toIntArg(v) {
    v = +v;
    return v < 0 ? Math.ceil(v) : Math.floor(v);
}

export function epochFromFields(y, m, d, h, min, s, msec, zoneId) {
    y = toIntArg(y);
    m = toIntArg(m);
    d = toIntArg(d);
    h = toIntArg(h);
    min = toIntArg(min);
    s = toIntArg(s);
    msec = toIntArg(msec);
    var Temporal = T(),
        yy = y + Math.floor(m / 12),
        mm = mod(m, 12) + 1,
        pdt;
    try {
        pdt = addParts(
            Temporal.PlainDateTime.from({ year: yy, month: mm, day: 1 }),
            d,
            h,
            min,
            s,
            msec
        );
        return pdt.toZonedDateTime(zoneId, { disambiguation: 'compatible' })
            .epochMilliseconds;
    } catch (e) {
        return NaN;
    }
}

// Temporal rejects mixed-sign durations, but legacy rolling semantics allow
// e.g. a negative day-of-month with positive time fields — so apply each
// component separately.
function addParts(pdt, d, h, min, s, msec) {
    if (d !== 1) {
        pdt = pdt.add({ days: d - 1 });
    }
    if (h) {
        pdt = pdt.add({ hours: h });
    }
    if (min) {
        pdt = pdt.add({ minutes: min });
    }
    if (s) {
        pdt = pdt.add({ seconds: s });
    }
    if (msec) {
        pdt = pdt.add({ milliseconds: msec });
    }
    return pdt;
}

// Weekday (0=Sunday) of a calendar date given as year/0-indexed-month/day,
// with rolling overflow. Zone-independent.
export function weekdayOfDate(y, m, d) {
    try {
        return plainFromFields(y, m, d, 0, 0, 0, 0).dayOfWeek % 7;
    } catch (e) {
        return NaN;
    }
}

// Same wall-clock construction, but returns NaN-free "what would the fields
// be" info for callers that need the normalized parts.
export function plainFromFields(y, m, d, h, min, s, msec) {
    var Temporal = T(),
        yy = y + Math.floor(m / 12),
        mm = mod(m, 12) + 1;
    return addParts(
        Temporal.PlainDateTime.from({ year: yy, month: mm, day: 1 }),
        d,
        h,
        min,
        s,
        msec
    );
}

// ---------------------------------------------------------------------------
// Calendar-aware arithmetic on an instant within a zone.
// Date-based units keep the local clock time across DST; pure time units are
// exact elapsed time — matching both moment's and Temporal's semantics.
// ---------------------------------------------------------------------------

export function addCalendar(ms, zoneId, years, months, days) {
    var zdt;
    try {
        zdt = T().Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(zoneId);
        return zdt.add(
            { years: years, months: months, days: days },
            { overflow: 'constrain' }
        ).epochMilliseconds;
    } catch (e) {
        return NaN;
    }
}

export function daysInMonth(year, month) {
    var modMonth = mod(month, 12);
    year += (month - modMonth) / 12;
    return modMonth === 1
        ? isLeapYear(year)
            ? 29
            : 28
        : 31 - ((modMonth % 7) % 2);
}

// ---------------------------------------------------------------------------
// Week-calendar math (locale-dependent dow/doy). Pure day-number arithmetic;
// only the weekday of Jan 1 comes from Temporal.
// ---------------------------------------------------------------------------

var jan1DowCache = new Map();

// weekday (0=Sunday) of `year`-01-01 plus `extraDays`
function utcWeekday(year, extraDays) {
    if (!isFinite(year)) {
        return NaN;
    }
    var key = year,
        dow = jan1DowCache.get(key);
    if (dow === undefined) {
        dow =
            T().PlainDate.from({ year: year, month: 1, day: 1 }).dayOfWeek % 7;
        if (jan1DowCache.size > 2048) {
            jan1DowCache.clear();
        }
        jan1DowCache.set(key, dow);
    }
    return mod(dow + extraDays, 7);
}

// start-of-first-week - start-of-year, in days
export function firstWeekOffset(year, dow, doy) {
    var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
        fwd = 7 + dow - doy,
        // first-week day local weekday -- which local weekday is fwd
        fwdlw = (7 + utcWeekday(year, fwd - 1) - dow) % 7;

    return -fwdlw + fwd - 1;
}

// https://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
export function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
    var localWeekday = (7 + weekday - dow) % 7,
        weekOffset = firstWeekOffset(year, dow, doy),
        dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
        resYear,
        resDayOfYear;

    if (dayOfYear <= 0) {
        resYear = year - 1;
        resDayOfYear = daysInYear(resYear) + dayOfYear;
    } else if (dayOfYear > daysInYear(year)) {
        resYear = year + 1;
        resDayOfYear = dayOfYear - daysInYear(year);
    } else {
        resYear = year;
        resDayOfYear = dayOfYear;
    }

    return {
        year: resYear,
        dayOfYear: resDayOfYear,
    };
}

export function weekOfYear(mom, dow, doy) {
    var weekOffset = firstWeekOffset(mom.year(), dow, doy),
        week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
        resWeek,
        resYear;

    if (week < 1) {
        resYear = mom.year() - 1;
        resWeek = week + weeksInYear(resYear, dow, doy);
    } else if (week > weeksInYear(mom.year(), dow, doy)) {
        resWeek = week - weeksInYear(mom.year(), dow, doy);
        resYear = mom.year() + 1;
    } else {
        resYear = mom.year();
        resWeek = week;
    }

    return {
        week: resWeek,
        year: resYear,
    };
}

export function weeksInYear(year, dow, doy) {
    var weekOffset = firstWeekOffset(year, dow, doy),
        weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
    return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
}
