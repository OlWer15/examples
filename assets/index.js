(function () {
  'use strict';
  const { esc, itemText, itemHint, itemId, checklistStats } = window.QA;
  const LISTS = window.CHECKLISTS || [];

  QA.renderHeader('home');

  // Карточки чек-листов с прогрессом (свои пункты учитываются)
  function renderCards() {
    QA.renderSections(document.getElementById('checklists'));
    const ownTotal = LISTS.reduce((s, cl) => s + checklistStats(cl).own, 0);
    document.getElementById('own-summary').textContent = ownTotal
      ? 'Своих пунктов во всех чек-листах: ' + ownTotal + '. Хранятся в этом браузере — сохраните копию через экспорт.'
      : 'Свои пункты добавляются на странице чек-листа — под особенности вашего проекта. Здесь их можно выгрузить в файл и загрузить обратно.';
  }

  // Поиск по всем пунктам, включая свои
  let index = [];
  function buildIndex() {
    index = [];
    LISTS.forEach((cl) => QA.mergedGroups(cl).forEach((g) => g.items.forEach((it) => {
      const text = itemText(it).replace(/`/g, '');
      const hint = itemHint(it).replace(/`/g, '');
      index.push({ cl, group: g.title, own: !!it.custom, text, hint, id: itemId(it), hay: (text + ' ' + hint + ' ' + g.title).toLowerCase() });
    })));
  }

  const input = document.getElementById('search');
  const box = document.getElementById('results');

  function highlight(text, words) {
    if (!words.length) return esc(text);
    const re = new RegExp('(' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return text.split(re).map((part, i) => (i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part))).join('');
  }

  function run() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const words = q.split(/\s+/).filter(Boolean);
    const found = index.filter((e) => words.every((w) => e.hay.includes(w)));
    if (!found.length) {
      box.innerHTML = '<div class="res-empty">Ничего не найдено</div>';
      return;
    }
    box.innerHTML = found.slice(0, 40).map((e) =>
      '<a class="res" href="checklist.html?id=' + e.cl.id + '#' + e.id + '" data-testid="home:result">' +
      '<small>' + esc(e.cl.title) + ' · ' + esc(e.group) + '</small>' + highlight(e.text, words) +
      (e.own ? ' <span class="own-tag">свой</span>' : '') + '</a>'
    ).join('') + (found.length > 40 ? '<div class="res-empty">…и ещё ' + (found.length - 40) + '</div>' : '');
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; run(); } });

  QA.wireCustomIO(document.getElementById('export-own'), document.getElementById('import-own'), () => {
    renderCards();
    buildIndex();
    run();
  });

  renderCards();
  buildIndex();
})();
