// QUnit-compatible harness over node:test, replacing upstream's karma/QUnit
// setup. The vendored test files are untouched; they import { module, test }
// from here exactly as they do upstream, and qunit-locale.js uses the QUnit
// global this file provides.
import './install-temporal.js';
import { test as nodeTest } from 'node:test';
import nodeAssert from 'node:assert';
import moment from '../moment.js';
import './_all-locales.js';
import {
    setupDeprecationHandler,
    teardownDeprecationHandler,
} from './helpers/deprecation-handler.js';

var currentModuleName = '',
    currentHooks = null;

function makeAssert(state) {
    return {
        expect: function (n) {
            state.expected = n;
        },
        ok: function (value, message) {
            state.count++;
            nodeAssert.ok(value, message);
        },
        notOk: function (value, message) {
            state.count++;
            nodeAssert.ok(!value, message);
        },
        equal: function (actual, expected, message) {
            state.count++;
            // QUnit's equal is loose (==)
            nodeAssert.equal(actual, expected, message);
        },
        notEqual: function (actual, expected, message) {
            state.count++;
            nodeAssert.notEqual(actual, expected, message);
        },
        strictEqual: function (actual, expected, message) {
            state.count++;
            nodeAssert.strictEqual(actual, expected, message);
        },
        notStrictEqual: function (actual, expected, message) {
            state.count++;
            nodeAssert.notStrictEqual(actual, expected, message);
        },
        deepEqual: function (actual, expected, message) {
            state.count++;
            nodeAssert.deepStrictEqual(actual, expected, message);
        },
        notDeepEqual: function (actual, expected, message) {
            state.count++;
            nodeAssert.notDeepStrictEqual(actual, expected, message);
        },
        throws: function (fn, expected, message) {
            state.count++;
            if (message === undefined && typeof expected === 'string') {
                message = expected;
                expected = undefined;
            }
            if (expected === undefined) {
                nodeAssert.throws(fn, message);
            } else {
                nodeAssert.throws(fn, expected, message);
            }
        },
    };
}

function registerTest(name, callback) {
    var hooks = currentHooks,
        fullName = currentModuleName ? currentModuleName + ': ' + name : name;
    nodeTest(fullName, function () {
        var state = { count: 0, expected: null },
            bodyError = null;
        if (hooks && hooks.beforeEach) {
            hooks.beforeEach();
        }
        try {
            callback(makeAssert(state));
            if (state.expected != null && state.expected !== state.count) {
                throw new Error(
                    'Expected ' +
                        state.expected +
                        ' assertions, but ' +
                        state.count +
                        ' were run'
                );
            }
        } catch (e) {
            bodyError = e;
        }
        try {
            if (hooks && hooks.afterEach) {
                hooks.afterEach();
            }
        } catch (e) {
            if (bodyError === null) {
                bodyError = e;
            }
        }
        if (bodyError !== null) {
            throw bodyError;
        }
    });
}

function qunitModule(name, lifecycle) {
    currentModuleName = name;
    currentHooks = lifecycle || null;
}

// qunit-locale.js (vendored) relies on a QUnit global.
globalThis.QUnit = {
    module: qunitModule,
    test: registerTest,
    only: registerTest,
};

export var test = registerTest,
    only = registerTest;

export function module(name, lifecycle) {
    qunitModule(name, {
        beforeEach: function () {
            moment.locale('en');
            moment.createFromInputFallback = function (config) {
                throw new Error('input not handled by moment: ' + config._i);
            };
            setupDeprecationHandler(test, moment, 'core');
            if (lifecycle && lifecycle.setup) {
                lifecycle.setup();
            }
        },
        afterEach: function () {
            teardownDeprecationHandler(test, moment, 'core');
            if (lifecycle && lifecycle.teardown) {
                lifecycle.teardown();
            }
        },
    });
}
