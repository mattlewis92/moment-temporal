// Regenerates src/test/_all-locales.js from the contents of src/locale/.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const names = fs.readdirSync(path.join(root, 'src/locale')).filter(f => f.endsWith('.js')).sort();
const body = "// Generated: preloads every locale, mirroring upstream's test build.\n// Regenerate with scripts/gen-all-locales.cjs\nimport '../moment.js';\n" +
    names.map(n => "import '../locale/" + n + "';").join('\n') + '\n';
fs.writeFileSync(path.join(root, 'src/test/_all-locales.js'), body);
console.log('generated _all-locales.js with ' + names.length + ' locales');
