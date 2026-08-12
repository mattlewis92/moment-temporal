import { normalizeUnits, normalizeObjectUnits } from '../units/aliases.js';
import { getPrioritizedUnits } from '../units/priorities.js';
import { hooks } from '../utils/hooks.js';
import isFunction from '../utils/is-function.js';
import { isLeapYear } from '../utils/is-leap-year.js';
import { fieldsAt, epochFromFields, systemZoneId } from '../temporal.js';

// Field access and mutation, reimplemented on the Temporal engine.
//
// Bookkeeping convention (kept from moment for compatibility): `_d` holds the
// real instant for local-mode moments; for utc/fixed-offset moments it holds
// the display-shifted instant, whose wall-clock fields are its fields in the
// UTC zone. That means every read/write reduces to "fields of _d's epoch in
// either the system zone or UTC", which the Temporal engine provides.

export function viewZoneId(mom) {
    return mom._isUTC ? 'UTC' : systemZoneId();
}

export function viewFields(mom) {
    return fieldsAt(mom._d.valueOf(), viewZoneId(mom));
}

export function makeGetSet(unit, keepTime) {
    return function (value) {
        if (value != null) {
            set(this, unit, value);
            hooks.updateOffset(this, keepTime);
            return this;
        } else {
            return get(this, unit);
        }
    };
}

export function get(mom, unit) {
    if (!mom.isValid()) {
        return NaN;
    }

    var f = viewFields(mom);

    switch (unit) {
        case 'Milliseconds':
            return f.milliseconds;
        case 'Seconds':
            return f.seconds;
        case 'Minutes':
            return f.minutes;
        case 'Hours':
            return f.hours;
        case 'Date':
            return f.date;
        case 'Day':
            return f.day;
        case 'Month':
            return f.months;
        case 'FullYear':
            return f.years;
        default:
            return NaN; // Just in case
    }
}

export function set(mom, unit, value) {
    var f, year, month, date;

    if (!mom.isValid() || isNaN(value)) {
        return;
    }

    // legacy Date setters apply ToIntegerOrInfinity to their arguments
    value = value < 0 ? Math.ceil(value) : Math.floor(value);

    f = viewFields(mom);

    switch (unit) {
        case 'Milliseconds':
            return void setWallClock(mom, f, {milliseconds: value});
        case 'Seconds':
            return void setWallClock(mom, f, {seconds: value});
        case 'Minutes':
            return void setWallClock(mom, f, {minutes: value});
        case 'Hours':
            return void setWallClock(mom, f, {hours: value});
        case 'Date':
            return void setWallClock(mom, f, {date: value});
        // case 'Day': // Not real
        // case 'Month': // Not used because we need to pass two variables
        case 'FullYear':
            break; // See below ...
        default:
            return; // Just in case
    }

    year = value;
    month = f.months;
    date = f.date;
    date = date === 29 && month === 1 && !isLeapYear(year) ? 28 : date;
    setWallClock(mom, f, {years: year, months: month, date: date});
}

// Rebuild _d from the current wall-clock fields with some of them replaced,
// using legacy rolling-overflow semantics ('compatible' resolution for
// nonexistent/ambiguous local times, like Date setters).
function setWallClock(mom, f, replace) {
    var y = replace.years !== undefined ? replace.years : f.years,
        m = replace.months !== undefined ? replace.months : f.months,
        d = replace.date !== undefined ? replace.date : f.date,
        h = replace.hours !== undefined ? replace.hours : f.hours,
        min = replace.minutes !== undefined ? replace.minutes : f.minutes,
        s = replace.seconds !== undefined ? replace.seconds : f.seconds,
        ms =
            replace.milliseconds !== undefined
                ? replace.milliseconds
                : f.milliseconds;
    mom._d.setTime(epochFromFields(y, m, d, h, min, s, ms, viewZoneId(mom)));
}

// MOMENTS

export function stringGet(units) {
    units = normalizeUnits(units);
    if (isFunction(this[units])) {
        return this[units]();
    }
    return this;
}

export function stringSet(units, value) {
    if (typeof units === 'object') {
        units = normalizeObjectUnits(units);
        var prioritized = getPrioritizedUnits(units),
            i,
            prioritizedLen = prioritized.length;
        for (i = 0; i < prioritizedLen; i++) {
            this[prioritized[i].unit](units[prioritized[i].unit]);
        }
    } else {
        units = normalizeUnits(units);
        if (isFunction(this[units])) {
            return this[units](value);
        }
    }
    return this;
}
