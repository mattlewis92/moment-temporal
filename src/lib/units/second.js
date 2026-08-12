import { makeGetSet } from '../moment/get-set.js';
import { addFormatToken } from '../format/format.js';
import {
    addRegexToken,
    match1to2,
    match2,
    match1to2HasZero,
} from '../parse/regex.js';
import { addParseToken } from '../parse/token.js';
import { SECOND } from './constants.js';

// FORMATTING

addFormatToken('s', ['ss', 2], 0, 'second');

// PARSING

addRegexToken('s', match1to2, match1to2HasZero);
addRegexToken('ss', match1to2, match2);
addParseToken(['s', 'ss'], SECOND);

// MOMENTS

export var getSetSecond = makeGetSet('Seconds', false);
