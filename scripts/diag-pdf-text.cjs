const fs = require('fs'), path = require('path'), zlib = require('zlib');
const buf = fs.readFileSync(path.join(__dirname, '..', 'outputs', 'remito_146_pedido.pdf'));
const txt = buf.toString('latin1');
let out = '';
const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
let m;
while ((m = re.exec(txt))) {
  const raw = Buffer.from(m[1], 'latin1');
  try { out += zlib.inflateSync(raw).toString('latin1') + '\n'; }
  catch (e) { out += raw.toString('latin1') + '\n'; }
}
const tokens = [...out.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map(x => x[1]);
const joined = tokens.join(' ');
console.log('TEXTO:');
console.log(joined.slice(0, 3000));
const montos = [...joined.matchAll(/\d[\d.\s]{2,},\d{2}/g)].map(x => x[0].replace(/\s/g, ''));
console.log('\n--- MONTOS ---');
console.log([...new Set(montos)].join('\n'));
