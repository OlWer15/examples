// Логика генератора без DOM: граничные значения, строки, наборы данных, контрольные суммы.
// Работает и в браузере (window.QAGen), и в Node (module.exports) — для проверок.
(function (root) {
  'use strict';

  /* ---------- Случайные числа с seed ---------- */

  function seedFrom(str) {
    const s = String(str).trim();
    if (/^\d{1,9}$/.test(s)) return Number(s);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // mulberry32: быстрый детерминированный генератор, одинаковый seed → одинаковые данные
  function makeRng(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.digits = (n) => {
      let s = '';
      for (let i = 0; i < n; i++) s += Math.floor(next() * 10);
      return s;
    };
    return next;
  }

  /* ---------- Строки ---------- */

  // Counterstring: «*3*5*7*9*12*» — каждое число показывает позицию следующей звёздочки,
  // поэтому по обрезанному тексту сразу видно, сколько символов поле приняло.
  function counterstring(n) {
    const out = [];
    let i = n;
    while (i > 0) {
      let part = i + '*';
      if (part.length > i) part = part.slice(part.length - i);
      out.unshift(part);
      i -= part.length;
    }
    return out.join('');
  }

  const FILL_SOURCES = {
    latin: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ',
    ru: 'Съешь же ещё этих мягких французских булок, да выпей чаю. ',
    cjk: '测试中文字符漢字日本語東京北京上海大阪香港台北首爾',
    arabic: 'مرحبا بالعالم هذا نص تجريبي للاختبار ',
  };
  const FILLS = [
    { id: 'counter', label: 'Counterstring *3*5*7…' },
    { id: 'latin', label: 'Латиница (Lorem ipsum)' },
    { id: 'ru', label: 'Кириллица (2 байта в UTF-8)' },
    { id: 'cjk', label: 'Иероглифы 漢字 (3 байта в UTF-8)' },
    { id: 'arabic', label: 'Арабская вязь مرحبا (справа налево)' },
    { id: 'emoji', label: 'Эмодзи 😀 (2 code units, 4 байта)' },
  ];
  const DEFAULT_FILL = 'counter';

  // Строка из повторяющегося источника; пробел на конце заменяем буквой,
  // чтобы обрезка пробелов в тестируемом поле не меняла длину
  function cycle(src, n) {
    if (n <= 0) return '';
    const s = src.repeat(Math.ceil(n / src.length)).slice(0, n);
    return s.endsWith(' ') ? s.slice(0, -1) + src[0] : s;
  }

  function makeStr(n, fill) {
    if (fill === 'counter') return counterstring(n);
    if (fill === 'emoji') return '😀'.repeat(n);
    return cycle(FILL_SOURCES[fill] || FILL_SOURCES.latin, n);
  }

  function strStats(s) {
    return {
      units: s.length,
      codePoints: Array.from(s).length,
      bytes: typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length,
    };
  }

  /* ---------- Граничные значения ---------- */
  // Строка: { v: значение, note: что проверяем, exp: ok | bad | check }

  function rowAdder(rows) {
    const seen = new Set();
    return (v, note, exp) => {
      const key = String(v);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ v: key, note, exp });
    };
  }

  function boundaryString(min, max, fill) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0) throw new Error('Длины — целые числа от 0');
    if (min > max) throw new Error('Минимум больше максимума');
    if (max > 1000000) throw new Error('Максимум больше 1 000 000 символов — браузер будет тормозить');
    const rows = [];
    const lens = new Set();
    const add = (n, note, exp) => {
      if (n < 0 || lens.has(n)) return;
      lens.add(n);
      rows.push({ v: n === 0 ? '' : makeStr(n, fill), note: note + ' — ' + n + ' симв.', exp, len: n });
    };
    if (min > 0) add(0, 'пустая строка', 'bad');
    if (min > 0) add(min - 1, 'на 1 меньше минимума', 'bad');
    add(min, min === 0 ? 'пустая строка (минимум)' : 'минимум', 'ok');
    if (min + 1 <= max) add(min + 1, 'минимум + 1', 'ok');
    add(Math.floor((min + max) / 2), 'середина диапазона', 'ok');
    if (max - 1 >= min) add(max - 1, 'максимум − 1', 'ok');
    add(max, 'максимум', 'ok');
    add(max + 1, 'на 1 больше максимума', 'bad');
    const base = Math.max(min, 1);
    rows.push({ v: ' '.repeat(base), note: 'только пробелы (' + base + ') — должно считаться пустым', exp: 'check' });
    rows.push({ v: ' ' + makeStr(Math.max(min - 2, 1), fill === 'emoji' ? 'a' : fill) + ' ', note: 'пробелы по краям — обрезаются? учитываются в длине?', exp: 'check' });
    if (max > 0 && fill !== 'emoji') {
      rows.push({ v: '😀'.repeat(max), note: max + ' эмодзи: в JS это ' + max * 2 + ' code units, в UTF-8 ' + max * 4 + ' байт — длина считается одинаково на фронте и бэке?', exp: 'check' });
    }
    if (max > 0 && fill !== 'ru' && fill !== 'cjk' && fill !== 'arabic') {
      rows.push({ v: 'a'.repeat(max - 1) + 'я', note: 'максимум, последний символ двухбайтный (я) — колонка в байтах обрежет', exp: 'check' });
    }
    return rows;
  }

  function boundaryInt(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max)) throw new Error('Нужны целые числа');
    if (min > max) throw new Error('Минимум больше максимума');
    const rows = [];
    const add = rowAdder(rows);
    const inRange = (n) => n >= min && n <= max;
    const mid = Math.floor((min + max) / 2);
    add(min - 1, 'на 1 меньше минимума', 'bad');
    add(min, 'минимум', 'ok');
    if (min + 1 <= max) add(min + 1, 'минимум + 1', 'ok');
    add(mid, 'середина диапазона', 'ok');
    if (max - 1 >= min) add(max - 1, 'максимум − 1', 'ok');
    add(max, 'максимум', 'ok');
    add(max + 1, 'на 1 больше максимума', 'bad');
    add(0, 'ноль', inRange(0) ? 'ok' : 'bad');
    add(-1, 'отрицательное', inRange(-1) ? 'ok' : 'bad');
    add('', 'пустое значение — обязательное поле?', 'check');
    add(min + '.5', 'дробное в целочисленном поле', 'bad');
    add(' ' + mid + ' ', 'пробелы по краям', 'check');
    if (mid >= 0) add('0' + mid, 'ведущий ноль', 'check');
    add('1e3', 'экспонента — input type="number" её принимает', 'check');
    add('abc', 'буквы', 'bad');
    add('−' + Math.max(Math.abs(mid), 1), 'типографский минус U+2212 вместо дефиса', 'check');
    add('2147483648', 'int32 + 1 — переполнение в БД или на бэке', inRange(2147483648) ? 'check' : 'bad');
    add('9007199254740993', 'больше Number.MAX_SAFE_INTEGER — JS теряет точность', 'bad');
    return rows;
  }

  function decimalsOf(x) {
    const s = String(x);
    if (s.includes('e-')) return Number(s.split('e-')[1]);
    return (s.split('.')[1] || '').length;
  }

  function boundaryDecimal(min, max, step) {
    if (![min, max, step].every(Number.isFinite)) throw new Error('Нужны числа');
    if (step <= 0) throw new Error('Шаг должен быть больше нуля');
    if (min > max) throw new Error('Минимум больше максимума');
    const d = Math.max(decimalsOf(step), decimalsOf(min), decimalsOf(max));
    const f = (x) => x.toFixed(d);
    const rows = [];
    const add = rowAdder(rows);
    const mid = Math.round(((min + max) / 2) / step) * step;
    add(f(min - step), 'на 1 шаг меньше минимума', 'bad');
    add(f(min), 'минимум', 'ok');
    if (min + step <= max) add(f(min + step), 'минимум + шаг', 'ok');
    add(f(mid), 'середина диапазона', 'ok');
    if (max - step >= min) add(f(max - step), 'максимум − шаг', 'ok');
    add(f(max), 'максимум', 'ok');
    add(f(max + step), 'на 1 шаг больше максимума', 'bad');
    add((min + step / 10).toFixed(d + 1), 'больше знаков после запятой, чем допускает шаг — округление или ошибка?', 'check');
    if (d > 0) add(f(Math.min(min + step, max)).replace('.', ','), 'запятая вместо точки (так вводят в RU и Европе)', 'check');
    add('.5', 'без нуля перед точкой', 'check');
    add('-0', 'минус ноль', 'check');
    add('', 'пустое значение', 'check');
    add('abc', 'буквы', 'bad');
    add('1 000.5', 'пробел как разделитель тысяч', 'check');
    return rows;
  }

  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(t);
    return d.getUTCDate() === +m[3] ? d : null;
  }

  const DATE_FORMATS = [
    { id: 'dmy', label: 'ДД.ММ.ГГГГ' },
    { id: 'iso', label: 'ГГГГ-ММ-ДД' },
    { id: 'mdy', label: 'ММ/ДД/ГГГГ' },
  ];

  function fmtParts(day, month, year, format) {
    if (format === 'iso') return year + '-' + pad(month) + '-' + pad(day);
    if (format === 'mdy') return pad(month) + '/' + pad(day) + '/' + year;
    return pad(day) + '.' + pad(month) + '.' + year;
  }

  function fmtDate(d, format) {
    return fmtParts(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear(), format);
  }

  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  function boundaryDate(minISO, maxISO, format, todayISO) {
    const min = parseISO(minISO);
    const max = parseISO(maxISO);
    if (!min || !max) throw new Error('Укажите обе даты');
    if (min > max) throw new Error('Начальная дата позже конечной');
    const today = parseISO(todayISO) || parseISO(new Date().toISOString().slice(0, 10));
    const inRange = (d) => d >= min && d <= max;
    const rows = [];
    const add = rowAdder(rows);
    const F = (d) => fmtDate(d, format);
    add(F(addDays(min, -1)), 'на день раньше минимума', 'bad');
    add(F(min), 'минимум', 'ok');
    if (addDays(min, 1) <= max) add(F(addDays(min, 1)), 'минимум + 1 день', 'ok');
    if (addDays(max, -1) >= min) add(F(addDays(max, -1)), 'максимум − 1 день', 'ok');
    add(F(max), 'максимум', 'ok');
    add(F(addDays(max, 1)), 'на день позже максимума', 'bad');
    add(F(today), 'сегодня', inRange(today) ? 'ok' : 'bad');

    const y0 = min.getUTCFullYear();
    let leap = y0;
    while (!isLeap(leap)) leap++;
    let nonLeap = y0;
    while (isLeap(nonLeap)) nonLeap++;
    const leapDay = new Date(Date.UTC(leap, 1, 29));
    add(F(leapDay), '29 февраля високосного года', inRange(leapDay) ? 'ok' : 'check');
    add(fmtParts(29, 2, nonLeap, format), '29 февраля невисокосного года — такой даты нет', 'bad');
    add(fmtParts(31, 4, y0, format), '31 апреля — такой даты нет', 'bad');
    add(fmtParts(0, 1, y0, format), 'нулевой день', 'bad');
    add(fmtParts(15, 13, y0, format), '13-й месяц', 'bad');
    add(fmtParts(1, 1, 1900, format), 'далёкое прошлое', inRange(new Date(Date.UTC(1900, 0, 1))) ? 'ok' : 'bad');
    add(fmtParts(31, 12, 9999, format), 'далёкое будущее', inRange(new Date(Date.UTC(9999, 11, 31))) ? 'ok' : 'bad');
    const other = format === 'iso' ? 'dmy' : 'iso';
    add(fmtDate(min, other), 'минимум в другом формате — принимается или понятная ошибка?', 'check');
    add(min.getUTCDate() + '.' + (min.getUTCMonth() + 1) + '.' + String(y0).slice(2), 'короткая запись без нулей и с 2-значным годом', 'check');
    add('', 'пустое значение', 'check');
    return rows;
  }

  /* ---------- Контрольные суммы ---------- */

  // ИНН физлица РФ: 10 цифр + 2 контрольные
  function innControls(first10) {
    const d = first10.split('').map(Number);
    const w1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const w2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const n11 = (w1.reduce((a, w, i) => a + w * d[i], 0) % 11) % 10;
    d.push(n11);
    const n12 = (w2.reduce((a, w, i) => a + w * d[i], 0) % 11) % 10;
    return '' + n11 + n12;
  }

  function luhnValid(num) {
    const digits = String(num).replace(/\D/g, '');
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let n = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return digits.length > 0 && sum % 10 === 0;
  }

  /* ---------- Наборы данных ---------- */
  // Язык набора задаётся параметром: ru — кириллица, en — латиница, zh — иероглифы, ar — арабская вязь,
  // mixed — у каждой строки свой случайный язык. Email и домены всегда латиницей (из имени).

  const LANGUAGES = [
    { id: 'ru', label: 'Кириллица (русский)' },
    { id: 'en', label: 'Латиница (английский)' },
    { id: 'zh', label: 'Иероглифы (китайский)' },
    { id: 'ar', label: 'Арабская вязь (арабский)' },
    { id: 'mixed', label: 'Вперемешку — у каждой строки свой язык' },
  ];
  const LANG_IDS = ['ru', 'en', 'zh', 'ar'];
  const DEFAULT_LANG = 'ru';

  // Мужские имена с отчествами: [имя, отчество муж., отчество жен.] — отчества выписаны явно, без правил
  const RU_M = [
    ['Александр', 'Александрович', 'Александровна'], ['Дмитрий', 'Дмитриевич', 'Дмитриевна'], ['Максим', 'Максимович', 'Максимовна'],
    ['Иван', 'Иванович', 'Ивановна'], ['Сергей', 'Сергеевич', 'Сергеевна'], ['Андрей', 'Андреевич', 'Андреевна'],
    ['Алексей', 'Алексеевич', 'Алексеевна'], ['Никита', 'Никитич', 'Никитична'], ['Михаил', 'Михайлович', 'Михайловна'],
    ['Егор', 'Егорович', 'Егоровна'], ['Артём', 'Артёмович', 'Артёмовна'], ['Павел', 'Павлович', 'Павловна'],
  ];
  const RU_F = ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Екатерина', 'Татьяна', 'Ксения', 'Дарья', 'Алиса', 'Юлия', 'Софья'];
  const RU_LAST = ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Волков', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Петров', 'Павлов', 'Фёдоров', 'Орлов'];
  // Апострофы и дефисы в фамилиях — нарочно: O'Connor и Smith-Jones ломают плохие формы
  const EN_M = ['James', 'John', 'Michael', 'David', 'Daniel', 'Thomas', 'Oliver', 'Henry', 'Lucas', 'Ethan', 'Noah', 'Leo'];
  const EN_F = ['Emma', 'Olivia', 'Sophia', 'Emily', 'Grace', 'Chloe', 'Lily', 'Hannah', 'Mia', 'Ella', 'Ava', 'Zoe'];
  const EN_LAST = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Miller', 'Wilson', 'Moore', 'Clark', 'Walker', 'Young', 'King', "O'Connor", 'Smith-Jones', 'McDonald'];
  // Китайские и арабские имена — с латинской записью, чтобы собрать email
  const ZH_LAST = [['王', 'wang'], ['李', 'li'], ['张', 'zhang'], ['刘', 'liu'], ['陈', 'chen'], ['杨', 'yang'], ['黄', 'huang'], ['赵', 'zhao'], ['吴', 'wu'], ['周', 'zhou'], ['欧阳', 'ouyang'], ['司马', 'sima']];
  const ZH_M = [['伟', 'wei'], ['强', 'qiang'], ['磊', 'lei'], ['军', 'jun'], ['洋', 'yang'], ['勇', 'yong'], ['杰', 'jie'], ['涛', 'tao'], ['明', 'ming'], ['浩', 'hao'], ['志强', 'zhiqiang'], ['建国', 'jianguo']];
  const ZH_F = [['芳', 'fang'], ['娜', 'na'], ['敏', 'min'], ['静', 'jing'], ['丽', 'li'], ['婷', 'ting'], ['雪', 'xue'], ['琳', 'lin'], ['慧', 'hui'], ['颖', 'ying'], ['美玲', 'meiling'], ['晓梅', 'xiaomei']];
  const AR_M = [['محمد', 'mohammed'], ['أحمد', 'ahmed'], ['علي', 'ali'], ['عمر', 'omar'], ['يوسف', 'yousef'], ['خالد', 'khaled'], ['حسن', 'hassan'], ['إبراهيم', 'ibrahim']];
  const AR_F = [['فاطمة', 'fatima'], ['مريم', 'maryam'], ['عائشة', 'aisha'], ['نور', 'nour'], ['سارة', 'sara'], ['ليلى', 'layla'], ['هدى', 'huda'], ['زينب', 'zainab']];
  const AR_LAST = [['الأحمد', 'alahmad'], ['العلي', 'alali'], ['الخطيب', 'alkhatib'], ['المصري', 'almasri'], ['الحسيني', 'alhusseini'], ['النجار', 'alnajjar'], ['الشامي', 'alshami'], ['حداد', 'haddad']];

  const RU_CITIES = [['Москва', '101000'], ['Санкт-Петербург', '190000'], ['Казань', '420000'], ['Екатеринбург', '620000'], ['Новосибирск', '630000'], ['Нижний Новгород', '603000']];
  const RU_STREETS = ['ул. Ленина', 'ул. Пушкина', 'пр. Мира', 'ул. Садовая', 'Невский пр.', 'ул. Гагарина', 'ул. Советская', 'наб. Фонтанки'];
  const EN_CITIES = [['Springfield', 'IL', '62701'], ['Riverside', 'CA', '92501'], ['Franklin', 'TN', '37064'], ['Greenville', 'SC', '29601'], ['Madison', 'WI', '53703'], ['Salem', 'OR', '97301']];
  const EN_STREETS = ['Main Street', 'Oak Avenue', 'Maple Drive', 'Park Lane', 'Elm Street', 'Cedar Road', 'Lake View Blvd'];
  const ZH_CITIES = [['北京市', '100000'], ['上海市', '200000'], ['广州市', '510000'], ['深圳市', '518000'], ['成都市', '610000'], ['杭州市', '310000']];
  const ZH_STREETS = ['建国路', '人民路', '解放路', '中山路', '长安街', '南京路', '和平路'];
  const AR_CITIES = ['الرياض', 'دبي', 'القاهرة', 'عمّان', 'الدوحة', 'بيروت'];
  const AR_STREETS = ['شارع الملك فهد', 'شارع الجامعة', 'شارع النيل', 'شارع الحرية', 'شارع السلام', 'شارع الاستقلال'];
  const US_AREAS = ['202', '212', '312', '415', '617', '305'];
  const INN_REGIONS = ['77', '78', '50', '66', '23', '16', '54'];
  // Код региона в серии паспорта РФ (первые 2 цифры серии)
  const PASSPORT_REGIONS = ['45', '40', '46', '92', '65', '50', '60', '03'];

  // Только зарезервированные под тесты зоны (RFC 2606/6761): письма не уйдут реальным людям
  const SAFE_ZONES = ['example.com', 'example.org', 'example.net', 'test', 'example'];
  const EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net', 'mail.example.com', 'example.test', 'posta.test', 'firma.example', 'corp.example.org'];
  const SUBDOMAINS = ['www', 'mail', 'shop', 'api', 'dev', 'static', 'm', 'admin', 'beta'];
  // IDN-домены в зарезервированных тестовых зонах IANA — под язык набора
  const IDN_DOMAINS = {
    ru: ['пример.испытание', 'магазин.испытание'],
    zh: ['例子.测试', '商店.测试'],
    ar: ['مثال.إختبار'],
    en: [],
  };

  // Слова для текстов в четырёх письменностях
  const WORDS = {
    en: ['order', 'delivery', 'fast', 'new', 'report', 'customer', 'check', 'discount', 'summer', 'important', 'service', 'product', 'payment', 'warehouse', 'request', 'sample', 'large', 'today', 'ready', 'address'],
    ru: ['заказ', 'доставка', 'быстрый', 'новый', 'отчёт', 'клиент', 'проверка', 'скидка', 'летний', 'важный', 'сервис', 'товар', 'оплата', 'склад', 'запрос', 'тестовый', 'большой', 'сегодня', 'готов', 'адрес'],
    zh: ['订单', '配送', '快速', '新', '报告', '客户', '检查', '折扣', '夏季', '重要', '服务', '产品', '付款', '仓库', '请求', '测试', '今天', '地址', '大', '准备'],
    ar: ['طلب', 'توصيل', 'سريع', 'جديد', 'تقرير', 'عميل', 'فحص', 'خصم', 'صيفي', 'مهم', 'خدمة', 'منتج', 'دفع', 'مستودع', 'اختبار', 'اليوم', 'عنوان', 'كبير', 'جاهز', 'عينة'],
  };
  // Как склеивать слова и ставить знаки препинания в каждой письменности
  const SCRIPT = {
    en: { sep: ' ', comma: ',', ends: ['.', '.', '.', '!', '?'] },
    ru: { sep: ' ', comma: ',', ends: ['.', '.', '.', '!', '?'] },
    zh: { sep: '', comma: '，', ends: ['。', '。', '。', '！', '？'] },
    ar: { sep: ' ', comma: '،', ends: ['.', '.', '.', '!', '؟'] },
  };
  const DOMAIN_WORDS = ['shop', 'market', 'delivery', 'cloud', 'data', 'pay', 'store', 'news', 'travel', 'books', 'fresh', 'smart', 'home', 'green', 'city'];
  const URL_PATHS = {
    ru: ['', '/', '/catalog', '/catalog/item-', '/api/v1/orders/', '/ru/kontakty', '/user/profile', '/search', '/каталог/товар'],
    en: ['', '/', '/catalog', '/catalog/item-', '/api/v1/orders/', '/en/contact', '/user/profile', '/search', '/blog/2026/10/'],
    zh: ['', '/', '/catalog', '/catalog/item-', '/api/v1/orders/', '/zh/联系', '/user/profile', '/search'],
    ar: ['', '/', '/catalog', '/catalog/item-', '/api/v1/orders/', '/ar/اتصل', '/user/profile', '/search'],
  };
  const URL_QUERIES = ['?page=2&sort=price', '?q=', '?utm_source=test&utm_medium=email', '?lang=', '?id=', '?filter[status]=active'];

  // Ловушки: пустые, граничные и необычные значения. Часть — невалидна намеренно.
  const TRAPS = {
    email: ['user+tag@example.com', "o'brien@example.com", 'USER@EXAMPLE.COM', 'test@пример.испытание', 'a@b.test', ' user@example.com ', 'user@@example.com', 'user@', ''],
    words: ['', '   ', '<b>жирный</b>', "O'Brien", '😀👍🏽👨‍👩‍👧', '中文测试', 'مرحبا بالعالم', 'строка 1\nстрока 2', '{{7*7}}', 'a b'],
    text: ['', '<script>alert(1)</script>', '"; DROP TABLE users; --', 'Ёжик 漢字 مرحبا Crème brûlée 😀', 'Z̤͔ͧ̑̓ä͖̭̈̇lͮ̒ͫǧ̗͚o̮̤', counterstring(1000)],
    // метка домена — максимум 63 символа: 63 валидно, 64 нет
    domain: ['пример.испытание', 'xn--e1afmkfd.xn--80akhbyknj4f', 'a'.repeat(63) + '.test', 'a'.repeat(64) + '.test', '-bad-.test', 'UPPER.TEST', 'trailing-dot.test.', 'localhost', '127.0.0.1', 'under_score.test'],
    url: ['http://localhost:8080/', 'https://пример.испытание/путь?q=тест', 'https://example.com/a b', 'javascript:alert(1)', 'https://user:pass@example.com/', 'example.com', 'https://example.com/?q=%', 'https://example.com/' + 'a'.repeat(2000)],
  };
  const TRAP_RATES = [
    { id: '0', label: 'Нет — только реалистичные' },
    { id: '0.1', label: '10% значений' },
    { id: '0.25', label: '25% значений' },
    { id: '0.5', label: '50% значений' },
  ];

  const RU_LAT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  function toAscii(s) {
    return s.toLowerCase().split('').map((c) => (c in RU_LAT ? RU_LAT[c] : c)).join('').replace(/[^a-z0-9]/g, '');
  }

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Имя, фамилия, отчество + латинская запись для email — под язык
  function makeName(r, lang, g) {
    if (lang === 'ru') {
      const father = r.pick(RU_M);
      const first = g === 'm' ? r.pick(RU_M)[0] : r.pick(RU_F);
      const last = r.pick(RU_LAST) + (g === 'f' ? 'а' : '');
      return { first, last, middle: g === 'm' ? father[1] : father[2], latFirst: toAscii(first), latLast: toAscii(last) };
    }
    if (lang === 'en') {
      const pool = g === 'm' ? EN_M : EN_F;
      const first = r.pick(pool);
      let middle = r.pick(pool);
      if (middle === first) middle = pool[(pool.indexOf(first) + 1) % pool.length];
      const last = r.pick(EN_LAST);
      return { first, last, middle, latFirst: first, latLast: last };
    }
    if (lang === 'zh') {
      // В китайских именах отчества нет — поле пустое; фамилия пишется перед именем
      const [first, latFirst] = r.pick(g === 'm' ? ZH_M : ZH_F);
      const [last, latLast] = r.pick(ZH_LAST);
      return { first, last, middle: '', latFirst, latLast };
    }
    // В арабском полном имени второе — имя отца
    const [first, latFirst] = r.pick(g === 'm' ? AR_M : AR_F);
    const [father] = r.pick(AR_M);
    const [last, latLast] = r.pick(AR_LAST);
    return { first, last, middle: father, latFirst, latLast };
  }

  function makeEmail(r, latFirst, latLast) {
    const local = toAscii(latFirst) + r.pick(['.', '_', '']) + toAscii(latLast) + (r() < 0.5 ? r.int(1, 99) : '');
    return local + '@' + r.pick(EMAIL_DOMAINS);
  }

  // Мобильные номера по странам. fictional: true — диапазоны, выделенные регуляторами для кино и тестов
  // (US 555-0100…0199, UK 07700 900xxx); остальные номера случайные и могут существовать — SMS на них не слать.
  const PHONE_COUNTRIES = [
    { id: 'ru', label: 'Россия (+7)', gen: (r) => '+7 9' + r.digits(2) + ' ' + r.digits(3) + '-' + r.digits(2) + '-' + r.digits(2) },
    { id: 'kz', label: 'Казахстан (+7 7…)', gen: (r) => '+7 7' + r.pick(['00', '01', '02', '05', '07', '08', '47', '71', '75', '76', '77', '78']) + ' ' + r.digits(3) + '-' + r.digits(2) + '-' + r.digits(2) },
    { id: 'by', label: 'Беларусь (+375)', gen: (r) => '+375 ' + r.pick(['25', '29', '33', '44']) + ' ' + r.digits(3) + '-' + r.digits(2) + '-' + r.digits(2) },
    { id: 'us', label: 'США (+1, вымышленные)', fictional: true, gen: (r) => '+1 (' + r.pick(US_AREAS) + ') 555-01' + pad(r.int(0, 99)) },
    { id: 'uk', label: 'Великобритания (+44, вымышленные)', fictional: true, gen: (r) => '+44 7700 900' + pad(r.int(0, 999), 3) },
    { id: 'de', label: 'Германия (+49)', gen: (r) => '+49 1' + r.pick(['51', '52', '57', '60', '62', '70', '71', '76']) + ' ' + r.digits(r.int(7, 8)) },
    { id: 'fr', label: 'Франция (+33)', gen: (r) => '+33 ' + r.pick(['6', '7']) + ' ' + r.digits(2) + ' ' + r.digits(2) + ' ' + r.digits(2) + ' ' + r.digits(2) },
    { id: 'tr', label: 'Турция (+90)', gen: (r) => '+90 5' + r.pick(['30', '32', '35', '41', '42', '43', '50', '53', '55']) + ' ' + r.digits(3) + ' ' + r.digits(2) + ' ' + r.digits(2) },
    { id: 'cn', label: 'Китай (+86)', gen: (r) => '+86 1' + r.pick(['3', '5', '8']) + r.digits(1) + ' ' + r.digits(4) + ' ' + r.digits(4) },
    { id: 'jp', label: 'Япония (+81)', gen: (r) => '+81 ' + r.pick(['70', '80', '90']) + ' ' + r.digits(4) + ' ' + r.digits(4) },
    { id: 'in', label: 'Индия (+91)', gen: (r) => '+91 ' + r.int(6, 9) + r.digits(4) + ' ' + r.digits(5) },
    { id: 'ae', label: 'ОАЭ (+971)', gen: (r) => '+971 5' + r.pick(['0', '2', '4', '5', '6', '8']) + ' ' + r.digits(3) + ' ' + r.digits(4) },
    { id: 'br', label: 'Бразилия (+55)', gen: (r) => '+55 ' + r.pick(['11', '21', '31', '41', '51', '61']) + ' 9' + r.digits(4) + '-' + r.digits(4) },
  ];
  const PHONE_CHOICES = [
    { id: 'lang', label: 'По языку данных' },
    ...PHONE_COUNTRIES.map((c) => ({ id: c.id, label: c.label })),
    { id: 'mixed', label: 'Все страны вперемешку' },
  ];
  const DEFAULT_PHONE_COUNTRY = 'lang';
  // «По языку данных»: английский — США или Великобритания (вымышленные), остальные — своя страна
  const PHONE_BY_LANG = { ru: ['ru'], en: ['us', 'uk'], zh: ['cn'], ar: ['ae'] };

  // Свой генератор под телефон (seed — одно число из основного): смена страны меняет только телефоны,
  // а имена, адреса и остальное в наборе остаются прежними
  function makePhone(phoneSeed, lang, choice) {
    const r = makeRng(phoneSeed);
    const ids = choice === 'mixed' ? PHONE_COUNTRIES.map((c) => c.id)
      : PHONE_COUNTRIES.some((c) => c.id === choice) ? [choice]
        : PHONE_BY_LANG[lang] || ['ru'];
    const id = r.pick(ids);
    const country = PHONE_COUNTRIES.find((c) => c.id === id);
    return { phone: country.gen(r), country: country.id };
  }

  function makeAddress(r, lang) {
    if (lang === 'en') {
      const [city, state, zip] = r.pick(EN_CITIES);
      return r.int(1, 9999) + ' ' + r.pick(EN_STREETS) + ', ' + city + ', ' + state + ' ' + zip;
    }
    if (lang === 'zh') {
      const [city, zip] = r.pick(ZH_CITIES);
      return city + r.pick(ZH_STREETS) + r.int(1, 300) + '号，' + zip;
    }
    if (lang === 'ar') return r.pick(AR_STREETS) + ' ' + r.int(1, 200) + '، ' + r.pick(AR_CITIES);
    const [city, zip] = r.pick(RU_CITIES);
    const flat = r() < 0.7 ? ', кв. ' + r.int(1, 300) : '';
    return zip + ', г. ' + city + ', ' + r.pick(RU_STREETS) + ', д. ' + r.int(1, 120) + flat;
  }

  function makeWords(r, lang) {
    const n = r.int(1, 4);
    const out = [];
    for (let i = 0; i < n; i++) out.push(r.pick(WORDS[lang]));
    return capitalize(out.join(SCRIPT[lang].sep));
  }

  function makeText(r, lang) {
    const sc = SCRIPT[lang];
    const sentences = [];
    const count = r.int(1, 3);
    for (let s = 0; s < count; s++) {
      const len = r.int(4, 12);
      const out = [];
      let prevNum = false;
      for (let i = 0; i < len; i++) {
        let w = r.pick(WORDS[lang]);
        const num = r.int(1, 500);
        // два числа подряд без пробела (в китайском) слиплись бы в одно
        const useNum = r() < 0.12 && !prevNum;
        if (useNum) w = String(num);
        prevNum = useNum;
        if (i < len - 1 && r() < 0.12) w += sc.comma;
        out.push(w);
      }
      sentences.push(capitalize(out.join(sc.sep)) + r.pick(sc.ends));
    }
    return sentences.join(sc.sep);
  }

  function makeDomain(r, lang) {
    const w = r.pick(DOMAIN_WORDS);
    const variant = r.int(0, 3);
    const w2 = r.pick(DOMAIN_WORDS);
    const num = r.int(1, 99);
    const label = variant === 0 ? w : variant === 1 ? w + '-' + w2 : variant === 2 ? w + num : w + w2;
    const sub = r() < 0.3 ? r.pick(SUBDOMAINS) + '.' : '';
    const zone = r.pick(SAFE_ZONES);
    const idnRoll = r();
    const idns = IDN_DOMAINS[lang];
    const idn = idns.length ? r.pick(idns) : '';
    return idn && idnRoll < 0.15 ? idn : sub + label + '.' + zone;
  }

  function makeUrl(r, domain, lang) {
    const scheme = r() < 0.85 ? 'https' : 'http';
    const port = r() < 0.1 ? ':' + r.pick(['8080', '8443', '3000']) : '';
    const id = r.int(1, 9999);
    let path = r.pick(URL_PATHS[lang]);
    if (path.endsWith('-') || path.endsWith('orders/')) path += id;
    let query = r() < 0.4 ? r.pick(URL_QUERIES) : '';
    if (query.endsWith('lang=')) query += lang;
    else if (query.endsWith('=')) query += query.includes('id=') ? id : encodeURIComponent(r.pick(WORDS[lang]));
    const frag = r() < 0.1 ? '#' + r.pick(['top', 'details', 'reviews']) : '';
    return scheme + '://' + domain + port + path + query + frag;
  }

  function makeInn(r) {
    const first10 = r.pick(INN_REGIONS) + r.digits(8);
    return first10 + innControls(first10);
  }

  // Паспорт РФ: серия — 2 цифры региона + 2 последние цифры года выдачи, номер — 6 цифр
  function makePassport(r, now) {
    const year = now.getUTCFullYear() - r.int(0, 15);
    return r.pick(PASSPORT_REGIONS) + pad(year % 100) + ' ' + r.int(100000, 999999);
  }

  // Строка генерируется целиком всегда — тогда при том же seed данные не зависят от выбранных колонок
  function makePerson(r, now, langParam, phoneChoice) {
    const langRoll = r.pick(LANG_IDS);
    const lang = LANG_IDS.includes(langParam) ? langParam : langRoll;
    const g = r() < 0.5 ? 'm' : 'f';
    const name = makeName(r, lang, g);
    const domain = makeDomain(r, lang);
    const phone = makePhone(Math.floor(r() * 4294967296), lang, phoneChoice);
    return {
      lang,
      phoneCountry: phone.country,
      first_name: name.first,
      last_name: name.last,
      middle_name: name.middle,
      email: makeEmail(r, name.latFirst, name.latLast),
      phone: phone.phone,
      inn: makeInn(r),
      passport: makePassport(r, now),
      address: makeAddress(r, lang),
      domain,
      url: makeUrl(r, r() < 0.5 ? domain : makeDomain(r, lang), lang),
      text: makeText(r, lang),
      words: makeWords(r, lang),
    };
  }

  const COLUMNS = [
    { id: 'first_name', label: 'Имя' },
    { id: 'last_name', label: 'Фамилия' },
    { id: 'middle_name', label: 'Отчество' },
    { id: 'email', label: 'Почта' },
    { id: 'phone', label: 'Телефон' },
    { id: 'inn', label: 'ИНН (РФ, валидный)' },
    { id: 'passport', label: 'Серия и номер паспорта (РФ)' },
    { id: 'address', label: 'Адрес' },
    { id: 'domain', label: 'Домен' },
    { id: 'url', label: 'URL' },
    { id: 'text', label: 'Текст (1–3 предложения)' },
    { id: 'words', label: 'Набор слов (1–4)' },
  ];
  const DEFAULT_COLUMNS = ['first_name', 'last_name', 'email', 'phone'];

  /* ---------- Префикс ---------- */
  // Префикс помечает тестовые записи, чтобы их было легко найти и удалить.
  // Ставится в начало текстовых полей; в email — в начало адреса, в домен и URL — в начало хоста.
  // ИНН, паспорт и телефон не трогаем — сломается формат. Ловушки тоже не трогаем.
  const PREFIX_TEXT_KEYS = ['first_name', 'last_name', 'middle_name', 'address', 'text', 'words'];

  // {n} — номер строки (с 1), {date} — дата ГГГГММДД
  function expandPrefix(template, n, now) {
    const date = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate());
    return String(template || '').replace(/\{n\}/g, String(n)).replace(/\{date\}/g, date);
  }

  // В локальной части email оставляем только безопасные символы
  const emailSafe = (s) => s.toLowerCase().replace(/[^a-z0-9._+-]/g, '').replace(/^\.+/, '');

  // В домене — буквы (в т.ч. не латинские, это IDN), цифры и дефис; остальное → дефис
  const hostSafe = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, '-').replace(/^-+/, '');

  function applyPrefix(row, prefix, trapped) {
    if (!prefix) return;
    PREFIX_TEXT_KEYS.forEach((k) => {
      // пустое отчество (китайские имена) префиксом не заполняем
      if (k in row && row[k] !== '' && !trapped.includes(k)) row[k] = prefix + row[k];
    });
    const ep = emailSafe(prefix);
    if ('email' in row && ep && !trapped.includes('email')) row.email = ep + row.email;
    const hp = hostSafe(prefix);
    if (!hp) return;
    if ('domain' in row && !trapped.includes('domain')) row.domain = hp + row.domain;
    if ('url' in row && !trapped.includes('url')) row.url = row.url.replace(/^(\w+:\/\/)/, '$1' + hp);
  }

  // Возвращает массив строк; rows.traps[i] — поля строки i с ловушкой, rows.langs[i] — язык строки,
  // rows.phoneCountries[i] — страна телефона.
  // opts: { trapRate: доля ловушек 0…1, prefix: шаблон префикса, lang: ru | en | zh | ar | mixed,
  //         phoneCountry: lang | mixed | id страны из PHONE_COUNTRIES }
  function generateRows(count, seed, selectedIds, now, opts) {
    const o = typeof opts === 'object' && opts ? opts : { trapRate: opts };
    const r = makeRng(seed);
    const rate = Number(o.trapRate) || 0;
    const lang = o.lang || DEFAULT_LANG;
    const phoneChoice = o.phoneCountry || DEFAULT_PHONE_COUNTRY;
    const sel = new Set(selectedIds);
    const keys = COLUMNS.filter((c) => sel.has(c.id)).map((c) => c.id);
    const at = now || new Date();
    const rows = [];
    rows.traps = [];
    rows.langs = [];
    rows.phoneCountries = [];
    for (let i = 0; i < count; i++) {
      const p = makePerson(r, at, lang, phoneChoice);
      // Бросок и выбор делаются всегда — тогда данные не зависят от доли ловушек и колонок
      const trapped = [];
      Object.keys(TRAPS).forEach((key) => {
        const roll = r();
        const value = r.pick(TRAPS[key]);
        if (roll >= rate) return;
        p[key] = value;
        trapped.push(key);
      });
      const row = {};
      keys.forEach((k) => { row[k] = p[k]; });
      applyPrefix(row, expandPrefix(o.prefix, i + 1, at), trapped);
      rows.push(row);
      rows.traps.push(trapped.filter((k) => k in row));
      rows.langs.push(p.lang);
      rows.phoneCountries.push(p.phoneCountry);
    }
    return rows;
  }

  function toCSV(rows, sep) {
    if (!rows.length) return '';
    const keys = Object.keys(rows[0]);
    const cell = (v) => {
      const s = String(v);
      return s.includes(sep) || /["\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [keys.join(sep)].concat(rows.map((r) => keys.map((k) => cell(r[k])).join(sep))).join('\r\n') + '\r\n';
  }

  /* ---------- Строки-ловушки ---------- */
  // v — значение; label — как показать (для невидимых символов); exp — ok/bad, если это валидность

  const STRING_SETS = [
    {
      title: 'Юникод и письменности',
      note: 'Сохраняется, ищется и отображается без порчи и «????».',
      items: [
        { v: 'Crème brûlée, naïve café', label: 'Crème brûlée (латиница с диакритикой)' },
        { v: 'Ёжик в тумане' },
        { v: 'ЁЛКА ёлка Ёлка', label: 'ЁЛКА ёлка (ё/е и регистр в поиске)' },
        { v: 'Straße → STRASSE', label: 'Straße (ß при upper → SS)' },
        { v: 'İstanbul ıi', label: 'İstanbul ıi (турецкие I, ломают lower/upper)' },
        { v: 'مرحبا بالعالم', label: 'مرحبا (арабский, справа налево)' },
        { v: 'שלום עולם', label: 'שלום (иврит, RTL)' },
        { v: '中文测试 日本語', label: '中文测试 日本語 (CJK)' },
        { v: '😀👍🏽👨‍👩‍👧', label: '😀👍🏽👨‍👩‍👧 (составные эмодзи)' },
        { v: 'é', label: 'é из двух символов (e + U+0301)' },
        { v: 'Z̤͔ͧ̑̓ä͖̭̈̇lͮ̒ͫǧ̗͚o̮̤', label: 'Zalgo-текст (наложенные знаки)' },
      ],
    },
    {
      title: 'Пробелы и невидимые символы',
      note: 'Обрезаются ли, считаются ли пустыми, не ломают ли поиск и сравнение.',
      items: [
        { v: '   ', label: '«   » только пробелы' },
        { v: ' ведущий пробел', label: '« ведущий пробел»' },
        { v: 'хвостовой пробел ', label: '«хвостовой пробел »' },
        { v: 'двойной  пробел', label: '«двойной  пробел»' },
        { v: 'a b', label: 'a␣b — неразрывный пробел U+00A0' },
        { v: 'a​b', label: 'a​b — zero-width space U+200B' },
        { v: '﻿text', label: 'BOM U+FEFF в начале' },
        { v: 'a\tb', label: 'a⇥b — табуляция' },
        { v: 'строка 1\nстрока 2', label: 'перенос строки ↵' },
        { v: '‮abc', label: 'U+202E — переворот направления текста' },
      ],
    },
    {
      title: 'Экранирование HTML и шаблонов',
      note: 'Должны отображаться как текст. Если что-то выполнилось или «49» вместо «{{7*7}}» — баг.',
      items: [
        { v: '<b>жирный</b>' },
        { v: '<script>alert(1)</script>' },
        { v: '"><img src=x onerror=alert(1)>' },
        { v: "javascript:alert(1)" },
        { v: '{{7*7}}' },
        { v: '${7*7}' },
        { v: '&lt;уже экранировано&gt;' },
        { v: '<!-- комментарий -->' },
      ],
    },
    {
      title: 'Кавычки, SQL и «особые» слова',
      note: 'Сохраняются как есть, не ломают запрос, поиск не находит «всё».',
      items: [
        { v: "O'Brien" },
        { v: "' OR '1'='1" },
        { v: '"; DROP TABLE users; --' },
        { v: '%' },
        { v: '_' },
        { v: '\\' },
        { v: 'null' },
        { v: 'NULL' },
        { v: 'undefined' },
        { v: 'true' },
        { v: '0' },
      ],
    },
    {
      title: 'Имена файлов и пути',
      note: 'Для загрузки файлов и полей с путями/URL.',
      items: [
        { v: '../../etc/passwd' },
        { v: '..\\..\\windows\\win.ini' },
        { v: 'файл с пробелами и кириллицей.pdf' },
        { v: 'report#1 100%.pdf' },
        { v: 'invoice.pdf.exe' },
        { v: 'CON.txt', label: 'CON.txt (зарезервировано в Windows)' },
        { v: '.htaccess' },
        { v: 'https://example.com/путь?q=1&x=2#якорь' },
      ],
    },
    {
      title: 'Email',
      note: 'Зелёные — валидные по RFC, красные — невалидные.',
      items: [
        { v: 'user@example.com', exp: 'ok' },
        { v: 'first.last@example.com', exp: 'ok' },
        { v: 'user+tag@example.com', exp: 'ok' },
        { v: 'USER@EXAMPLE.COM', exp: 'ok' },
        { v: 'user@sub.example.co.uk', exp: 'ok' },
        { v: 'o\'brien@example.com', exp: 'ok' },
        { v: 'plainaddress', exp: 'bad' },
        { v: '@example.com', exp: 'bad' },
        { v: 'user@', exp: 'bad' },
        { v: 'user@@example.com', exp: 'bad' },
        { v: 'user@example..com', exp: 'bad' },
        { v: 'user name@example.com', exp: 'bad' },
        { v: '.user@example.com', exp: 'bad' },
      ],
    },
    {
      title: 'Числа-ловушки',
      note: 'Для числовых полей, сумм и количеств.',
      items: [
        { v: '0' }, { v: '-0' }, { v: '007' }, { v: '1,5' }, { v: '1.5' }, { v: '1 000' },
        { v: '1e3' }, { v: 'NaN' }, { v: 'Infinity' }, { v: '0.1' },
        { v: '2147483648', label: '2147483648 (int32 + 1)' },
        { v: '9007199254740993', label: '9007199254740993 (> MAX_SAFE_INTEGER)' },
        { v: '٣', label: '٣ (арабская цифра 3)' },
      ],
    },
  ];

  const api = {
    seedFrom, makeRng, counterstring, makeStr, strStats, FILLS,
    boundaryString, boundaryInt, boundaryDecimal, boundaryDate, DATE_FORMATS, fmtDate, parseISO,
    innControls, luhnValid, DEFAULT_FILL,
    LANGUAGES, DEFAULT_LANG, PHONE_COUNTRIES, PHONE_CHOICES, DEFAULT_PHONE_COUNTRY, COLUMNS, DEFAULT_COLUMNS, TRAP_RATES, generateRows, expandPrefix, toCSV, STRING_SETS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QAGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
