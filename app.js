// Мешок старт. Читает data/feed.json, который раз в час собирает scripts/build.mjs.

const $ = (sel, root = document) => root.querySelector(sel);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

// Безопасная сборка DOM, весь текст идет через textContent
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'href') el.setAttribute('href', safeUrl(v));
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function safeUrl(u) {
  try {
    const url = new URL(u, location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/* Тема */

const themeBtn = $('#theme');
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function paintThemeButton() {
  const dark = currentTheme() === 'dark';
  themeBtn.textContent = dark ? 'день' : 'ночь';
  themeBtn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить темную тему');
}
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
  paintThemeButton();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeButton);
paintThemeButton();

/* Дата и время */

function paintToday() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(now);
  $('#today').textContent = `${date}, ${time}`;
}
paintToday();
setInterval(paintToday, 30_000);

/* Поиск и нейросети */

const enc = encodeURIComponent;
const ENGINES = [
  { id: 'google', name: 'Google', url: (q) => `https://www.google.com/search?q=${enc(q)}` },
  { id: 'yandex', name: 'Яндекс', url: (q) => `https://yandex.ru/search/?text=${enc(q)}` },
];
// У Gemini и DeepSeek нет адреса с готовым запросом, поэтому копируем его в буфер
const AIS = [
  { id: 'chatgpt', name: 'ChatGPT', home: 'https://chatgpt.com/', url: (q) => `https://chatgpt.com/?q=${enc(q)}` },
  { id: 'claude', name: 'Claude', home: 'https://claude.ai/new', url: (q) => `https://claude.ai/new?q=${enc(q)}` },
  { id: 'perplexity', name: 'Perplexity', home: 'https://www.perplexity.ai/', url: (q) => `https://www.perplexity.ai/search?q=${enc(q)}` },
  { id: 'grok', name: 'Grok', home: 'https://grok.com/', url: (q) => `https://grok.com/?q=${enc(q)}` },
  { id: 'gemini', name: 'Gemini', home: 'https://gemini.google.com/app' },
  { id: 'deepseek', name: 'DeepSeek', home: 'https://chat.deepseek.com/' },
];

let engine = ENGINES.find((e) => e.id === store.get('engine', 'google')) || ENGINES[0];
let ai = AIS.find((a) => a.id === store.get('ai', 'chatgpt')) || AIS[0];
const input = $('#q');

function paintChoices() {
  const engines = $('#engines');
  engines.replaceChildren(
    ...ENGINES.map((e) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(e === engine),
        title: `Искать по Enter в ${e.name}`,
        text: e.name,
        onclick: () => {
          engine = e;
          store.set('engine', e.id);
          paintChoices();
          input.focus();
        },
      }),
    ),
  );
  $('#ais').replaceChildren(
    ...AIS.map((a) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(a === ai),
        title: a.url ? `Спросить ${a.name}` : `Скопировать запрос и открыть ${a.name}`,
        text: a.name,
        onclick: () => askAI(a),
      }),
    ),
  );
  const mod = isMac ? '⌘' : 'Ctrl';
  $('#hint').textContent = `Enter ищет в ${engine.name}, ${mod} Enter спрашивает ${ai.name}`;
}

async function askAI(a) {
  ai = a;
  store.set('ai', a.id);
  paintChoices();
  const q = input.value.trim();
  if (!q) return void (location.href = a.home);
  if (a.url) return void (location.href = a.url(q));
  try {
    await navigator.clipboard.writeText(q);
    toast(`Запрос скопирован, вставь его в ${a.name}`);
  } catch {
    toast(`Открываю ${a.name}, запрос придется вставить вручную`);
  }
  setTimeout(() => (location.href = a.home), 900);
}

$('#search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (q) location.href = engine.url(q);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    askAI(ai);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    input.focus();
  }
});
paintChoices();

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* Что нового с прошлого визита. Визит засчитывается, если вкладка провисела открытой 8 секунд */

const loadedAt = Date.now();
const lastVisit = store.get('lastVisit', 0);
setTimeout(() => {
  if (document.visibilityState === 'visible') store.set('lastVisit', loadedAt);
}, 8000);
const isNew = (ts) => lastVisit > 0 && ts && new Date(ts).getTime() > lastVisit;

/* Форматирование */

const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
function stamp(ts, win) {
  if (!ts) return '';
  const d = new Date(ts);
  if (win === 'day') return timeFmt.format(d);
  return d.toISOString().slice(0, 10);
}
function ago(ts) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 2) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.round(min / 60);
  return `${hrs} ч назад`;
}
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/* Матрица охвата. Пять колонок, по одной на сообщество */

const COLUMNS = [
  { key: 'HN', name: 'Hacker News', sources: ['hn'] },
  { key: 'ХБ', name: 'Хабр', sources: ['habr'] },
  { key: 'GH', name: 'GitHub', sources: ['github'] },
  { key: 'HF', name: 'Hugging Face и OpenRouter', sources: ['hfpapers', 'hfmodels', 'openrouter'] },
  { key: 'TG', name: 'Telegram', sources: ['telegram'] },
];

function matrix(cluster) {
  return h(
    'div',
    { class: 'matrix', 'aria-label': `Где обсуждают, ${cluster.sources.length} ${plural(cluster.sources.length, 'источник', 'источника', 'источников')}` },
    COLUMNS.map((col) => {
      const hits = cluster.items.filter((i) => col.sources.includes(i.source));
      const n = col.key === 'TG' ? new Set(hits.map((i) => i.label)).size : hits.length;
      const glyph = n === 0 ? '·' : col.key === 'TG' && n > 1 ? String(Math.min(n, 9)) : '■';
      const tip = n === 0 ? `${col.name}, нет` : col.key === 'TG' ? `Telegram, ${n} ${plural(n, 'канал', 'канала', 'каналов')}` : col.name;
      return h('span', { class: n ? 'on' : null, title: tip, 'aria-hidden': 'true', text: glyph });
    }),
  );
}

function refLink(r) {
  return h(
    'a',
    { href: r.discussUrl || r.url, title: r.title && r.title !== r.titleRu ? r.title : null },
    h('span', { class: 'src', text: r.label }),
    r.metric ? ` ${r.metric}` : '',
  );
}

function refs(cluster) {
  const list = cluster.items;
  const shown = list.slice(0, 3);
  const rest = list.slice(3);
  const p = h('p', { class: 'refs' });
  const put = (items) =>
    items.forEach((r, i) => {
      if (p.childNodes.length) p.append(h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }), ' ');
      p.append(refLink(r));
    });
  put(shown);
  if (rest.length) {
    const more = h('button', {
      class: 'link-btn more',
      type: 'button',
      text: `еще ${rest.length}`,
      onclick: () => {
        more.remove();
        put(rest);
      },
    });
    p.append(h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }), ' ', more);
  }
  return p;
}

function row(cluster, win) {
  const primary = cluster.items[0];
  const original = primary.title && primary.title !== cluster.title ? primary.title : null;
  return h(
    'li',
    { class: `row${isNew(cluster.ts) ? ' is-new' : ''}`, id: cluster.id },
    h('div', { class: 'gutter', title: isNew(cluster.ts) ? 'Новое с прошлого визита' : null, text: stamp(cluster.ts, win) }),
    h(
      'div',
      { class: 'content' },
      h(
        'h3',
        { class: 'title' },
        h('a', { href: cluster.url, title: original ? `Оригинал. ${original}` : null, text: cluster.title }),
        cluster.lang === 'en' ? h('span', { class: 'tag', title: 'Ссылка ведет на английский текст', text: 'EN' }) : null,
        cluster.ruUrl ? h('a', { class: 'ru-link', href: cluster.ruUrl, text: 'по-русски' }) : null,
      ),
      cluster.summary ? h('p', { class: 'summary', text: cluster.summary }) : null,
      refs(cluster),
    ),
    matrix(cluster),
  );
}

/* Состояние */

let data = null;
let tab = 'day';
let onlyNew = false;

function newCount(win) {
  return (data?.windows?.[win] || []).filter((c) => isNew(c.ts)).length;
}

function paintTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  const btn = $('#only-new');
  const n = tab === 'models' ? 0 : newCount(tab);
  btn.hidden = tab === 'models' || (!n && !onlyNew);
  btn.setAttribute('aria-pressed', String(onlyNew));
  btn.textContent = `${onlyNew ? '[x]' : '[ ]'} только новое, ${n}`;
}

function paintFeed() {
  const panel = $('#panel');
  const list = (data.windows[tab] || []).filter((c) => !onlyNew || isNew(c.ts));
  if (!list.length) {
    panel.replaceChildren(
      onlyNew
        ? h('p', { class: 'empty' }, 'Нового с прошлого визита нет. ', h('button', { class: 'link-btn', type: 'button', text: 'Показать всю ленту', onclick: () => { onlyNew = false; paint(); } }))
        : h('p', { class: 'empty', text: 'В этом окне пока пусто. Лента обновится в начале следующего часа.' }),
    );
    return;
  }
  const head = h(
    'div',
    { class: 'feed-head', 'aria-hidden': 'true' },
    h('span'),
    h('span', { class: 'where', text: 'где обсуждают' }),
    h('div', { class: 'matrix' }, COLUMNS.map((c) => h('span', { title: c.name, text: c.key }))),
  );
  panel.replaceChildren(head, h('ol', { class: 'feed' }, list.map((c) => row(c, tab))));
}

function priceText(m) {
  if (!m.price) return 'зависит от модели';
  if (m.free) return 'бесплатно';
  return `$${m.price.in} / $${m.price.out}`;
}

function contextText(n) {
  if (!n) return '';
  if (n >= 1e6) return `${Math.floor(n / 1e5) / 10}M`.replace('.', ',');
  return `${Math.round(n / 1000)}к`;
}

function paintModels() {
  const m = data.models || {};
  const blocks = [];
  if (m.openrouter?.length) {
    blocks.push(
      h(
        'section',
        { class: 'models-block' },
        h('h2', { class: 'label', text: 'новые модели в OpenRouter за две недели' }),
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'models' },
            h('thead', {}, h('tr', {}, h('th', { text: 'дата' }), h('th', { text: 'модель' }), h('th', { class: 'num', text: 'цена за 1M токенов' }), h('th', { class: 'num', text: 'контекст' }))),
            h(
              'tbody',
              {},
              m.openrouter.map((x) =>
                h(
                  'tr',
                  {},
                  h('td', { class: 'date', text: x.ts.slice(0, 10) }),
                  h('td', {}, h('a', { class: 'name', href: x.url, text: x.name }), h('span', { class: 'sub', text: x.id })),
                  h('td', { class: 'num', text: priceText(x) }),
                  h('td', { class: 'num', text: contextText(x.context) }),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
  if (m.huggingface?.length) {
    blocks.push(
      h(
        'section',
        { class: 'models-block' },
        h('h2', { class: 'label', text: 'в тренде на Hugging Face' }),
        h(
          'ol',
          { class: 'toc' },
          m.huggingface.map((x) =>
            h('li', {}, h('a', { class: 'name', href: x.url, text: x.id }), h('span', { class: 'leader' }), h('span', { class: 'meta', text: [x.task, `${x.likes} лайков`].filter(Boolean).join(', ') })),
          ),
        ),
      ),
    );
  }
  if (m.producthunt?.length) {
    blocks.push(
      h(
        'section',
        { class: 'models-block' },
        h('h2', { class: 'label', text: 'запуски на Product Hunt' }),
        h(
          'ul',
          { class: 'toc launches' },
          m.producthunt.map((x) =>
            h('li', { style: 'display:block' }, h('h3', { class: 'title' }, h('a', { href: x.url, text: x.titleRu || x.title })), x.summaryRu ? h('p', { class: 'summary', text: x.summaryRu }) : null),
          ),
        ),
      ),
    );
  }
  $('#panel').replaceChildren(...(blocks.length ? blocks : [h('p', { class: 'empty', text: 'Список моделей пока пуст.' })]));
}

function paintDigest() {
  const box = $('.digest');
  const points = data.digest || [];
  box.hidden = !points.length;
  $('#digest').replaceChildren(
    ...points.map((p) =>
      h(
        'li',
        {},
        h(
          'button',
          { type: 'button', onclick: () => jumpTo(p.ref) },
          h('span', { class: 'prompt', 'aria-hidden': 'true', text: '>' }),
          h('span', { class: 'digest-text', text: p.text }),
        ),
      ),
    ),
  );
}

function jumpTo(id) {
  if (tab !== 'day' || onlyNew) {
    tab = 'day';
    onlyNew = false;
    paint();
  }
  const el = document.getElementById(id);
  if (!el) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  el.querySelector('.title a')?.focus({ preventScroll: true });
}

function paintSide() {
  const side = $('#side');
  const blocks = [];
  const t = data.tool;
  if (t) {
    blocks.push(
      h(
        'section',
        { class: 'side-block' },
        h('h2', { class: 'label', text: 'инструмент дня' }),
        h('h3', { class: 'tool-name' }, t.icon ? h('img', { src: t.icon, alt: '', width: '22', height: '22' }) : null, t.name),
        h('p', { class: 'tool-what', text: t.what }),
        t.tip ? h('p', { class: 'tool-tip' }, h('strong', { text: 'Попробуй сегодня. ' }), t.tip) : null,
        h('a', { class: 'tool-open', href: t.url, text: `Открыть ${t.domain}` }),
      ),
    );
  }
  const fresh = (data.models?.openrouter || []).slice(0, 6);
  if (fresh.length) {
    blocks.push(
      h(
        'section',
        { class: 'side-block' },
        h('h2', { class: 'label', text: 'новые модели' }),
        h(
          'ol',
          { class: 'toc' },
          fresh.map((m) => h('li', {}, h('a', { class: 'name', href: m.url, text: m.name, title: m.id }), h('span', { class: 'leader' }), h('span', { class: 'meta', text: priceText(m) }))),
        ),
        h('button', { class: 'link-btn all-models', type: 'button', text: 'Все модели и цены', onclick: () => { tab = 'models'; paint(); $('.tabs').scrollIntoView({ block: 'start' }); } }),
      ),
    );
  }
  side.replaceChildren(...blocks);
}

const SOURCE_RU = {
  hn_day: 'Hacker News', hn_week: 'Hacker News', hf_papers: 'HF Papers', github_day: 'GitHub', github_week: 'GitHub',
  habr_day: 'Хабр', habr_week: 'Хабр', producthunt: 'Product Hunt', hf_models: 'Hugging Face', openrouter: 'OpenRouter', telegram: 'Telegram',
};

function paintFoot() {
  const st = data.status || {};
  const failed = [...new Set(Object.entries(st).filter(([, v]) => !v.ok).map(([k]) => SOURCE_RU[k] || k))];
  const channels = Object.keys(st.telegram?.channels || {}).length;
  $('#foot').replaceChildren(
    h(
      'p',
      {},
      `Собирает `,
      h('a', { href: 'https://t.me/prompt_design', text: 'Силиконовый мешок' }),
      `. Раз в час из Hacker News, Хабра, GitHub, Hugging Face, Product Hunt, OpenRouter и ${channels} ${plural(channels, 'Telegram-канала', 'Telegram-каналов', 'Telegram-каналов')}. Заголовки переводит и склеивает нейросеть, ссылки ведут на оригиналы.`,
    ),
    h(
      'p',
      {},
      `Обновлено ${ago(data.generatedAt)}`,
      failed.length ? `. Не ответили ${failed.join(', ')}` : '',
    ),
  );
}

function paintCounts() {
  $('#count-day').textContent = data.windows.day?.length || '';
  $('#count-week').textContent = data.windows.week?.length || '';
  $('#count-models').textContent = data.models?.openrouter?.length || '';
}

function paint() {
  paintTabs();
  if (tab === 'models') paintModels();
  else paintFeed();
}

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    tab = t.dataset.tab;
    onlyNew = false;
    paint();
  }),
);
$('#only-new').addEventListener('click', () => {
  onlyNew = !onlyNew;
  paint();
});

function render(feed) {
  data = feed;
  paintCounts();
  paintDigest();
  paint();
  paintSide();
  paintFoot();
}

/* Загрузка. Сначала показываем ленту из прошлого открытия, потом свежую */

const cached = store.get('feed', null);
if (cached?.windows) render(cached);

fetch('data/feed.json', { cache: 'no-cache' })
  .then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then((feed) => {
    if (!cached || cached.generatedAt !== feed.generatedAt) render(feed);
    store.set('feed', feed);
  })
  .catch(() => {
    if (!cached) $('#panel').replaceChildren(h('p', { class: 'empty', text: 'Лента не загрузилась. Обнови страницу через минуту.' }));
  });
