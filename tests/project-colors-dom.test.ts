import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { enableProjectColors } from '../src/features/project-colors/index.ts';
import { createFeatureController } from '../src/shared/feature.ts';
import { COLOR_ATTRIBUTE } from '../src/features/project-colors/styles.ts';
import { PROJECT_COLOR_PREFIX as prefix } from '../src/storage/project-colors.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

const a = 'g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const b = 'g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const fixture = readFileSync(new URL('./fixtures/sidebar.html', import.meta.url), 'utf8');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const settleDom = () => new Promise<void>((resolve) => setTimeout(resolve, 110));

function setup(t: TestContext, initial: Record<string, unknown> = {}, html = fixture) {
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/', pretendToBeVisual: true });
  const storage = mockChromeStorage(initial);
  const document = dom.window.document;
  const window = dom.window as unknown as Window;
  const stop = enableProjectColors(document, window);
  t.after(() => { stop(); dom.window.close(); });
  const node = (id: string) => document.getElementById(id)!;
  const context = (element: Element, x = 100, y = 120) => {
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
    element.dispatchEvent(event);
    return event;
  };
  const host = () => document.querySelector<HTMLElement>('[data-cge-color-menu]');
  const button = (color: string) => host()!.shadowRoot!.querySelector<HTMLButtonElement>(`[data-color="${color}"]`)!;
  return { dom, document, window, storage, stop, node, context, host, button };
}

test('restores highlights by ID without touching conversations, names, or host inline styles', async (t) => {
  const s = setup(t, { [`${prefix}${a}`]: 'red', [`${prefix}${b}`]: 'blue' });
  const main = s.document.querySelector('main')!.innerHTML;
  await tick();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'red');
  assert.equal(s.node('project-b').getAttribute(COLOR_ATTRIBUTE), 'blue');
  for (const id of ['chat', 'project-chat', 'gpt', 'nested-chat', 'main-project-link']) {
    assert.equal(s.node(id).hasAttribute(COLOR_ATTRIBUTE), false, id);
  }
  assert.equal(s.document.querySelector('main')!.innerHTML, main);
  assert.equal(s.node('project-a').hasAttribute('style'), false);
  assert.equal(s.storage.state.writes, 0);
});

test('context menu selects immediately, persists, avoids redundant writes, and resets a single project', async (t) => {
  const s = setup(t, { [`${prefix}${b}`]: 'purple' });
  await tick();
  assert.equal(s.context(s.node('project-a')).defaultPrevented, true);
  assert.equal(s.host()!.shadowRoot!.querySelectorAll('[role="menuitemradio"]').length, 7);
  s.button('blue').click();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'blue');
  await tick();
  assert.equal(s.storage.values[`${prefix}${a}`], 'blue');
  assert.equal(s.host(), null);
  s.context(s.node('project-a'));
  s.button('blue').click();
  await tick();
  assert.equal(s.storage.state.writes, 1);
  s.context(s.node('project-a'));
  s.button('default').click();
  assert.equal(s.node('project-a').hasAttribute(COLOR_ATTRIBUTE), false);
  await tick();
  assert.equal(Object.hasOwn(s.storage.values, `${prefix}${a}`), false);
  assert.equal(s.storage.values[`${prefix}${b}`], 'purple');
});

test('outside click, Escape, Tab, repeated opening, and keyboard navigation work', async (t) => {
  const s = setup(t);
  await tick();
  s.context(s.node('project-a'));
  assert.equal(s.host()!.shadowRoot!.activeElement, s.button('default'));
  s.document.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(s.host()!.shadowRoot!.activeElement, s.button('red'));
  s.document.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
  assert.equal(s.host()!.shadowRoot!.activeElement, s.button('default'));
  s.document.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(s.host(), null);
  assert.equal(s.document.activeElement, s.node('project-a'));
  s.context(s.node('project-a'));
  s.context(s.node('project-b'));
  assert.equal(s.document.querySelectorAll('[data-cge-color-menu]').length, 1);
  s.node('chat').dispatchEvent(new s.dom.window.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(s.host(), null);
  s.context(s.node('project-a'), 0, 0);
  s.document.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(s.host(), null);
});

test('ordinary chats, nested chats, unknown rows, main content, and native menu controls keep context behavior', async (t) => {
  const s = setup(t);
  await tick();
  for (const id of ['chat', 'project-chat', 'gpt', 'nested-chat', 'main-project-link', 'native-menu', 'unknown-project', 'unsafe-header']) {
    assert.equal(s.context(s.node(id)).defaultPrevented, false, id);
    assert.equal(s.host(), null, id);
  }
  assert.equal(s.context(s.node('metadata-project').querySelector('span')!).defaultPrevented, true);
});

test('menu clamps to viewport and uses the explicit ChatGPT theme', async (t) => {
  const s = setup(t);
  await tick();
  s.document.documentElement.className = 'dark';
  const original = s.dom.window.HTMLElement.prototype.getBoundingClientRect;
  s.dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.className === 'menu' ? { width: 208, height: 320 } as DOMRect : original.call(this);
  };
  s.context(s.node('project-a'), 9999, 9999);
  const menu = s.host()!.shadowRoot!.querySelector<HTMLElement>('[role="menu"]')!;
  assert.equal(menu.style.left, `${s.window.innerWidth - 208 - 8}px`);
  assert.equal(menu.style.top, `${s.window.innerHeight - 320 - 8}px`);
  assert.equal(s.host()!.getAttribute('data-theme'), 'dark');
  s.context(s.node('project-a'), -100, -100);
  assert.equal(s.host()!.shadowRoot!.querySelector<HTMLElement>('[role="menu"]')!.style.left, '8px');
});

test('renaming, recycled links, dynamic project insertion, and whole sidebar replacement retain correct identities', async (t) => {
  const s = setup(t, { [`${prefix}${a}`]: 'red', [`${prefix}${b}`]: 'green' });
  await tick();
  s.node('project-a').textContent = 'Renamed';
  await settleDom();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'red');
  s.node('project-a').setAttribute('href', '/c/now-a-chat');
  await settleDom();
  assert.equal(s.node('project-a').hasAttribute(COLOR_ATTRIBUTE), false);
  s.node('project-a').setAttribute('href', `/g/${b}-other/project`);
  await settleDom();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'green');
  const removed = s.node('stage-slideover-sidebar');
  const replacement = removed.cloneNode(true) as HTMLElement;
  removed.replaceWith(replacement);
  await settleDom();
  assert.equal(removed.querySelector(`[${COLOR_ATTRIBUTE}]`), null);
  assert.equal(s.node('project-b').getAttribute(COLOR_ATTRIBUTE), 'green');
  const added = s.document.createElement('a');
  added.href = `/g/${a}-new-row/project`;
  replacement.append(added);
  await settleDom();
  assert.equal(added.getAttribute(COLOR_ATTRIBUTE), 'red');
  assert.equal(s.storage.state.writes, 0);
});

test('streamed main-content mutations do not rescan the sidebar or dismiss the menu', async (t) => {
  const s = setup(t);
  await tick();
  s.context(s.node('project-a'));
  const menu = s.host();
  for (let i = 0; i < 20; i++) s.document.querySelector('main')!.append(s.document.createElement('p'));
  await settleDom();
  assert.equal(s.host(), menu);
});

test('save failure rolls back optimistic highlighting and leaves an accessible retry message', async (t) => {
  const s = setup(t, { [`${prefix}${a}`]: 'orange' });
  await tick();
  s.storage.state.failWrite = true;
  s.context(s.node('project-a'));
  s.button('blue').click();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'blue');
  await tick();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'orange');
  assert.match(s.host()!.shadowRoot!.querySelector('[role="status"]')!.textContent!, /Could not save/);
  assert.equal(s.button('blue').disabled, false);
});

test('a row recycled while its menu is open cannot save a color for the old project', async (t) => {
  const s = setup(t);
  await tick();
  s.context(s.node('project-a'));
  const chooseBlue = s.button('blue');
  s.node('project-a').setAttribute('href', `/g/${b}/project`);
  // Select before the mutation debounce runs: the interaction must still reject stale identity.
  chooseBlue.click();
  await tick();
  assert.equal(s.host(), null);
  assert.equal(s.storage.state.writes, 0);
  assert.equal(s.node('project-a').hasAttribute(COLOR_ATTRIBUTE), false);
});

test('external color changes and removals update rendered rows without additional writes', async (t) => {
  const s = setup(t);
  await tick();
  await s.storage.local.set({ [`${prefix}${a}`]: 'purple' });
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'purple');
  await s.storage.local.remove(`${prefix}${a}`);
  assert.equal(s.node('project-a').hasAttribute(COLOR_ATTRIBUTE), false);
  assert.equal(s.storage.state.writes, 1);
  assert.equal(s.storage.state.removals, 1);
});

test('disabling fully cleans resources, preserves preferences, and re-enabling restores them independently', async (t) => {
  const s = setup(t, { [`${prefix}${a}`]: 'yellow' });
  await tick();
  s.context(s.node('project-a'));
  s.stop();
  assert.equal(s.host(), null);
  assert.equal(s.document.querySelector(`[${COLOR_ATTRIBUTE}]`), null);
  assert.equal(s.document.querySelector('[data-cge-project-styles]'), null);
  assert.equal(s.storage.listeners.size, 0);
  assert.equal(s.context(s.node('project-a')).defaultPrevented, false);
  let navigationStarts = 0;
  let navigationStops = 0;
  const controller = createFeatureController([
    { id: 'projectColors', enable: () => enableProjectColors(s.document, s.window) },
    { id: 'chatNavigation', enable: () => { navigationStarts++; return () => { navigationStops++; }; } },
  ]);
  t.after(() => controller.dispose());
  controller.apply({ chatColors: false, projectColors: true, codexCloudColors: false, chatNavigation: true });
  await tick();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'yellow');
  controller.apply({ chatColors: false, projectColors: false, codexCloudColors: false, chatNavigation: true });
  assert.equal(s.node('project-a').hasAttribute(COLOR_ATTRIBUTE), false);
  assert.equal(navigationStarts, 1);
  assert.equal(navigationStops, 0);
  controller.apply({ chatColors: false, projectColors: true, codexCloudColors: false, chatNavigation: true });
  await tick();
  assert.equal(s.node('project-a').getAttribute(COLOR_ATTRIBUTE), 'yellow');
  assert.equal(s.storage.listeners.size, 1);
  assert.equal(s.document.querySelectorAll('[data-cge-project-styles]').length, 1);
  assert.equal(s.storage.values[`${prefix}${a}`], 'yellow');
  controller.dispose();
});

test('late sidebar mount and collapse/remount recover while no root is available', async (t) => {
  const s = setup(t, { [`${prefix}${a}`]: 'red' }, '<html><head></head><body><main></main></body></html>');
  await tick();
  const root = s.document.createElement('aside');
  root.id = 'stage-sidebar';
  root.innerHTML = `<a href="/g/${a}/project">Late project</a>`;
  s.document.body.append(root);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(root.querySelector('a')!.getAttribute(COLOR_ATTRIBUTE), 'red');
  root.remove();
  await settleDom();
  assert.equal(root.querySelector('a')!.hasAttribute(COLOR_ATTRIBUTE), false);
  s.document.body.append(root);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(root.querySelector('a')!.getAttribute(COLOR_ATTRIBUTE), 'red');
});
