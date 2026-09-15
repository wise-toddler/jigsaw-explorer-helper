// Minifies src/*.js into bookmarklet.txt (a javascript: URL you can paste into a bookmark).
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const root = path.join(__dirname, '..');
const files = ['src/core.js', 'src/fit.js', 'src/ui.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8'));

minify(files.join('\n'), { compress: true, mangle: true }).then((out) => {
  const url = 'javascript:' + encodeURIComponent(out.code);
  fs.writeFileSync(path.join(root, 'bookmarklet.txt'), url + '\n');
  console.log('bookmarklet.txt written (' + url.length + ' bytes)');
});
