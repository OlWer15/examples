// Общие помощники: хранилище, тема, шапка, копирование, скачивание.
// Подключается в <head> без defer, чтобы тема применилась до отрисовки.
(function () {
  'use strict';

  const PREFIX = 'qa-cheatsheet:';
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (e) { /* приватный режим и т.п. — работаем без сохранения */ }
    },
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // `код` в тексте чек-листов → <code>
  function md(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  const itemText = (it) => (typeof it === 'string' ? it : it.t);
  const itemHint = (it) => (typeof it === 'string' ? '' : it.h || '');
  // У встроенных пунктов id — хэш текста; у своих — постоянный id, чтобы правка текста не сбрасывала отметку
  const itemId = (it) => (it && it.id) || 'i-' + hash(itemText(it));

  /* ---------- Свои пункты и группы ---------- */
  // Хранятся в localStorage под ключом custom:<id чек-листа>:
  //   { groups: { <ключ встроенной группы>: [ {id, t, h} ] },   — свои пункты во встроенных группах
  //     extra:  [ {id, title, items: [ {id, t, h} ]} ] }        — свои группы
  // Ключ встроенной группы — хэш её названия: не зависит от порядка групп.

  const groupKey = (title) => 'g-' + hash(title);
  const newId = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function loadCustom(clId) {
    const raw = store.get('custom:' + clId, null);
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      groups: data.groups && typeof data.groups === 'object' ? data.groups : {},
      extra: Array.isArray(data.extra) ? data.extra : [],
    };
  }

  function saveCustom(clId, data) {
    store.set('custom:' + clId, data);
  }

  function countCustom(data) {
    let n = 0;
    Object.values(data.groups).forEach((list) => { n += list.length; });
    data.extra.forEach((g) => { n += g.items.length; });
    return n;
  }

  // Встроенные группы со своими пунктами + свои группы — единый список для отрисовки, поиска, прогресса и отчёта
  function mergedGroups(cl) {
    const custom = loadCustom(cl.id);
    const known = new Set();
    const groups = cl.groups.map((g) => {
      const key = groupKey(g.title);
      known.add(key);
      const own = (custom.groups[key] || []).map((it) => Object.assign({ custom: true }, it));
      return { key, title: g.title, custom: false, items: g.items.concat(own) };
    });
    custom.extra.forEach((g) => {
      groups.push({ key: g.id, title: g.title, custom: true, items: g.items.map((it) => Object.assign({ custom: true }, it)) });
    });
    // Свои пункты из встроенной группы, которую переименовали или убрали, — не теряем
    const orphans = [];
    Object.keys(custom.groups).forEach((key) => {
      if (!known.has(key)) custom.groups[key].forEach((it) => orphans.push(Object.assign({ custom: true, orphanOf: key }, it)));
    });
    if (orphans.length) groups.push({ key: 'orphans', title: 'Прочие свои пункты', custom: true, orphans: true, items: orphans });
    return groups;
  }

  function checklistStats(cl) {
    const checked = new Set(store.get('cl:' + cl.id, []));
    let total = 0;
    let done = 0;
    let own = 0;
    mergedGroups(cl).forEach((g) => g.items.forEach((it) => {
      total++;
      if (it.custom) own++;
      if (checked.has(itemId(it))) done++;
    }));
    return { total, done, own };
  }

  /* ---------- Разделы чек-листов ---------- */

  // [{ title, lists: [чек-лист…] }] в порядке CHECKLIST_CATEGORIES; не попавшие в разделы — в «Другое»
  function checklistSections() {
    const lists = window.CHECKLISTS || [];
    const byId = new Map(lists.map((c) => [c.id, c]));
    const used = new Set();
    const sections = (window.CHECKLIST_CATEGORIES || []).map((cat) => ({
      title: cat.title,
      lists: cat.ids.filter((x) => byId.has(x)).map((x) => { used.add(x); return byId.get(x); }),
    })).filter((s) => s.lists.length);
    const rest = lists.filter((c) => !used.has(c.id));
    if (rest.length) sections.push({ title: 'Другое', lists: rest });
    return sections;
  }

  // Карточка чек-листа с прогрессом — на главной и на странице выбора
  function checklistCard(cl) {
    const { total, done, own } = checklistStats(cl);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return '<a class="card" href="checklist.html?id=' + cl.id + '" data-testid="home:checklist-' + cl.id + '">' +
      '<h3>' + esc(cl.short) + '</h3><p>' + esc(cl.summary) + '</p>' +
      '<div class="meta"><span>' + total + ' пунктов' + (own ? ', своих ' + own : '') + '</span><span>' + (done ? 'отмечено ' + done + ' (' + pct + '%)' : 'не начат') + '</span></div>' +
      '<div class="progress"><span style="width:' + pct + '%"></span></div></a>';
  }

  function renderSections(container) {
    container.innerHTML = checklistSections().map((s) =>
      '<section class="cat"><h3 class="cat-title">' + esc(s.title) + ' <span class="muted">· ' + s.lists.length + '</span></h3>' +
      '<div class="grid">' + s.lists.map(checklistCard).join('') + '</div></section>'
    ).join('');
  }

  /* ---------- Экспорт и импорт своих пунктов ---------- */

  const EXPORT_KIND = 'qa-cheatsheet/custom-items';

  function exportCustom() {
    const checklists = {};
    (window.CHECKLISTS || []).forEach((cl) => {
      const data = loadCustom(cl.id);
      if (!countCustom(data)) return;
      // Названия встроенных групп — только для человека, читающего файл; при импорте не нужны
      const groupTitles = {};
      cl.groups.forEach((g) => { if (data.groups[groupKey(g.title)]) groupTitles[groupKey(g.title)] = g.title; });
      checklists[cl.id] = { title: cl.title, groupTitles, groups: data.groups, extra: data.extra };
    });
    return { kind: EXPORT_KIND, version: 1, exportedAt: new Date().toISOString(), checklists };
  }

  function cleanItem(it) {
    if (!it || typeof it.t !== 'string' || !it.t.trim()) return null;
    return {
      id: typeof it.id === 'string' && it.id ? it.id : newId('c-'),
      t: it.t.trim().slice(0, 500),
      h: typeof it.h === 'string' ? it.h.trim().slice(0, 500) : '',
    };
  }

  // Слияние по id: тот же файл можно импортировать повторно — дублей не будет
  function mergeItems(target, incoming, counts) {
    (Array.isArray(incoming) ? incoming : []).forEach((raw) => {
      const it = cleanItem(raw);
      if (!it) { counts.skipped++; return; }
      const i = target.findIndex((x) => x.id === it.id);
      if (i >= 0) { target[i] = it; counts.updated++; } else { target.push(it); counts.added++; }
    });
  }

  function importCustom(json) {
    if (!json || json.kind !== EXPORT_KIND || typeof json.checklists !== 'object') {
      throw new Error('Это не файл своих пунктов QA-шпаргалки');
    }
    const counts = { added: 0, updated: 0, skipped: 0, groups: 0, unknownLists: 0 };
    const known = new Set((window.CHECKLISTS || []).map((c) => c.id));
    Object.keys(json.checklists).forEach((clId) => {
      if (!known.has(clId)) { counts.unknownLists++; return; }
      const src = json.checklists[clId] || {};
      const cur = loadCustom(clId);
      Object.keys(src.groups || {}).forEach((key) => {
        cur.groups[key] = cur.groups[key] || [];
        mergeItems(cur.groups[key], src.groups[key], counts);
      });
      (Array.isArray(src.extra) ? src.extra : []).forEach((g) => {
        if (!g || typeof g.title !== 'string' || !g.title.trim()) return;
        const id = typeof g.id === 'string' && g.id ? g.id : newId('cg-');
        let group = cur.extra.find((x) => x.id === id);
        if (!group) { group = { id, title: g.title.trim().slice(0, 100), items: [] }; cur.extra.push(group); counts.groups++; }
        else group.title = g.title.trim().slice(0, 100);
        mergeItems(group.items, g.items, counts);
      });
      saveCustom(clId, cur);
    });
    return counts;
  }

  // Кнопки «Экспорт» / «Импорт» — одинаково на главной и на странице чек-листа
  function wireCustomIO(exportBtn, importBtn, onImported) {
    exportBtn.addEventListener('click', () => {
      const data = exportCustom();
      const n = Object.values(data.checklists).reduce((s, c) => s + countCustom({ groups: c.groups, extra: c.extra }), 0);
      if (!n) { toast('Своих пунктов пока нет — экспортировать нечего'); return; }
      download('qa-cheatsheet-svoi-punkty-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2), 'application/json');
      toast('Экспортировано своих пунктов: ' + n);
    });
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.setAttribute('data-testid', 'custom:import-file');
    importBtn.after(input);
    importBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const c = importCustom(JSON.parse(String(reader.result)));
          let msg = 'Импорт: добавлено ' + c.added + ', обновлено ' + c.updated;
          if (c.groups) msg += ', новых групп ' + c.groups;
          if (c.skipped) msg += ', пропущено пустых ' + c.skipped;
          if (c.unknownLists) msg += ', неизвестных чек-листов ' + c.unknownLists;
          toast(msg);
          if (onImported) onImported(c);
        } catch (e) {
          toast(e instanceof SyntaxError ? 'Файл повреждён: это не JSON' : e.message);
        }
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // Тема: auto → light → dark
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: '◐ Авто', light: '☀ Светлая', dark: '☾ Тёмная' };
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(store.get('theme', 'auto'));

  // Чек-листов много — в шапке только разделы сайта; сами чек-листы — на главной и в переключателе
  function renderHeader(active) {
    const el = document.getElementById('site-header');
    if (!el) return;
    const links = [
      { href: 'index.html', label: 'Чек-листы', id: 'checklists' },
      { href: 'generator.html', label: 'Генератор', id: 'generator' },
    ];
    if (active !== 'generator') active = 'checklists';
    el.className = 'site';
    el.innerHTML =
      '<div class="container site-inner">' +
      '<a class="brand" href="index.html" data-testid="nav:home"><span class="brand-mark">QA</span><span class="brand-text">Шпаргалка</span></a>' +
      '<nav class="nav" aria-label="Разделы">' +
      links.map((l) => '<a href="' + l.href + '" data-testid="nav:link-' + l.id + '"' +
        (l.id === active ? ' class="active" aria-current="page"' : '') + '>' + esc(l.label) + '</a>').join('') +
      '</nav>' +
      '<button class="btn small" id="theme-toggle" type="button" title="Тема оформления" data-testid="nav:theme-toggle"></button>' +
      '</div>';
    const btn = el.querySelector('#theme-toggle');
    const update = () => { btn.textContent = THEME_LABEL[store.get('theme', 'auto')] || THEME_LABEL.auto; };
    update();
    btn.addEventListener('click', () => {
      const cur = store.get('theme', 'auto');
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      store.set('theme', next);
      applyTheme(next);
      update();
    });
  }

  let toastTimer = null;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('data-testid', 'toast');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function copyFallback(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function copy(text, msg) {
    const done = () => toast(msg || 'Скопировано');
    const fail = () => (copyFallback(text) ? done() : toast('Не удалось скопировать'));
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  window.QA = {
    store, esc, md, hash, itemText, itemHint, itemId, checklistStats, renderHeader, toast, copy, download,
    groupKey, newId, loadCustom, saveCustom, countCustom, mergedGroups, exportCustom, importCustom, wireCustomIO,
    checklistSections, checklistCard, renderSections,
  };
})();
