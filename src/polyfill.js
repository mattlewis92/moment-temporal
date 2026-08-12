// Optional entry: installs the Temporal polyfill on runtimes without native
// Temporal. Import before (or alongside) 'moment-temporal':
//   import 'moment-temporal/polyfill';
import { Temporal } from '@js-temporal/polyfill';

if (!globalThis.Temporal) {
    globalThis.Temporal = Temporal;
}
