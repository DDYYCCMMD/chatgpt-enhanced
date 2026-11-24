import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { discoverProjects } from '../src/features/project-colors/detection.ts';
import { discoverChats } from '../src/features/chat-colors/detection.ts';
import { findSidebars } from '../src/shared/sidebar-colors/sidebar.ts';
import { enableProjectColors } from '../src/features/project-colors/index.ts';
import { enableChatColors } from '../src/features/chat-colors/index.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

const fixture = readFileSync(new URL('./fixtures/sidebar-user-capture.html', import.meta.url), 'utf8');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('a popover-hosted sidebar is not mistaken for an embedded native menu', async (t) => {
  const dom = new JSDOM(fixture, { url: 'https://chatgpt.com/' });
  const document = dom.window.document;
  document.getElementById('unlabelled-layout')!.setAttribute('popover', 'manual');
  mockChromeStorage();
  const stopProject = enableProjectColors(document, dom.window as unknown as Window);
  const stopChat = enableChatColors(document, dom.window as unknown as Window);
  t.after(() => { stopProject(); stopChat(); dom.window.close(); });
  await tick();
  for (const id of ['captured-title', 'captured-chat-link']) {
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.getElementById(id)!.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, id);
    assert(document.querySelector('[data-cge-color-menu]'));
  }
  for (const id of ['captured-project-popover', 'captured-chat-popover', 'captured-project-more']) {
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.getElementById(id)!.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, id);
  }
});

test('sanitized user capture recognizes one actual Project header, not its repeated icon marker or popovers', () => {
  const dom = new JSDOM(fixture);
  const roots = findSidebars(dom.window.document);
  assert.deepEqual(roots.flatMap(discoverProjects).map((row) => row.element.id), ['captured-project']);
  assert.deepEqual(roots.flatMap(discoverChats).map((row) => row.element.id), ['captured-chat', 'captured-normal-chat']);
  dom.window.close();
});

test('captured Project label/icon and full Chat groups open correct menus; native actions remain untouched', async (t) => {
  const dom = new JSDOM(fixture, { url: 'https://chatgpt.com/', pretendToBeVisual: true });
  const document = dom.window.document;
  const window = dom.window as unknown as Window;
  const storage = mockChromeStorage({
    'projectColors.v1.g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 'red',
    'chatColors.v1.11111111-1111-1111-1111-111111111111': 'blue',
    'chatColors.v1.22222222-2222-2222-2222-222222222222': 'purple',
  });
  const stopProject = enableProjectColors(document, window);
  const stopChat = enableChatColors(document, window);
  t.after(() => { stopProject(); stopChat(); dom.window.close(); });
  await tick();
  const node = (id: string) => document.getElementById(id)!;
  assert.equal(node('captured-project').getAttribute('data-cge-project-color'), 'red');
  assert.equal(node('captured-folder').hasAttribute('data-cge-project-color'), false);
  assert.equal(document.querySelectorAll('[data-cge-project-color]').length, 1);
  assert.equal(node('captured-chat').getAttribute('data-cge-chat-color'), 'blue');
  assert.equal(node('captured-normal-chat').getAttribute('data-cge-chat-color'), 'purple');
  const event = (id: string) => {
    const e = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    node(id).dispatchEvent(e);
    return e;
  };
  for (const id of ['captured-project', 'captured-title', 'captured-folder', 'captured-chat', 'captured-chat-link', 'captured-normal-chat']) {
    assert.equal(event(id).defaultPrevented, true, id);
    const menu = document.querySelector('[data-cge-color-menu]')!;
    assert.equal(menu.shadowRoot!.querySelector('[role="menu"]')!.getAttribute('aria-label'), id.startsWith('captured-chat') || id === 'captured-normal-chat' ? 'Chat color' : 'Project color');
  }
  for (const id of ['captured-project-more', 'captured-new-chat', 'captured-pin', 'captured-chat-more',
    'captured-project-popover', 'captured-chat-popover', 'captured-normal-more']) {
    assert.equal(event(id).defaultPrevented, false, id);
  }
  stopProject();
  assert.equal(node('captured-project').hasAttribute('data-cge-project-color'), false);
  assert.equal(node('captured-chat').getAttribute('data-cge-chat-color'), 'blue');
  assert.equal(event('captured-title').defaultPrevented, false);
  stopChat();
  assert.equal(document.querySelector('[data-cge-chat-color]'), null);
  assert.equal(storage.listeners.size, 0);
});
