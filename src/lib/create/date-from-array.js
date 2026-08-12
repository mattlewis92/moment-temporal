import { epochFromFields, systemZoneId } from '../temporal.js';

// Wall-clock parts -> Date, computed through the Temporal engine (which also
// sidesteps the legacy "years 0-99 remap to 1900-1999" constructor quirk that
// moment had to work around). Rolling overflow and DST resolution match the
// legacy Date constructor semantics.

export function createDate(y, m, d, h, M, s, ms) {
    return new Date(
        epochFromFields(
            y,
            m === undefined ? 0 : m,
            d === undefined ? 1 : d,
            h === undefined ? 0 : h,
            M === undefined ? 0 : M,
            s === undefined ? 0 : s,
            ms === undefined ? 0 : ms,
            systemZoneId()
        )
    );
}

export function createUTCDate(y, m, d, h, M, s, ms) {
    return new Date(
        epochFromFields(
            y,
            m === undefined ? 0 : m,
            d === undefined ? 1 : d,
            h === undefined ? 0 : h,
            M === undefined ? 0 : M,
            s === undefined ? 0 : s,
            ms === undefined ? 0 : ms,
            'UTC'
        )
    );
}
