// Path shim: the vendored moment-timezone test helpers live one directory
// deeper than upstream (test/tz/** vs tests/**), so their `require('../../')`
// resolves here. Forward to the real package root.
module.exports = require('../index.js');
