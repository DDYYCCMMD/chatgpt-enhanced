import { COLORS, COLOR_RGB } from './palette.ts';
import type { Color } from './palette.ts';

const MENU_CSS = `
  :host { all: initial; color-scheme: light dark; font: 13px/1.5 var(--page-font, ui-sans-serif, system-ui, sans-serif);
    --surface: #fff; --hover: #f3f3f3; --border: #e5e5e5; --muted: #737373; --text: #202020; }
  .menu { box-sizing: border-box; position: fixed; z-index: 2147483647; width: 208px;
    max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow-y: auto;
    padding: 6px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface);
    color: var(--text); box-shadow: 0 4px 6px -4px #0000001a, 0 12px 28px -8px #00000024; }
  h2 { margin: 6px 10px 8px; color: var(--muted); font-size: 11px; font-weight: 600; }
  button { box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 7px 10px; border: 0; border-radius: 8px; color: inherit; background: transparent;
    text-align: start; font: inherit; font-weight: 500; cursor: pointer; }
  button:hover, button[aria-checked="true"] { background: var(--hover); }
  button:focus-visible { outline: 2px solid var(--muted); outline-offset: -2px; }
  button[data-color="default"] { margin-top: 10px; position: relative; }
  button[data-color="default"]::before { content: ''; position: absolute; top: -5px; inset-inline: 8px; height: 1px; background: var(--border); }
  button[data-color="default"] .swatch { box-sizing: border-box; border: 1px solid var(--muted); }
  button[aria-checked="true"]::after { content: '✓'; margin-inline-start: auto; }
  .swatch { display: inline-block; width: 12px; height: 12px; border-radius: 50%; flex: none; }
  ${COLORS.map((color) => `[data-color="${color}"] .swatch { background: rgb(${COLOR_RGB[color]}); }`).join('\n')}
  [role="status"] { margin: 7px; font-size: 12px; }
  :host([data-theme="dark"]) { --surface: #2f2f2f; --hover: #3a3a3a; --border: #424242; --muted: #aaa; --text: #ececec; }
  @supports (corner-shape: squircle) { .menu, button { corner-shape: squircle; } }
`;

export interface MenuOptions {
  anchor: HTMLElement;
  label?: string;
  x: number;
  y: number;
  selected: Color | undefined;
  onSelect: (color: Color | null) => Promise<void>;
}

export function createColorMenu(document: Document, window: Window) {
  let host: HTMLElement | undefined;
  let removeListeners: (() => void) | undefined;
  let anchor: HTMLElement | undefined;

  function close(restoreFocus = false): void {
    removeListeners?.();
    removeListeners = undefined;
    host?.remove();
    host = undefined;
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
    anchor = undefined;
  }

  function open(options: MenuOptions): void {
    close();
    anchor = options.anchor;
    host = document.createElement('div');
    host.setAttribute('data-cge-color-menu', '');
    // A fixed host escapes native sidebar clipping and establishes a stacking context.
    host.style.cssText = 'position:fixed;inset:0 auto auto 0;z-index:2147483647;';
    const font = window.getComputedStyle(document.body).fontFamily;
    if (font) host.style.setProperty('--page-font', font);
    const dark = document.documentElement.matches('.dark, [data-theme="dark"]')
      || (!document.documentElement.matches('.light, [data-theme="light"]') && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    host.setAttribute('data-theme', dark ? 'dark' : 'light');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = MENU_CSS;
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', options.label ?? 'Project color');
    const title = document.createElement('h2');
    title.textContent = options.label ?? 'Project color';
    menu.append(title);
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    const buttons: HTMLButtonElement[] = [];
    const openedHost = host;
    for (const color of [...COLORS, null]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', String((options.selected ?? null) === color));
      button.dataset.color = color ?? 'default';
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const label = color ? color[0]!.toUpperCase() + color.slice(1) : 'Reset to default';
      button.append(swatch, document.createTextNode(label));
      button.addEventListener('click', () => {
        for (const item of buttons) item.disabled = true;
        void options.onSelect(color).then(() => {
          if (host === openedHost) close(true);
        }).catch(() => {
          if (host !== openedHost) return;
          for (const item of buttons) item.disabled = false;
          status.hidden = false;
          status.textContent = 'Could not save color. Please try again.';
          position();
        });
      });
      buttons.push(button);
      menu.append(button);
    }
    menu.append(status);
    shadow.append(style, menu);
    document.body.append(host);
    const position = (): void => {
      const bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(options.x, window.innerWidth - bounds.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(options.y, window.innerHeight - bounds.height - 8))}px`;
    };
    position();
    const outside = (event: Event): void => {
      if (!event.composedPath().includes(openedHost)) close();
    };
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (event.key === 'Tab') close(true);
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const index = buttons.indexOf(shadow.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    const dismiss = (): void => close();
    const scroll = (event: Event): void => {
      if (!event.composedPath().includes(openedHost)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('contextmenu', outside, true);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('blur', dismiss);
    removeListeners = () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('contextmenu', outside, true);
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('blur', dismiss);
    };
    buttons.find((button) => button.getAttribute('aria-checked') === 'true')?.focus({ preventScroll: true });
  }

  return { open, close };
}
