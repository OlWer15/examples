(function () {
  'use strict';
  const { store, esc, md, itemText, itemHint, itemId } = window.QA;
  const LISTS = window.CHECKLISTS || [];
  const app = document.getElementById('app');

  const id = (new URLSearchParams(location.search).get('id') || '').trim();
  const cl = LISTS.find((c) => c.id === id);

  QA.renderHeader('checklists');

  // Без id — это выбор чек-листа, а не ошибка; «не найден» — только для неизвестного id (битая ссылка)
  if (!cl) {
    document.title = (id ? 'Чек-лист не найден' : 'Выберите чек-лист') + ' — QA-шпаргалка';
    app.innerHTML = (id
      ? '<h1>Чек-лист не найден</h1><p class="lead">Чек-листа «' + esc(id) + '» нет — возможно, ссылка устарела или в ней опечатка. Выберите нужный:</p>'
      : '<h1>Выберите чек-лист</h1><p class="lead">Чек-листы по частям интерфейса — откройте нужный:</p>') +
      '<div id="picker" data-testid="checklist:picker"></div>';
    QA.renderSections(document.getElementById('picker'));
    return;
  }

  document.title = cl.title + ' — QA-шпаргалка';

  // Раздел и соседи — для «хлебных крошек», переключателя и «предыдущий / следующий»
  const sections = QA.checklistSections();
  const section = sections.find((s) => s.lists.includes(cl));
  const order = sections.flatMap((s) => s.lists);
  const pos = order.indexOf(cl);
  const prev = order[pos - 1];
  const next = order[pos + 1];
  const switcher = '<select class="input switcher" id="switcher" aria-label="Другой чек-лист" data-testid="checklist:switcher">' +
    sections.map((s) => '<optgroup label="' + esc(s.title) + '">' +
      s.lists.map((c) => '<option value="' + c.id + '"' + (c === cl ? ' selected' : '') + '>' + esc(c.short) + '</option>').join('') +
      '</optgroup>').join('') + '</select>';
  const pager = '<nav class="pager" aria-label="Соседние чек-листы">' +
    (prev ? '<a class="btn" href="checklist.html?id=' + prev.id + '" data-testid="checklist:prev">← ' + esc(prev.short) + '</a>' : '<span></span>') +
    (next ? '<a class="btn" href="checklist.html?id=' + next.id + '" data-testid="checklist:next">' + esc(next.short) + ' →</a>' : '<span></span>') +
    '</nav>';

  const KEY = 'cl:' + cl.id;
  const checked = new Set(store.get(KEY, []));
  let hideDone = store.get('hideDone', false);
  // Открытая форма: { type: 'item', group, edit } или { type: 'group', edit } — одновременно одна
  let form = null;
  let groups = [];

  app.innerHTML =
    '<div class="crumbs-row">' +
    '<nav class="crumbs small" aria-label="Путь"><a href="index.html">Чек-листы</a> <span aria-hidden="true">›</span> <span>' + esc(section ? section.title : 'Другое') + '</span></nav>' +
    switcher +
    '</div>' +
    '<h1>' + esc(cl.title) + '</h1>' +
    '<p class="lead">' + esc(cl.summary) + '</p>' +
    (cl.related && cl.related.length
      ? '<div class="related">' + cl.related.map((r) => '<a class="btn small" href="' + r.href + '">' + esc(r.label) + ' →</a>').join('') + '</div>'
      : '') +
    '<div class="toolbar">' +
    '<div class="summary-bar" style="flex:1 1 240px"><div class="progress"><span id="total-bar"></span></div><span class="count" id="total-count" data-testid="checklist:total"></span></div>' +
    '<button class="btn small" id="hide-done" type="button" data-testid="checklist:hide-done">Скрыть отмеченные</button>' +
    '<button class="btn small" id="copy-report" type="button" data-testid="checklist:copy-report">Скопировать отчёт</button>' +
    '<button class="btn small" id="reset" type="button" data-testid="checklist:reset">Сбросить отметки</button>' +
    '</div>' +
    '<div class="own-bar small muted">' +
    '<span id="own-count" data-testid="checklist:own-count"></span>' +
    '<span class="spacer"></span>' +
    '<button class="btn small" id="export-own" type="button" data-testid="custom:export">Экспорт своих пунктов</button>' +
    '<button class="btn small" id="import-own" type="button" data-testid="custom:import">Импорт</button>' +
    '</div>' +
    '<div id="groups"></div>' +
    pager;

  const groupsEl = document.getElementById('groups');
  document.getElementById('switcher').addEventListener('change', (e) => {
    location.href = 'checklist.html?id=' + encodeURIComponent(e.target.value);
  });

  /* ---------- Отрисовка ---------- */

  const ownTag = '<span class="own-tag" title="Добавлено вами">свой</span>';

  function itemForm(groupKey, it) {
    return '<form class="own-form" data-form="item" data-group="' + esc(groupKey) + '"' + (it ? ' data-edit="' + esc(it.id) + '"' : '') + ' data-testid="custom:item-form">' +
      '<input class="input" name="t" maxlength="500" placeholder="Что проверить" autocomplete="off" value="' + (it ? esc(it.t) : '') + '" data-testid="custom:item-text">' +
      '<input class="input" name="h" maxlength="500" placeholder="Подсказка — как проверить (необязательно)" autocomplete="off" value="' + (it ? esc(it.h || '') : '') + '" data-testid="custom:item-hint">' +
      '<div class="own-form-actions"><button class="btn small primary" type="submit" data-testid="custom:save">' + (it ? 'Сохранить' : 'Добавить') + '</button>' +
      '<button class="btn small" type="button" data-action="cancel">Отмена</button>' +
      '<span class="muted small">Enter — сохранить, Esc — отмена. `код` выделится моноширинным.</span></div>' +
      '</form>';
  }

  function groupForm(g) {
    return '<form class="own-form own-form-group" data-form="group"' + (g ? ' data-edit="' + esc(g.key) + '"' : '') + ' data-testid="custom:group-form">' +
      '<input class="input" name="title" maxlength="100" placeholder="Название группы, например «Особенности интернет-магазина»" autocomplete="off" value="' + (g ? esc(g.title) : '') + '" data-testid="custom:group-title">' +
      '<div class="own-form-actions"><button class="btn small primary" type="submit" data-testid="custom:save-group">' + (g ? 'Сохранить' : 'Добавить группу') + '</button>' +
      '<button class="btn small" type="button" data-action="cancel">Отмена</button></div>' +
      '</form>';
  }

  function renderItem(g, it) {
    const iid = itemId(it);
    if (form && form.type === 'item' && form.edit === iid) {
      return '<li class="item own editing" id="' + iid + '">' + itemForm(g.key, it) + '</li>';
    }
    const hint = itemHint(it);
    return '<li class="item' + (it.custom ? ' own' : '') + '" id="' + iid + '" data-testid="checklist:item">' +
      '<label><input type="checkbox" data-id="' + iid + '" data-testid="checklist:checkbox">' +
      '<div><div class="text">' + md(itemText(it)) + (it.custom ? ' ' + ownTag : '') + '</div>' +
      (hint ? '<div class="hint">' + md(hint) + '</div>' : '') +
      '</div></label>' +
      (it.custom
        ? '<div class="item-actions">' +
          '<button class="icon-btn" type="button" data-action="edit-item" data-id="' + iid + '" data-group="' + esc(g.key) + '" title="Изменить" aria-label="Изменить пункт" data-testid="custom:edit">✎</button>' +
          '<button class="icon-btn" type="button" data-action="delete-item" data-id="' + iid + '" title="Удалить" aria-label="Удалить пункт" data-testid="custom:delete">✕</button>' +
          '</div>'
        : '') +
      '</li>';
  }

  function render() {
    groups = QA.mergedGroups(cl);
    groupsEl.innerHTML = groups.map((g) => {
      const editingGroup = form && form.type === 'group' && form.edit === g.key;
      const head = editingGroup
        ? groupForm(g)
        : '<div class="group-head"><h2>' + esc(g.title) + (g.custom && !g.orphans ? ' <span class="own-tag">своя группа</span>' : '') + '</h2>' +
          '<span class="group-head-right">' +
          (g.custom && !g.orphans
            ? '<button class="icon-btn" type="button" data-action="edit-group" data-group="' + esc(g.key) + '" title="Переименовать группу" aria-label="Переименовать группу" data-testid="custom:edit-group">✎</button>' +
              '<button class="icon-btn" type="button" data-action="delete-group" data-group="' + esc(g.key) + '" title="Удалить группу" aria-label="Удалить группу" data-testid="custom:delete-group">✕</button>'
            : '') +
          '<span class="count" data-count="' + esc(g.key) + '"></span></span></div>';
      const adding = form && form.type === 'item' && !form.edit && form.group === g.key;
      const foot = g.orphans
        ? '<p class="small muted group-note">Эти пункты были в группе, которой больше нет в чек-листе. Их можно изменить или удалить.</p>'
        : adding
          ? '<div class="group-foot">' + itemForm(g.key, null) + '</div>'
          : '<div class="group-foot"><button class="add-link" type="button" data-action="add-item" data-group="' + esc(g.key) + '" data-testid="custom:add-item">+ Добавить пункт</button></div>';
      return '<section class="group" data-group="' + esc(g.key) + '">' + head +
        (g.items.length ? '<ul class="items">' + g.items.map((it) => renderItem(g, it)).join('') + '</ul>' : '<p class="small muted group-note">В группе пока нет пунктов.</p>') +
        foot + '</section>';
    }).join('') +
      '<div class="add-group">' +
      (form && form.type === 'group' && !form.edit
        ? groupForm(null)
        : '<button class="btn" type="button" data-action="add-group" data-testid="custom:add-group">+ Добавить свою группу</button>') +
      '</div>';
    refresh();
    const input = groupsEl.querySelector('.own-form input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function refresh() {
    let total = 0;
    let done = 0;
    let own = 0;
    groups.forEach((g) => {
      const n = g.items.length;
      const d = g.items.filter((it) => checked.has(itemId(it))).length;
      total += n;
      done += d;
      own += g.items.filter((it) => it.custom).length;
      const c = groupsEl.querySelector('[data-count="' + CSS.escape(g.key) + '"]');
      if (c) c.textContent = d + ' / ' + n;
      groupsEl.querySelector('[data-group="' + CSS.escape(g.key) + '"]').classList.toggle('all-done', n > 0 && d === n);
    });
    groupsEl.querySelectorAll('input[type="checkbox"][data-id]').forEach((b) => {
      const on = checked.has(b.dataset.id);
      b.checked = on;
      b.closest('.item').classList.toggle('done', on);
    });
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('total-bar').style.width = pct + '%';
    document.getElementById('total-count').textContent = done + ' из ' + total + ' · ' + pct + '%';
    document.getElementById('own-count').textContent = own
      ? 'Своих пунктов в этом чек-листе: ' + own + '. Они хранятся в этом браузере — сохраните копию через экспорт.'
      : 'Добавляйте свои пункты под особенности проекта — кнопка «+ Добавить пункт» в каждой группе.';
    groupsEl.classList.toggle('hide-done', hideDone);
    document.getElementById('hide-done').setAttribute('aria-pressed', String(hideDone));
  }

  function saveChecked() {
    const valid = new Set();
    groups.forEach((g) => g.items.forEach((it) => valid.add(itemId(it))));
    store.set(KEY, Array.from(checked).filter((x) => valid.has(x)));
  }

  /* ---------- Изменение своих пунктов ---------- */

  // Найти список, в котором лежит свой пункт, — во встроенной группе или в своей
  function findOwn(data, iid) {
    for (const key of Object.keys(data.groups)) {
      const i = data.groups[key].findIndex((x) => x.id === iid);
      if (i >= 0) return { list: data.groups[key], i };
    }
    for (const g of data.extra) {
      const i = g.items.findIndex((x) => x.id === iid);
      if (i >= 0) return { list: g.items, i };
    }
    return null;
  }

  function addItem(groupKeyValue, t, h) {
    const data = QA.loadCustom(cl.id);
    const it = { id: QA.newId('c-'), t, h };
    const extra = data.extra.find((g) => g.id === groupKeyValue);
    if (extra) extra.items.push(it);
    else (data.groups[groupKeyValue] = data.groups[groupKeyValue] || []).push(it);
    QA.saveCustom(cl.id, data);
  }

  function updateItem(iid, t, h) {
    const data = QA.loadCustom(cl.id);
    const found = findOwn(data, iid);
    if (!found) return;
    found.list[found.i] = Object.assign({}, found.list[found.i], { t, h });
    QA.saveCustom(cl.id, data);
  }

  function deleteItem(iid) {
    const data = QA.loadCustom(cl.id);
    const found = findOwn(data, iid);
    if (!found) return;
    found.list.splice(found.i, 1);
    Object.keys(data.groups).forEach((k) => { if (!data.groups[k].length) delete data.groups[k]; });
    QA.saveCustom(cl.id, data);
    checked.delete(iid);
  }

  /* ---------- События ---------- */

  groupsEl.addEventListener('change', (e) => {
    const b = e.target;
    if (!b.dataset || !b.dataset.id) return;
    if (b.checked) checked.add(b.dataset.id); else checked.delete(b.dataset.id);
    saveChecked();
    refresh();
  });

  groupsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'cancel') { form = null; render(); return; }
    if (action === 'add-item') { form = { type: 'item', group: btn.dataset.group, edit: null }; render(); return; }
    if (action === 'edit-item') { form = { type: 'item', group: btn.dataset.group, edit: btn.dataset.id }; render(); return; }
    if (action === 'add-group') { form = { type: 'group', edit: null }; render(); return; }
    if (action === 'edit-group') { form = { type: 'group', edit: btn.dataset.group }; render(); return; }
    if (action === 'delete-item') {
      const it = groups.flatMap((g) => g.items).find((x) => itemId(x) === btn.dataset.id);
      if (!it || !confirm('Удалить свой пункт «' + it.t + '»?')) return;
      deleteItem(btn.dataset.id);
      saveChecked();
      form = null;
      render();
      QA.toast('Пункт удалён');
      return;
    }
    if (action === 'delete-group') {
      const g = groups.find((x) => x.key === btn.dataset.group);
      if (!g) return;
      const n = g.items.length;
      if (!confirm('Удалить группу «' + g.title + '»' + (n ? ' и ' + n + ' пункт(ов) в ней' : '') + '?')) return;
      const data = QA.loadCustom(cl.id);
      data.extra = data.extra.filter((x) => x.id !== g.key);
      QA.saveCustom(cl.id, data);
      g.items.forEach((it) => checked.delete(itemId(it)));
      form = null;
      render();
      saveChecked();
      QA.toast('Группа удалена');
    }
  });

  groupsEl.addEventListener('submit', (e) => {
    const f = e.target.closest('form.own-form');
    if (!f) return;
    e.preventDefault();
    if (f.dataset.form === 'item') {
      const t = f.elements.t.value.trim();
      const h = f.elements.h.value.trim();
      if (!t) { QA.toast('Напишите, что проверить'); f.elements.t.focus(); return; }
      if (f.dataset.edit) updateItem(f.dataset.edit, t, h);
      else addItem(f.dataset.group, t, h);
      const editing = f.dataset.edit;
      form = null;
      render();
      QA.toast(editing ? 'Пункт сохранён' : 'Пункт добавлен');
    } else {
      const title = f.elements.title.value.trim();
      if (!title) { QA.toast('Напишите название группы'); f.elements.title.focus(); return; }
      const data = QA.loadCustom(cl.id);
      if (f.dataset.edit) {
        const g = data.extra.find((x) => x.id === f.dataset.edit);
        if (g) g.title = title;
        QA.saveCustom(cl.id, data);
        form = null;
      } else {
        const gid = QA.newId('cg-');
        data.extra.push({ id: gid, title, items: [] });
        QA.saveCustom(cl.id, data);
        // сразу предлагаем добавить первый пункт в новую группу
        form = { type: 'item', group: gid, edit: null };
      }
      render();
      QA.toast(f.dataset.edit ? 'Группа переименована' : 'Группа добавлена — добавьте в неё пункты');
    }
  });

  groupsEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.closest('form.own-form')) { form = null; render(); }
  });

  document.getElementById('hide-done').addEventListener('click', () => {
    hideDone = !hideDone;
    store.set('hideDone', hideDone);
    refresh();
  });

  document.getElementById('reset').addEventListener('click', () => {
    if (!checked.size) return;
    if (!confirm('Снять все отметки в чек-листе «' + cl.title + '»? Свои пункты останутся.')) return;
    checked.clear();
    saveChecked();
    refresh();
    QA.toast('Отметки сброшены');
  });

  document.getElementById('copy-report').addEventListener('click', () => {
    let total = 0;
    let done = 0;
    const body = groups.filter((g) => g.items.length).map((g) => {
      const lines = g.items.map((it) => {
        const on = checked.has(itemId(it));
        total++;
        if (on) done++;
        return '- [' + (on ? 'x' : ' ') + '] ' + itemText(it) + (it.custom ? ' _(свой)_' : '');
      });
      return '### ' + g.title + (g.custom && !g.orphans ? ' _(своя группа)_' : '') + '\n' + lines.join('\n');
    }).join('\n\n');
    const date = new Date().toLocaleDateString('ru-RU');
    const text = '## Чек-лист «' + cl.title + '» — ' + done + ' из ' + total + ' (' + date + ')\n\n' + body + '\n';
    QA.copy(text, 'Отчёт скопирован (Markdown)');
  });

  QA.wireCustomIO(document.getElementById('export-own'), document.getElementById('import-own'), () => { form = null; render(); });

  render();

  // Переход из поиска: прокрутить к пункту и подсветить
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      if (target.classList.contains('done') && hideDone) {
        hideDone = false;
        refresh();
      }
      target.scrollIntoView({ block: 'center' });
      target.classList.add('flash');
    }
  }
})();
