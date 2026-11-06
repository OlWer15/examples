// Версии скриптов и стилей: дописывает к ссылкам на assets/*.js|css и data/*.js в HTML-страницах ?v=<хэш содержимого>.
// GitHub Pages разрешает браузеру кэшировать файлы до 10 минут; с новым ?v= после выката браузер сразу берёт
// изменившийся файл, а не смешивает новую страницу со старыми скриптами. Неизменившиеся файлы версию не меняют.
// Запуск: node version-assets.js; его же вызывает pre-commit хук (hooks/pre-commit, см. README).
// --list — вывести только имена изменённых страниц, по одному в строке (для хука).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const REF = /(\b(?:src|href)=")((?:assets|data)\/[\w.-]+\.(?:js|css))(?:\?v=\w*)?(")/g;

const hashes = {};
// \r\n → \n: хэш не зависит от того, как git на Windows развернул концы строк
const hashOf = (rel) => hashes[rel] || (hashes[rel] = crypto.createHash('sha1')
  .update(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 8));

const changed = [];
fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).forEach((f) => {
  const file = path.join(ROOT, f);
  const html = fs.readFileSync(file, 'utf8');
  const out = html.replace(REF, (m, start, rel, end) => start + rel + '?v=' + hashOf(rel) + end);
  if (out === html) return;
  fs.writeFileSync(file, out);
  changed.push(f);
});

if (process.argv.includes('--list')) changed.forEach((f) => console.log(f));
else console.log(changed.length ? 'Обновлены версии в: ' + changed.join(', ') : 'Версии актуальны');
