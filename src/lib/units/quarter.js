import { addFormatToken } from '../format/format.js';
import { addRegexToken, match1 } from '../parse/regex.js';
import { addParseToken } from '../parse/token.js';
import { MONTH } from './constants.js';
import toInt from '../utils/to-int.js';

// FORMATTING

addFormatToken('Q', 0, 'Qo', 'quarter');

// PARSING

addRegexToken('Q', match1);
addParseToken('Q', function (input, array) {
    array[MONTH] = (toInt(input) - 1) * 3;
});

// MOMENTS

export function getSetQuarter(input) {
    return input == null
        ? Math.ceil((this.month() + 1) / 3)
        : this.month((input - 1) * 3 + (this.month() % 3));
}
