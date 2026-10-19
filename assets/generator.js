(function () {
  'use strict';
  const { store, esc } = window.QA;
  const G = window.QAGen;
  const $ = (id) => document.getElementById(id);

  QA.renderHeader('generator');

  /* ---------- Вкладки ---------- */

  const TABS = ['boundary', 'strings', 'data'];
  function showTab(name, push) {
    if (!TABS.includes(name)) name = 'boundary';
    TABS.forEach((t) => {
      $(t).hidden = t !== name;
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
    });
    if (push && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab, true)));
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));

  /* ---------- Показ значений ---------- */

  const EXP = { ok: 'валидно', bad: 'ошибка', check: 'уточнить' };

  // Сохранённые настройки могли остаться от прошлой версии (например, убранное заполнение)
  const validFill = (id) => (G.FILLS.some((f) => f.id === id) ? id : G.DEFAULT_FILL);

  // Пробелы и невидимые символы делаем заметными; длинные строки сокращаем
  function showValue(v) {
    if (v === '') return '<span class="ws">(пусто)</span>';
    const MAX = 80;
    const arr = Array.from(v);
    const cut = arr.length > MAX ? arr.slice(0, MAX).join('') : v;
    const html = esc(cut)
      .replace(/ /g, '<span class="ws">·</span>')
      .replace(/ /g, '<span class="ws">⍽</span>')
      .replace(/​/g, '<span class="ws">[ZWSP]</span>')
      .replace(/﻿/g, '<span class="ws">[BOM]</span>')
      .replace(/−/g, '<span class="ws">[U+2212]</span>−')
      .replace(/\t/g, '<span class="ws">⇥</span>')
      .replace(/\n/g, '<span class="ws">↵</span>');
    return html + (arr.length > MAX ? '<span class="ws">… (ещё ' + (arr.length - MAX) + ')</span>' : '');
  }

  /* ---------- Граничные значения ---------- */

  const bType = $('b-type');
  const bMin = $('b-min');
  const bMax = $('b-max');
  const bStep = $('b-step');
  const bFill = $('b-fill');
  const bFormat = $('b-format');
  let bRows = [];

  bFill.innerHTML = G.FILLS.map((f) => '<option value="' + f.id + '">' + esc(f.label) + '</option>').join('');
  bFormat.innerHTML = G.DATE_FORMATS.map((f) => '<option value="' + f.id + '">' + esc(f.label) + '</option>').join('');
  $('s-fill').innerHTML = bFill.innerHTML;

  const todayISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const plusDaysISO = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

  const B_DEFAULTS = {
    string: { min: '3', max: '50', label: ['Мин. длина', 'Макс. длина'] },
    int: { min: '1', max: '100', label: ['Минимум', 'Максимум'] },
    decimal: { min: '0.01', max: '999.99', label: ['Минимум', 'Максимум'] },
    date: { min: null, max: null, label: ['С даты', 'По дату'] },
  };

  function setType(type, keepValues) {
    const def = B_DEFAULTS[type];
    const isDate = type === 'date';
    bMin.type = bMax.type = isDate ? 'date' : 'number';
    bMin.step = bMax.step = type === 'decimal' ? 'any' : '1';
    if (!keepValues) {
      bMin.value = isDate ? todayISO() : def.min;
      bMax.value = isDate ? plusDaysISO(todayISO(), 30) : def.max;
    }
    $('b-min-label').textContent = def.label[0];
    $('b-max-label').textContent = def.label[1];
    $('b-step-field').hidden = type !== 'decimal';
    $('b-fill-field').hidden = type !== 'string';
    $('b-format-field').hidden = !isDate;
  }

  function computeBoundary() {
    const type = bType.value;
    const err = $('b-error');
    try {
      if (type === 'string') bRows = G.boundaryString(Number(bMin.value), Number(bMax.value), bFill.value);
      else if (type === 'int') bRows = G.boundaryInt(Number(bMin.value), Number(bMax.value));
      else if (type === 'decimal') bRows = G.boundaryDecimal(Number(bMin.value), Number(bMax.value), Number(bStep.value));
      else bRows = G.boundaryDate(bMin.value, bMax.value, bFormat.value, todayISO());
      if ([bMin.value, bMax.value].some((v) => v === '')) throw new Error('Заполните минимум и максимум');
      err.hidden = true;
    } catch (e) {
      bRows = [];
      err.textContent = e.message;
      err.hidden = false;
    }
    $('b-rows').innerHTML = bRows.map((r, i) =>
      '<tr data-testid="boundary:row" data-exp="' + r.exp + '">' +
      '<td class="val">' + showValue(r.v) + '</td>' +
      '<td>' + esc(r.note) + '</td>' +
      '<td><span class="tag ' + r.exp + '">' + EXP[r.exp] + '</span></td>' +
      '<td class="act"><button class="btn small" type="button" data-copy="' + i + '" data-testid="boundary:copy">Копировать</button></td></tr>'
    ).join('');
    store.set('boundary', { type, min: bMin.value, max: bMax.value, step: bStep.value, fill: bFill.value, format: bFormat.value });
  }

  $('b-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const r = bRows[Number(btn.dataset.copy)];
    QA.copy(r.v, r.v === '' ? 'Скопирована пустая строка' : 'Скопировано: ' + Array.from(r.v).length + ' симв.');
  });

  $('b-copy-md').addEventListener('click', () => {
    if (!bRows.length) return;
    const cell = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, '↵');
    const val = (r) => {
      if (r.v === '') return '(пусто)';
      const n = Array.from(r.v).length;
      return n > 40 ? 'строка длиной ' + n : '`' + cell(r.v) + '`';
    };
    const md = '| Значение | Что проверяем | Ожидание | Факт |\n|---|---|---|---|\n' +
      bRows.map((r) => '| ' + val(r) + ' | ' + cell(r.note) + ' | ' + EXP[r.exp] + ' |  |').join('\n') + '\n';
    QA.copy(md, 'Таблица скопирована (Markdown)');
  });

  const saved = store.get('boundary', null);
  if (saved && B_DEFAULTS[saved.type]) {
    bType.value = saved.type;
    setType(saved.type, true);
    bMin.value = saved.min;
    bMax.value = saved.max;
    bStep.value = saved.step || '0.01';
    bFill.value = validFill(saved.fill);
    bFormat.value = saved.format || 'dmy';
  } else {
    setType('string');
  }
  bType.addEventListener('change', () => { setType(bType.value); computeBoundary(); });
  [bMin, bMax, bStep, bFill, bFormat].forEach((el) => el.addEventListener('input', computeBoundary));
  computeBoundary();

  /* ---------- Строки ---------- */

  const sLen = $('s-len');
  const sFill = $('s-fill');
  const sOut = $('s-out');
  sFill.value = validFill(store.get('stringFill', G.DEFAULT_FILL));

  function computeString() {
    const n = Math.floor(Number(sLen.value));
    if (!Number.isFinite(n) || n < 0 || n > 1000000) {
      $('s-info').textContent = 'Длина — от 0 до 1 000 000';
      sOut.value = '';
      return;
    }
    store.set('stringFill', sFill.value);
    const s = G.makeStr(n, sFill.value);
    const st = G.strStats(s);
    sOut.value = s;
    $('s-info').textContent = 'Символов: ' + st.codePoints.toLocaleString('ru-RU') +
      ' · длина в JS (UTF-16): ' + st.units.toLocaleString('ru-RU') +
      ' · байт в UTF-8: ' + st.bytes.toLocaleString('ru-RU');
  }
  [sLen, sFill].forEach((el) => el.addEventListener('input', computeString));
  $('s-copy').addEventListener('click', () => QA.copy(sOut.value, 'Скопировано: ' + Array.from(sOut.value).length + ' симв.'));
  $('s-download').addEventListener('click', () => QA.download('string-' + sLen.value + '-' + sFill.value + '.txt', sOut.value));
  computeString();

  $('s-sets').innerHTML = G.STRING_SETS.map((set, si) =>
    '<div class="set"><h3>' + esc(set.title) + '</h3><p>' + esc(set.note) + '</p><div class="chips">' +
    set.items.map((it, ii) =>
      '<button type="button" class="chip' + (it.exp ? ' ' + it.exp : '') + '" data-set="' + si + '" data-item="' + ii + '" data-testid="strings:chip" title="Клик — скопировать">' +
      (it.label ? esc(it.label) : esc(it.v)) + '</button>'
    ).join('') + '</div></div>'
  ).join('');
  $('s-sets').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const it = G.STRING_SETS[Number(chip.dataset.set)].items[Number(chip.dataset.item)];
    QA.copy(it.v, 'Скопировано: ' + (it.label || it.v));
  });

  /* ---------- Наборы данных ---------- */

  const knownCols = new Set(G.COLUMNS.map((c) => c.id));
  const savedCols = store.get('dataColumns.v2', G.DEFAULT_COLUMNS).filter((id) => knownCols.has(id));
  const selected = new Set(savedCols.length ? savedCols : G.DEFAULT_COLUMNS);
  $('d-cols').innerHTML = G.COLUMNS.map((c) =>
    '<label class="checkline"><input type="checkbox" value="' + c.id + '"' + (selected.has(c.id) ? ' checked' : '') +
    ' data-testid="data:column-' + c.id + '"> ' + esc(c.label) + '</label>'
  ).join('');

  // Поля — свёрнутый список с выбором нескольких: в закрытом виде показывает, что выбрано
  const colBoxes = () => Array.from($('d-cols').querySelectorAll('input[type="checkbox"]'));
  const shortLabel = (c) => c.label.replace(/\s*\(.*\)$/, '');
  function updateColsValue() {
    const chosen = G.COLUMNS.filter((c) => colBoxes().some((b) => b.value === c.id && b.checked)).map(shortLabel);
    const text = !chosen.length ? 'Не выбрано'
      : chosen.length === G.COLUMNS.length ? 'Все поля (' + chosen.length + ')'
        : chosen.length <= 3 ? chosen.join(', ')
          : chosen.slice(0, 2).join(', ') + ' и ещё ' + (chosen.length - 2);
    $('d-cols-value').textContent = text;
    $('d-cols-toggle').title = chosen.join(', ');
  }
  function setColsOpen(open) {
    $('d-cols-panel').hidden = !open;
    $('d-cols-toggle').setAttribute('aria-expanded', String(open));
    $('d-cols-wrap').classList.toggle('open', open);
  }
  $('d-cols-toggle').addEventListener('click', () => {
    const open = $('d-cols-panel').hidden;
    setColsOpen(open);
    if (open) colBoxes()[0].focus();
  });
  $('d-cols-done').addEventListener('click', () => { setColsOpen(false); $('d-cols-toggle').focus(); });
  document.addEventListener('click', (e) => {
    if (!$('d-cols-panel').hidden && !$('d-cols-wrap').contains(e.target)) setColsOpen(false);
  });
  $('d-cols-wrap').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('d-cols-panel').hidden) { setColsOpen(false); $('d-cols-toggle').focus(); }
  });
  function setCols(ids) {
    colBoxes().forEach((b) => { b.checked = ids.includes(b.value); });
    $('d-cols').dispatchEvent(new Event('change'));
  }
  $('d-cols-all').addEventListener('click', () => setCols(G.COLUMNS.map((c) => c.id)));
  $('d-cols-default').addEventListener('click', () => setCols(G.DEFAULT_COLUMNS));
  $('d-cols').addEventListener('change', updateColsValue);
  updateColsValue();
  $('d-sep').value = store.get('csvSep', ';');
  $('d-traps').innerHTML = G.TRAP_RATES.map((t) => '<option value="' + t.id + '">' + esc(t.label) + '</option>').join('');
  $('d-traps').value = store.get('trapRate', '0');
  $('d-prefix').value = store.get('dataPrefix', '');

  // Язык набора — параметр: имена, отчество, адрес и тексты на выбранном языке
  const LANG_NOTES = {
    ru: 'Отчество — настоящее, по полу.',
    en: 'Вместо отчества — второе имя (middle name).',
    zh: 'Отчества в китайских именах нет — поле пустое.',
    ar: 'Вместо отчества — имя отца, как в арабском полном имени.',
    mixed: 'У каждой строки свой язык из четырёх — проверка, что система принимает разные письменности в одном наборе.',
  };
  $('d-lang').innerHTML = G.LANGUAGES.map((l) => '<option value="' + l.id + '">' + esc(l.label) + '</option>').join('');
  const savedLang = store.get('dataLang', G.DEFAULT_LANG);
  $('d-lang').value = G.LANGUAGES.some((l) => l.id === savedLang) ? savedLang : G.DEFAULT_LANG;

  // Страна телефона — отдельно от языка: «по языку данных», конкретная страна или все вперемешку
  $('d-phone').innerHTML = G.PHONE_CHOICES.map((c) => '<option value="' + c.id + '">' + esc(c.label) + '</option>').join('');
  const savedPhone = store.get('phoneCountry', G.DEFAULT_PHONE_COUNTRY);
  $('d-phone').value = G.PHONE_CHOICES.some((c) => c.id === savedPhone) ? savedPhone : G.DEFAULT_PHONE_COUNTRY;
  function phoneNote() {
    const choice = $('d-phone').value;
    const lang = $('d-lang').value;
    const NO_SMS = 'номера случайные и могут существовать — SMS на них не отправляйте';
    if (choice === 'mixed') return 'Телефоны 13 стран вперемешку — проверка разных форматов в одном наборе; ' + NO_SMS + '.';
    const country = G.PHONE_COUNTRIES.find((c) => c.id === choice);
    if (country) return country.fictional ? 'Телефоны — из вымышленных номеров, выделенных для кино и тестов.' : 'Телефоны: ' + NO_SMS + '.';
    if (lang === 'en') return 'Телефоны по языку: США и Великобритания — из вымышленных номеров для кино и тестов.';
    const byLang = { ru: 'Россия (+7)', zh: 'Китай (+86)', ar: 'ОАЭ (+971)', mixed: 'страна по языку каждой строки' };
    return 'Телефоны по языку: ' + (byLang[lang] || '') + '; ' + NO_SMS + '.';
  }
  const showLangNote = () => { $('d-lang-note').textContent = (LANG_NOTES[$('d-lang').value] || '') + ' ' + phoneNote(); };
  showLangNote();

  let dRows = [];
  let dSeed = '';

  // keepSeed: пересобрать тот же набор (поменялись колонки, ловушки или префикс); иначе — новый случайный
  function generateData(keepSeed) {
    const err = $('d-error');
    const ids = Array.from($('d-cols').querySelectorAll('input:checked')).map((i) => i.value);
    const count = Math.floor(Number($('d-count').value));
    store.set('dataColumns.v2', ids);
    store.set('csvSep', $('d-sep').value);
    store.set('trapRate', $('d-traps').value);
    store.set('dataPrefix', $('d-prefix').value);
    store.set('dataLang', $('d-lang').value);
    store.set('phoneCountry', $('d-phone').value);
    if (!ids.length) { err.textContent = 'Выберите хотя бы одно поле'; err.hidden = false; return; }
    if (!(count >= 1 && count <= 1000)) { err.textContent = 'Количество строк — от 1 до 1000'; err.hidden = false; return; }
    err.hidden = true;
    dSeed = (keepSeed === true && dSeed) || String(Math.floor(Math.random() * 1e9));
    dRows = G.generateRows(count, G.seedFrom(dSeed), ids, null, { trapRate: $('d-traps').value, prefix: $('d-prefix').value, lang: $('d-lang').value, phoneCountry: $('d-phone').value });
    const keys = Object.keys(dRows[0]);
    const trapCount = dRows.traps.reduce((n, t) => n + t.length, 0);
    $('d-head').innerHTML = '<tr>' + keys.map((k) => '<th>' + esc(k) + '</th>').join('') + '</tr>';
    $('d-rows').innerHTML = dRows.slice(0, 50).map((r, ri) =>
      '<tr>' + keys.map((k) => {
        const trap = dRows.traps[ri].includes(k);
        return '<td data-row="' + ri + '" data-key="' + esc(k) + '"' + (trap ? ' class="trap" title="Ловушка"' : '') + '>' +
          (trap ? showValue(r[k]) : esc(shorten(r[k]))) + '</td>';
      }).join('') + '</tr>'
    ).join('');
    $('d-info').textContent = dRows.length + ' строк' + (trapCount ? ' · ловушек: ' + trapCount : '');
  }

  function shorten(s) {
    const arr = Array.from(String(s));
    return arr.length > 80 ? arr.slice(0, 80).join('') + '…' : String(s);
  }

  $('d-gen').addEventListener('click', generateData);
  // Смена колонок, доли ловушек и префикса пересобирает тот же набор,
  // иначе данные перетасовывались бы при каждом символе
  $('d-cols').addEventListener('change', () => { if (dRows.length) generateData(true); });
  $('d-traps').addEventListener('change', () => { if (dRows.length) generateData(true); });
  $('d-lang').addEventListener('change', () => { showLangNote(); generateData(true); });
  $('d-phone').addEventListener('change', () => { showLangNote(); generateData(true); });
  $('d-prefix').addEventListener('input', () => { if (dRows.length) generateData(true); });
  document.querySelectorAll('[data-prefix]').forEach((b) => b.addEventListener('click', () => {
    $('d-prefix').value = b.dataset.prefix;
    if (dRows.length) generateData(true);
  }));
  $('d-rows').addEventListener('click', (e) => {
    const td = e.target.closest('td[data-key]');
    if (!td) return;
    const v = String(dRows[Number(td.dataset.row)][td.dataset.key]);
    const n = Array.from(v).length;
    QA.copy(v, v === '' ? 'Скопирована пустая строка' : n > 60 ? 'Скопировано: ' + n + ' симв.' : 'Скопировано: ' + v);
  });

  const csv = () => G.toCSV(dRows, $('d-sep').value);
  const json = () => JSON.stringify(dRows, null, 2);
  // Имя файла с датой и временем — несколько выгрузок подряд не перезапишут друг друга
  const fileBase = () => 'test-data-' + dRows.length + '-' + new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  $('d-copy-csv').addEventListener('click', () => dRows.length && QA.copy(csv(), 'CSV скопирован'));
  $('d-copy-json').addEventListener('click', () => dRows.length && QA.copy(json(), 'JSON скопирован'));
  // BOM, чтобы Excel открыл кириллицу, иероглифы и арабский без кракозябр
  $('d-dl-csv').addEventListener('click', () => dRows.length && QA.download(fileBase() + '.csv', '﻿' + csv(), 'text/csv;charset=utf-8'));
  $('d-dl-json').addEventListener('click', () => dRows.length && QA.download(fileBase() + '.json', json(), 'application/json'));

  generateData();
})();
