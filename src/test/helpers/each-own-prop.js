import each from './each.js';
import objectKeys from './object-keys.js';

function eachOwnProp(object, callback) {
    each(objectKeys(object), callback);
}

export default eachOwnProp;
