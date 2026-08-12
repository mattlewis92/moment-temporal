import { module, test } from '../qunit.js';
import { deprecate } from '../../lib/utils/deprecate.js';

module('deprecate');

test('deprecate', function (assert) {
    // NOTE: hooks inside deprecate.js and moment are different, so this is can
    // not be test.expectedDeprecations(...)
    // PORT NOTE (moment-temporal): here the tests and the library share one
    // module graph, so the hooks ARE the same object and the deprecation
    // must be declared — exactly what upstream's note says they would do.
    test.expectedDeprecations('testing deprecation');
    var fn = function () {},
        deprecatedFn = deprecate('testing deprecation', fn);
    deprecatedFn();

    assert.expect(0);
});
