// Optional entry: installs the Temporal polyfill on runtimes without native
// Temporal. require('moment-temporal/polyfill') before the library if your
// runtime lacks globalThis.Temporal. (The main CJS entry already does this
// automatically when the polyfill is installed.)
'use strict';

if (!globalThis.Temporal) {
    globalThis.Temporal = require('@js-temporal/polyfill').Temporal;
}
