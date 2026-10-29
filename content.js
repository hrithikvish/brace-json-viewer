(() => {
  if (!/json|text\/plain/i.test(document.contentType)) return;
  const pre = document.body?.querySelector(':scope > pre');
  if (!pre) return;
  const raw = pre.textContent;
  if (!/^\s*[[{]/.test(raw)) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  let indent = 2;
  let lineCount = 1;
  const lineNo = (n) => {
    const ln = el('span', 'ln');
    ln.dataset.n = n;
    return ln;
  };
  const nl = (depth) => ['\n', lineNo(++lineCount), ...Array.from({ length: depth }, () => el('span', 'i', ' '.repeat(indent)))];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(value, depth) {
    if (value === null || typeof value !== 'object') {
      const cls = value === null ? 'nul' : typeof value === 'string' ? 'str' : typeof value === 'number' ? 'num' : 'bool';
      return el('span', cls, JSON.stringify(value));
    }
    const isArr = Array.isArray(value);
    const keys = Object.keys(value);
    const node = el('span');
    if (!keys.length) {
      node.textContent = isArr ? '[]' : '{}';
      return node;
    }
    node.className = 'obj';
    node.value = value;
    const body = el('span', 'body');
    keys.forEach((k, i) => {
      body.append(...nl(depth + 1));
      const child = render(value[k], depth + 1);
      if (child.toggle) body.append(child.toggle);
      if (!isArr) body.append(el('span', 'key', JSON.stringify(k)), ': ');
      body.append(child);
      if (i < keys.length - 1) body.append(',');
    });
    body.append(...nl(depth));
    const more = el('span', 'more', ` …${keys.length} ${isArr ? 'items' : 'keys'} `);
    node.append(isArr ? '[' : '{', body, more, isArr ? ']' : '}');
    node.toggle = el('span', 'tog');
    node.toggle.onclick = more.onclick = () => {
      node.classList.toggle('closed');
      node.toggle.classList.toggle('closed');
      if (hovered === node) placeCopy();
    };
    return node;
  }

  const tree = render(data, 0);
  const parsed = el('pre', 'parsed');
  parsed.append(lineNo(1));
  if (tree.toggle) parsed.append(tree.toggle);
  parsed.append(tree);
  parsed.style.setProperty('--g', `${String(lineCount).length}ch`);

  // One shared button, moved next to the opening bracket of whichever object/array is hovered.
  const copyBtn = el('span', 'copy');
  copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
  const copyLabel = copyBtn.lastChild;
  let hovered = null;
  function placeCopy() {
    if (hovered.classList.contains('closed')) hovered.after(copyBtn);
    else hovered.insertBefore(copyBtn, hovered.querySelector(':scope > .body'));
  }
  parsed.addEventListener('mouseover', (e) => {
    if (e.target.closest('.copy')) return;
    const node = e.target.closest('.obj');
    if (!node || node === hovered) return;
    hovered = node;
    copyLabel.textContent = 'Copy';
    placeCopy();
  });
  parsed.addEventListener('mouseleave', () => {
    hovered = null;
    copyBtn.remove();
  });
  copyBtn.onclick = async () => {
    const text = JSON.stringify(hovered.value, null, indent);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // navigator.clipboard is unavailable on plain-http pages
      const ta = el('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    copyLabel.textContent = 'Copied';
  };

  const rawPre = el('pre', 'raw', raw);
  const btnParsed = el('button', 'on', 'Parsed');
  const btnRaw = el('button', null, 'Raw');
  const show = (isRaw) => {
    document.body.classList.toggle('show-raw', isRaw);
    btnRaw.classList.toggle('on', isRaw);
    btnParsed.classList.toggle('on', !isRaw);
  };
  btnParsed.onclick = () => show(false);
  btnRaw.onclick = () => show(true);

  /** A <select> whose value is applied immediately and persisted in chrome.storage.sync under [key]. */
  function setting(key, options, defaultValue, apply) {
    const select = el('select');
    options.forEach(([value, label]) => {
      const option = el('option', null, label);
      option.value = value;
      select.append(option);
    });
    const set = (value) => {
      select.value = value;
      apply(value);
    };
    select.onchange = () => {
      set(select.value);
      chrome.storage.sync.set({ [key]: select.value });
    };
    set(defaultValue);
    chrome.storage.sync.get(key, (saved) => options.some(([v]) => v === saved[key]) && set(saved[key]));
    return select;
  }

  const FONTS = {
    'JetBrains Mono': "'JetBrains Mono', Menlo, monospace",
    Monaco: 'Monaco, Menlo, monospace',
    Menlo: 'Menlo, monospace',
  };
  const bar = el('div', 'bar');
  bar.append(
    setting('font', Object.keys(FONTS).map((f) => [f, f]), 'JetBrains Mono', (f) => {
      document.body.style.fontFamily = FONTS[f];
    }),
    setting('indent', [['2', '2 spaces'], ['4', '4 spaces']], '2', (n) => {
      indent = Number(n);
      parsed.querySelectorAll('.i').forEach((i) => (i.textContent = ' '.repeat(indent)));
    }),
    setting('theme', [['system', 'System theme'], ['light', 'Light theme'], ['dark', 'Dark theme']], 'system', (t) => {
      document.documentElement.dataset.theme = t;
    }),
    btnParsed,
    btnRaw,
  );

  const DARK = `
    color-scheme: dark;
    --bg: #1e1e1e; --fg: #d4d4d4; --btn-bg: #2d2d2d; --btn-border: #555; --copy-bg: #2d2d2d; --copy-fg: #aaa; --copy-hover: #888;
    --key: #9cdcfe; --str: #ce9178; --num: #b5cea8; --lit: #569cd6;
    --tog: #888; --hover: #fff; --guide: rgba(255, 255, 255, .07); --dot: rgba(255, 255, 255, .18); --ln: #666;
  `;
  const style = el('style', null, `
    @font-face { font-family: 'JetBrains Mono'; src: url(${chrome.runtime.getURL('JetBrainsMono.woff2')}) format('woff2'); }
    :root {
      color-scheme: light dark;
      --bg: #fff; --fg: #222; --btn-bg: #f5f5f5; --btn-border: #ccc; --copy-bg: #fff; --copy-fg: #666; --copy-hover: #999;
      --key: #881391; --str: #c41a16; --num: #1c00cf; --lit: #0d22aa;
      --tog: #777; --hover: #000; --guide: rgba(0, 0, 0, .07); --dot: rgba(0, 0, 0, .2); --ln: #aaa;
    }
    :root[data-theme=light] { color-scheme: light; }
    @media (prefers-color-scheme: dark) { :root[data-theme=system] { ${DARK} } }
    :root[data-theme=dark] { ${DARK} }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 13px/1.5 ui-monospace, Menlo, monospace; }
    pre { margin: 0; padding: 12px 12px 12px 28px; white-space: pre-wrap; word-break: break-word; font: inherit; }
    .parsed { position: relative; padding-left: calc(var(--g) + 12px + 1.6em + 8px); }
    .ln { position: absolute; left: 8px; width: var(--g); text-align: right; color: var(--ln); user-select: none; }
    .ln::before { content: attr(data-n); }
    .raw, .show-raw .parsed { display: none; }
    .show-raw .raw { display: block; }
    .bar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: flex-end; gap: 4px; padding: 8px 12px; background: var(--bg); border-bottom: 1px solid var(--guide); }
    .bar button, .bar select { font: inherit; padding: 2px 10px; border: 1px solid var(--btn-border); border-radius: 4px; background: var(--btn-bg); color: inherit; cursor: pointer; }
    .bar button.on { font-weight: bold; border-color: #888; }
    .key { color: var(--key); } .str { color: var(--str); } .num { color: var(--num); } .bool, .nul { color: var(--lit); }
    .tog { position: absolute; left: calc(var(--g) + 12px); display: inline-flex; align-items: center; justify-content: center; width: 1.6em; height: 1.5em; cursor: pointer; user-select: none; color: var(--tog); }
    .tog:hover { color: var(--hover); }
    .tog::before { content: ''; width: 5px; height: 5px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: translateY(-2px) rotate(45deg); transition: transform .1s; }
    .tog.closed::before { transform: rotate(-45deg); }
    .i { display: inline-block; height: 1.5em; vertical-align: top; box-shadow: inset 1px 0 0 var(--guide); background: radial-gradient(circle, var(--dot) .8px, transparent 1.2px) 0 50% / 1ch 100% repeat-x; }
    .more { display: none; color: #999; cursor: pointer; user-select: none; }
    .closed > .body { display: none; } .closed > .more { display: inline; }
    .copy { position: absolute; display: inline-flex; align-items: center; gap: 4px; height: 16px; margin: 2px 0 0 2ch; padding: 0 6px; border: 1px solid var(--btn-border); border-radius: 4px; background: var(--copy-bg); color: var(--copy-fg); font: 11px/1 system-ui, sans-serif; white-space: nowrap; cursor: pointer; user-select: none; }
    .copy:hover { color: var(--hover); border-color: var(--copy-hover); }
  `);

  document.body.replaceChildren(style, bar, parsed, rawPre);
})();
