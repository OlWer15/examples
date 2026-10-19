(function () {
  'use strict';
  const { esc, md, itemText, itemHint } = window.QA;
  const METHODS = window.API_METHODS || [];
  const STATUSES = window.HTTP_STATUSES || [];
  const $ = (id) => document.getElementById(id);

  QA.renderHeader('api');

  const badge = (m) => '<span class="method m-' + m.id + '">' + esc(m.name) + '</span>';
  const yesNo = (v) => (v ? '<span class="tag ok">да</span>' : '<span class="tag check">нет</span>');
  const codes = (list) => list.map((c) => '<code>' + esc(c) + '</code>').join(' ');

  // Быстрые переходы по странице
  $('jump').innerHTML =
    METHODS.map((m) => '<a href="#' + m.id + '">' + badge(m) + '</a>').join('') +
    '<a class="btn small" href="#codes">Коды ответов</a>' +
    '<a class="btn small" href="checklist.html?id=api">Чек-лист «Метод API» →</a>';

  // Сводная таблица
  $('overview-rows').innerHTML = METHODS.map((m) =>
    '<tr>' +
    '<td><a href="#' + m.id + '">' + badge(m) + '</a></td>' +
    '<td>' + esc(m.purpose) + '</td>' +
    '<td>' + esc(m.body) + '</td>' +
    '<td>' + yesNo(m.safe) + '</td>' +
    '<td>' + yesNo(m.idempotent) + '</td>' +
    '<td class="nowrap-list">' + m.success.map((s) => esc(s)).join('<br>') + '</td>' +
    '<td>' + codes(m.errors) + '</td>' +
    '</tr>'
  ).join('');

  // Карточки методов
  $('methods').innerHTML = METHODS.map((m) =>
    '<section class="method-card card" id="' + m.id + '" data-testid="api:method-' + m.id + '">' +
    '<div class="method-head">' + badge(m) + '<h2>' + esc(m.purpose) + '</h2></div>' +
    '<p>' + md(m.about) + '</p>' +
    '<div class="method-meta small">' +
    '<span>Тело: <b>' + esc(m.body) + '</b></span>' +
    '<span>Безопасный: ' + yesNo(m.safe) + '</span>' +
    '<span>Идемпотентный: ' + yesNo(m.idempotent) + '</span>' +
    '<span>Успех: ' + m.success.map((s) => '<code>' + esc(s) + '</code>').join(' ') + '</span>' +
    '</div>' +
    '<h3>Что проверить</h3>' +
    '<ul class="checks">' + m.checks.map((c) =>
      '<li>' + md(itemText(c)) + (itemHint(c) ? '<div class="hint">' + md(itemHint(c)) + '</div>' : '') + '</li>'
    ).join('') + '</ul>' +
    (m.pitfalls && m.pitfalls.length
      ? '<h3>Подводные камни</h3><ul class="pitfalls">' + m.pitfalls.map((p) => '<li>' + md(p) + '</li>').join('') + '</ul>'
      : '') +
    '<div class="example-head"><h3>Пример запроса</h3>' +
    '<button class="btn small" type="button" data-copy="' + m.id + '" data-testid="api:copy-example">Копировать</button></div>' +
    '<pre class="example"><code>' + esc(m.example) + '</code></pre>' +
    '</section>'
  ).join('');

  $('methods').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const m = METHODS.find((x) => x.id === btn.dataset.copy);
    if (m) QA.copy(m.example, 'Пример ' + m.name + ' скопирован');
  });

  // Коды ответов, сгруппированные по классам, с фильтром
  const CLASSES = { 2: '2xx — успех', 3: '3xx — перенаправление и кэш', 4: '4xx — ошибка клиента (запрос)', 5: '5xx — ошибка сервера' };

  function renderCodes() {
    const q = $('codes-filter').value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const found = STATUSES.filter((s) => {
      const hay = (s.code + ' ' + s.name + ' ' + s.when + ' ' + s.qa).toLowerCase().replace(/`/g, '');
      return words.every((w) => hay.includes(w));
    });
    let html = '';
    let cls = null;
    found.forEach((s) => {
      const c = Math.floor(s.code / 100);
      if (c !== cls) {
        cls = c;
        html += '<tr class="class-row"><td colspan="3">' + esc(CLASSES[c] || c + 'xx') + '</td></tr>';
      }
      html += '<tr data-code="' + s.code + '"><td class="code-cell"><span class="status s' + c + '">' + s.code + '</span> ' + esc(s.name) + '</td>' +
        '<td>' + md(s.when) + '</td><td>' + md(s.qa) + '</td></tr>';
    });
    $('codes-rows').innerHTML = html;
    $('codes-empty').hidden = found.length > 0;
  }
  $('codes-filter').addEventListener('input', renderCodes);
  $('codes-filter').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; renderCodes(); } });
  renderCodes();

  // Переход по якорю после отрисовки (#post и т.п.)
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }
})();
