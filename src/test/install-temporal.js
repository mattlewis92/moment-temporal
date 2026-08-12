// Ensures a Temporal implementation is available before the library loads.
// Node < 25 has no built-in Temporal; the tests run on the polyfill there.
import { Temporal } from '@js-temporal/polyfill';

if (!globalThis.Temporal) {
    globalThis.Temporal = Temporal;
}
