import type { PanelLayout } from './layout.ts';
import type { QuestionSummary } from './types.ts';
import type { HistoryState } from './history.ts';

const CSS = `
  :host { all: initial; position: fixed; z-index: 1000; font: 13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    color: #292929; --surface: #f9f9f9; --hover: #ededed; --selected: #e7e7e7; --muted: #858585; --focus: #737373; }
  :host([hidden]) { display: none !important; }
  * { box-sizing: border-box; }
  .panel { display: flex; flex-direction: column; max-height: inherit; width: 100%; padding: 8px;
    border-radius: 12px; background: var(--surface); overflow: hidden; }
  header { display: flex; gap: 8px; align-items: center; padding: 2px 4px 10px 8px; flex: none; }
  h2 { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); }
  button, input { font: inherit; color: inherit; }
  button { cursor: pointer; border: 0; background: transparent; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  svg { display: block; width: 16px; height: 16px; flex: none; pointer-events: none; }
  .collapse, .clear { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 6px; color: var(--muted); }
  .collapse { margin-left: auto; }
  .collapse:hover, .clear:hover, .expand:hover { background: var(--hover); color: inherit; }
  .search { display: flex; align-items: center; flex: none; margin: 0 4px 8px; padding: 0 7px; gap: 6px; border-radius: 8px; color: var(--muted); }
  .search:focus-within { background: var(--hover); }
  input { min-width: 0; width: 100%; height: 32px; border: 0; border-radius: 5px; background: transparent; padding: 0; font-size: 12px; }
  input::placeholder { color: var(--muted); opacity: 1; }
  input::-webkit-search-cancel-button { -webkit-appearance: none; }
  .clear { width: 20px; height: 20px; }
  .clear:disabled { visibility: hidden; }
  .count { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  ol { margin: 0; padding: 0; list-style: none; overflow-y: auto; min-height: 0; flex: 0 1 auto;
    overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #9995 transparent; }
  li + li { margin-top: 2px; }
  .question { width: 100%; display: flex; text-align: start; padding: 8px 10px; border-radius: 8px; line-height: 20px; transition: background 120ms ease; }
  .question:hover { background: var(--hover); }
  .question[aria-current="true"] { background: var(--selected); }
  .number { display: none; }
  .preview { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { padding: 12px 10px; color: var(--muted); font-size: 12px; }
  .expand { display: grid; place-items: center; width: 36px; height: 36px; color: var(--muted); background: var(--surface); border-radius: 8px; }
  .rail { display: flex; flex-direction: column; max-height: inherit; width: 36px; }
  .rail .expand { flex: none; height: 26px; background: transparent; opacity: 0; }
  .rail:hover .expand, .rail:focus-within .expand { opacity: 1; }
  .rail .expand:hover { background: var(--hover); }
  .ticks { padding: 2px 0; scrollbar-width: none; }
  .ticks::-webkit-scrollbar { display: none; }
  .ticks li + li { margin: 0; }
  .tick { display: grid; place-items: center; width: 36px; height: 12px; padding: 0; border-radius: 3px; }
  .tick::after { content: ''; width: 6px; height: 2px; border-radius: 1px; background: #d1d1d1; }
  .tick[aria-current="true"]::after { width: 24px; background: #171717; }
  .tick:hover::after, .tick:focus-visible::after { width: 24px; background: #555; }
  .tooltip { position: absolute; width: var(--preview-width); border: 1px solid #d8d8d8;
    border-radius: 14px; background: #fff; box-shadow: 0 10px 28px #00000014; pointer-events: auto; }
  .preview-jump { display: block; width: 100%; padding: 12px 15px; border-radius: 14px; text-align: start; }
  .tooltip-number { display: block; color: #171717; font-size: 14px; font-weight: 600; line-height: 22px;
    margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tooltip-text { color: #888; font-size: 13px; font-weight: 450; line-height: 21px; display: -webkit-box;
    -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .footer { flex: none; padding: 8px 4px 2px; margin-top: 8px; border-top: 1px solid #8882; }
  .scan-history { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 32px; border-radius: 8px;
    color: var(--muted); font-size: 12px; background: var(--hover); }
  .scan-history:hover { color: inherit; background: var(--selected); }
  .scan-status { font-size: 11px; color: var(--muted); line-height: 17px; padding: 7px 3px 0; overflow-wrap: anywhere; }
  .rail .scan-rail { display: grid; place-items: center; height: 26px; width: 36px; flex: none; border-radius: 6px; color: var(--muted); opacity: 0; }
  .rail:hover .scan-rail, .rail:focus-within .scan-rail, .scan-rail[data-busy="true"] { opacity: 1; }
  .scan-rail:hover { background: var(--hover); color: inherit; }
  .tick:disabled, .question:disabled { cursor: progress; opacity: .65; }
  [hidden] { display: none !important; }
  :host([data-theme="dark"]) { color: #e3e3e3; --surface: #191919; --hover: #252525; --selected: #303030; --muted: #999; --focus: #aaa; }
  :host([data-theme="dark"]) .tooltip { background: #252525; border-color: #444; box-shadow: 0 10px 28px #0004; }
  :host([data-theme="dark"]) .tooltip-number { color: #eee; }
  :host([data-theme="dark"]) .tooltip-text { color: #aaa; }
  :host([data-theme="dark"]) .tick::after { background: #555; }
  :host([data-theme="dark"]) .tick[aria-current="true"]::after,
  :host([data-theme="dark"]) .tick:hover::after, :host([data-theme="dark"]) .tick:focus-visible::after { background: #d4d4d4; }
  @media (prefers-reduced-motion: reduce) { .question { transition: none; } }
`;

function icon(document: Document, path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path'); line.setAttribute('d', path);
  svg.append(line); return svg;
}
const SIDEBAR_ICON = 'M9 4v16M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z';

export function createQuestionPanel(document: Document, onJump: (key: string) => void, onCollapse: () => void, onScan: () => void = () => {}) {
  const host = document.createElement('div');
  host.setAttribute('data-cge-question-navigation', '');
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = CSS;
  const panel = document.createElement('section'); panel.className = 'panel'; panel.setAttribute('role', 'navigation'); panel.setAttribute('aria-label', '会话问题导航');
  const header = document.createElement('header');
  const title = document.createElement('h2'); title.textContent = '本次对话';
  const collapse = document.createElement('button'); collapse.className = 'collapse'; collapse.type = 'button';
  collapse.append(icon(document, SIDEBAR_ICON)); collapse.title = '收起问题导航'; collapse.setAttribute('aria-label', '收起问题导航');
  collapse.setAttribute('aria-expanded', 'true'); collapse.setAttribute('aria-controls', 'question-panel');
  panel.id = 'question-panel';
  collapse.addEventListener('click', onCollapse);
  const search = document.createElement('div'); search.className = 'search';
  const input = document.createElement('input'); input.type = 'search'; input.placeholder = '搜索问题'; input.setAttribute('aria-label', '搜索当前会话的问题');
  const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'clear';
  clear.append(icon(document, 'm7 7 10 10M17 7 7 17')); clear.title = '清除搜索'; clear.setAttribute('aria-label', '清除搜索');
  const count = document.createElement('span'); count.className = 'count'; count.setAttribute('aria-live', 'polite');
  header.append(title, count, collapse);
  const list = document.createElement('ol'); list.setAttribute('aria-label', '当前会话已识别的问题');
  const rail = document.createElement('nav'); rail.className = 'rail'; rail.setAttribute('aria-label', '问题刻度导航');
  const ticks = document.createElement('ol'); ticks.className = 'ticks'; ticks.setAttribute('aria-label', '当前会话已识别的问题');
  const tooltip = document.createElement('div'); tooltip.className = 'tooltip'; tooltip.id = 'question-preview'; tooltip.setAttribute('role', 'group'); tooltip.setAttribute('aria-label', '历史问题预览'); tooltip.hidden = true;
  const tooltipNumber = document.createElement('div'); tooltipNumber.className = 'tooltip-number';
  const tooltipText = document.createElement('div'); tooltipText.className = 'tooltip-text';
  const previewJump = document.createElement('button'); previewJump.type = 'button'; previewJump.className = 'preview-jump';
  previewJump.append(tooltipNumber, tooltipText); tooltip.append(previewJump);
  const expand = document.createElement('button'); expand.type = 'button'; expand.className = 'expand'; expand.append(icon(document, SIDEBAR_ICON));
  expand.title = '展开问题导航'; expand.setAttribute('aria-label', '展开问题导航');
  expand.setAttribute('aria-expanded', 'false'); expand.setAttribute('aria-controls', 'question-panel');
  expand.addEventListener('click', onCollapse);
  const footer = document.createElement('div'); footer.className = 'footer';
  const scan = document.createElement('button'); scan.type = 'button'; scan.className = 'scan-history';
  scan.append(icon(document, 'M4 8V4m0 0h4M4 4l4 4M5 14a7 7 0 1 0 2-8M12 8v5l3 2'));
  const scanLabel = document.createElement('span'); scanLabel.textContent = '扫描历史问题'; scan.append(scanLabel);
  scan.addEventListener('click', onScan);
  const scanStatus = document.createElement('div'); scanStatus.className = 'scan-status'; scanStatus.setAttribute('role', 'status'); scanStatus.setAttribute('aria-live', 'polite');
  const scanRail = document.createElement('button'); scanRail.type = 'button'; scanRail.className = 'scan-rail';
  scanRail.append(icon(document, 'M4 8V4m0 0h4M4 4l4 4M5 14a7 7 0 1 0 2-8M12 8v5l3 2'));
  scanRail.title = '扫描历史问题，结束后返回原阅读位置'; scanRail.setAttribute('aria-label', '扫描历史问题'); scanRail.addEventListener('click', onScan);
  let questions: readonly QuestionSummary[] = [];
  let mountedCount = 0;
  let busy = false;
  let active: string | null = null;
  let collapsed = true;
  panel.hidden = true;
  collapse.setAttribute('aria-expanded', 'false');
  host.dataset.mode = 'rail';
  let previewWidth = 0;
  let layoutHeight = 0;
  let previewTrigger: HTMLButtonElement | null = null;
  let previewKey: string | null = null;
  let hideTimer: number | undefined;
  const buttons = new Map<string, HTMLButtonElement>();
  const tickButtons = new Map<string, HTMLButtonElement>();
  function hidePreview(): void {
    document.defaultView!.clearTimeout(hideTimer); hideTimer = undefined; previewKey = null;
    tooltip.hidden = true; tooltipNumber.textContent = ''; tooltipText.textContent = '';
    previewTrigger?.removeAttribute('aria-describedby'); previewTrigger = null;
  }
  function deferHide(): void { document.defaultView!.clearTimeout(hideTimer); hideTimer = document.defaultView!.setTimeout(hidePreview, 150); }
  const keepPreview = () => { document.defaultView!.clearTimeout(hideTimer); hideTimer = undefined; };
  tooltip.addEventListener('pointerenter', keepPreview); tooltip.addEventListener('pointerleave', deferHide);
  tooltip.addEventListener('focusin', keepPreview); tooltip.addEventListener('focusout', deferHide);
  previewJump.addEventListener('click', () => { const key = previewKey; hidePreview(); if (key && !busy) onJump(key); });
  const outside = (event: Event) => { if (!event.composedPath().includes(host)) hidePreview(); };
  document.addEventListener('pointerdown', outside);
  function showPreview(button: HTMLButtonElement, question: QuestionSummary): void {
    hidePreview();
    if (host.hidden || previewWidth < 120 || busy) return;
    previewKey = question.key;
    tooltipNumber.textContent = question.preview; tooltipText.textContent = question.tooltip;
    previewJump.setAttribute('aria-label', `跳转到问题 ${question.order}：${question.preview}`);
    tooltip.style.left = collapsed ? '42px' : '0';
    tooltip.style.top = `${Math.max(0, Math.min(layoutHeight - 130, button.getBoundingClientRect().top - host.getBoundingClientRect().top - 12))}px`;
    tooltip.hidden = false; button.setAttribute('aria-describedby', tooltip.id); previewTrigger = button;
  }
  function render(): void {
    const focused = (shadow.activeElement as HTMLElement | null)?.dataset.questionKey;
    const tickFocused = shadow.activeElement?.classList.contains('tick');
    hidePreview();
    buttons.clear();
    tickButtons.clear();
    const tickFragment = document.createDocumentFragment();
    for (const question of questions) {
      const item = document.createElement('li');
      const tick = document.createElement('button'); tick.type = 'button'; tick.className = 'tick';
      tick.dataset.questionKey = question.key; tick.disabled = busy;
      tick.setAttribute('aria-label', `问题 ${question.order}：${question.preview}`);
      tick.setAttribute('aria-current', String(question.key === active));
      tick.addEventListener('pointerenter', () => showPreview(tick, question));
      tick.addEventListener('pointerleave', deferHide);
      tick.addEventListener('focus', () => showPreview(tick, question));
      tick.addEventListener('blur', deferHide);
      tick.addEventListener('click', () => { hidePreview(); onJump(question.key); });
      item.append(tick); tickFragment.append(item); tickButtons.set(question.key, tick);
    }
    ticks.replaceChildren(tickFragment);
    const query = input.value.trim().toLocaleLowerCase();
    const filtered = questions.filter((question) => question.searchText.toLocaleLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    for (const question of filtered) {
      const item = document.createElement('li');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'question';
      button.dataset.questionKey = question.key; button.disabled = busy;
      button.setAttribute('aria-label', `问题 ${question.order}：${question.preview}`);
      button.setAttribute('aria-current', String(question.key === active));
      const number = document.createElement('span'); number.className = 'number'; number.textContent = `${question.order}.`;
      number.setAttribute('aria-hidden', 'true');
      const preview = document.createElement('span'); preview.className = 'preview'; preview.textContent = question.preview;
      button.append(number, preview);
      button.addEventListener('pointerenter', () => showPreview(button, question));
      button.addEventListener('pointerleave', deferHide);
      button.addEventListener('focus', () => showPreview(button, question));
      button.addEventListener('blur', deferHide);
      button.addEventListener('click', () => { hidePreview(); onJump(question.key); });
      item.append(button); fragment.append(item); buttons.set(question.key, button);
    }
    if (!filtered.length) {
      const empty = document.createElement('li'); empty.className = 'empty';
      empty.textContent = query ? '没有匹配的问题' : '当前没有已渲染的用户问题'; fragment.append(empty);
    }
    list.replaceChildren(fragment);
    count.textContent = query ? `${filtered.length} / ${questions.length}` : String(questions.length);
    count.setAttribute('aria-label', query ? `匹配 ${filtered.length} 条，共 ${questions.length} 条已识别问题` : `${questions.length} 条已识别问题`);
    count.title = `已识别 ${questions.length} 条，当前挂载 ${mountedCount} 条`;
    clear.disabled = input.value.length === 0;
    if (focused) (tickFocused ? tickButtons : buttons).get(focused)?.focus({ preventScroll: true });
  }
  input.addEventListener('input', render);
  clear.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
  ticks.addEventListener('scroll', hidePreview);
  list.addEventListener('scroll', hidePreview);
  shadow.addEventListener('keydown', (event) => { if ((event as KeyboardEvent).key === 'Escape') hidePreview(); });
  search.append(icon(document, 'm16 16 4 4M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'), input, clear);
  footer.append(scan, scanStatus); panel.append(header, search, list, footer);
  rail.append(expand, scanRail, ticks);
  shadow.append(style, panel, rail, tooltip); document.body.append(host);
  return {
    host,
    setQuestions(next: readonly QuestionSummary[], resetSearch = false, mounted = next.length): void {
      questions = next; mountedCount = mounted;
      if (resetSearch) { input.value = ''; active = null; }
      render();
    },
    setHistoryState(state: HistoryState): void {
      busy = state.busy; scanLabel.textContent = busy ? '停止并返回原位置' : '扫描历史问题';
      scanStatus.textContent = state.text;
      scanRail.dataset.busy = String(busy);
      scanRail.title = busy ? '停止并返回原位置' : '扫描历史问题，结束后返回原阅读位置';
      scanRail.setAttribute('aria-label', busy ? '停止并返回原位置' : '扫描历史问题');
      panel.setAttribute('aria-busy', String(busy));
      if (busy) hidePreview();
      for (const button of [...buttons.values(), ...tickButtons.values()]) button.disabled = busy;
    },
    setActive(key: string | null): void {
      active = key;
      for (const [id, button] of buttons) button.setAttribute('aria-current', String(id === key));
      for (const [id, button] of tickButtons) button.setAttribute('aria-current', String(id === key));
      const tick = key ? tickButtons.get(key) : null;
      if (collapsed && tick) {
        const box = tick.getBoundingClientRect(); const viewport = ticks.getBoundingClientRect();
        if (box.top < viewport.top) ticks.scrollTop -= viewport.top - box.top;
        else if (box.bottom > viewport.bottom) ticks.scrollTop += box.bottom - viewport.bottom;
      }
    },
    setCollapsed(value: boolean): void {
      const restoreFocus = shadow.activeElement === collapse || shadow.activeElement === expand;
      hidePreview();
      collapsed = value; panel.hidden = value; rail.hidden = !value; host.dataset.mode = value ? 'rail' : 'list';
      collapse.setAttribute('aria-expanded', String(!value)); expand.setAttribute('aria-expanded', String(!value));
      if (restoreFocus) (value ? expand : collapse).focus({ preventScroll: true });
    },
    isCollapsed: () => collapsed,
    setLayout(layout: PanelLayout): void {
      hidePreview();
      host.hidden = !layout.visible;
      const viewportWidth = document.defaultView!.innerWidth;
      previewWidth = collapsed ? Math.max(0, Math.min(340, viewportWidth - layout.left - 42 - 16)) : layout.width;
      layoutHeight = layout.height;
      expand.disabled = layout.gutter < 200;
      expand.title = expand.disabled ? '左侧空间不足以展开列表，请收起 ChatGPT 侧边栏或放大窗口' : '展开问题导航';
      host.style.setProperty('--preview-width', `${previewWidth}px`);
      host.style.left = `${Math.round(layout.left)}px`; host.style.top = `${Math.round(layout.top)}px`;
      host.style.width = `${Math.round(layout.width)}px`; host.style.maxHeight = `${Math.round(layout.height)}px`;
    },
    setTheme(dark: boolean): void { host.dataset.theme = dark ? 'dark' : 'light'; },
    dispose(): void { hidePreview(); document.removeEventListener('pointerdown', outside); questions = []; input.value = ''; buttons.clear(); tickButtons.clear(); list.replaceChildren(); ticks.replaceChildren(); host.remove(); },
  };
}
