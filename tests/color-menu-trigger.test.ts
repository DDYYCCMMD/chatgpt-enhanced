import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { enableProjectColors } from '../src/features/project-colors/index.ts';
import { enableChatColors } from '../src/features/chat-colors/index.ts';
import { sidebarColorStatus } from '../src/shared/sidebar-colors/lifecycle.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

test('plain right-click opens colors on identified rows, while native controls and primary clicks stay untouched', async (t) => {
  const dom = new JSDOM(readFileSync(new URL('./fixtures/sidebar-user-capture.html', import.meta.url), 'utf8'), { url: 'https://chatgpt.com/' });
  const doc = dom.window.document;
  const storage = mockChromeStorage({ 'projectColors.v1.g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 'red' });
  const stopProject = enableProjectColors(doc, dom.window as unknown as Window);
  const stopChat = enableChatColors(doc, dom.window as unknown as Window);
  t.after(() => { stopProject(); stopChat(); dom.window.close(); });
  await new Promise<void>((resolve) => setImmediate(resolve));
  let nativeEvents = 0;
  doc.addEventListener('contextmenu', () => { nativeEvents++; });
  const context = (id: string) => {
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    doc.getElementById(id)!.dispatchEvent(event);
    return event;
  };
  for (const [id, kind] of [['captured-title', 'project'], ['captured-chat-link', 'chat']] as const) {
    const count = nativeEvents;
    assert.equal(context(id).defaultPrevented, true);
    assert.equal(nativeEvents, count);
    assert(doc.querySelector('[data-cge-color-menu]'));
    assert.equal(sidebarColorStatus(doc).lastContext, kind);
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('[data-cge-color-menu]'), null);
  }
  for (const id of ['captured-project-more', 'captured-pin', 'captured-new-chat']) {
    const count = nativeEvents;
    assert.equal(context(id).defaultPrevented, false);
    assert.equal(nativeEvents, count + 1);
    assert.equal(doc.querySelector('[data-cge-color-menu]'), null);
  }
  const mainContext = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  doc.querySelector('main')!.dispatchEvent(mainContext);
  assert.equal(mainContext.defaultPrevented, false);
  const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  doc.getElementById('captured-chat-link')!.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
  assert.equal(doc.querySelector('[data-cge-color-menu]'), null);
  assert.equal(doc.getElementById('captured-project')!.getAttribute('data-cge-project-color'), 'red');
  assert.equal(storage.state.writes, 0);
});
