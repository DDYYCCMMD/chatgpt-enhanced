import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { enableProjectColors } from '../src/features/project-colors/index.ts';
import { discoverProjects, projectAtTarget } from '../src/features/project-colors/detection.ts';
import { enableChatColors } from '../src/features/chat-colors/index.ts';
import { chatIdFromUrl, discoverChats } from '../src/features/chat-colors/detection.ts';
import { saveChatColor, parseChatColors, CHAT_COLOR_PREFIX as chatPrefix } from '../src/storage/chat-colors.ts';
import { saveProjectColor, parseProjectColors, PROJECT_COLOR_PREFIX as projectPrefix } from '../src/storage/project-colors.ts';
import { findSidebars } from '../src/shared/sidebar-colors/sidebar.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

const projectId = 'g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const chatId = '22222222-2222-2222-2222-222222222222';
const nestedId = '11111111-1111-1111-1111-111111111111';
const fixture = readFileSync(new URL('./fixtures/sidebar-variants.html', import.meta.url), 'utf8');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 110));

function setup(t: TestContext, initial: Record<string, unknown> = {}) {
  const dom = new JSDOM(fixture, { url: 'https://chatgpt.com/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const document = dom.window.document;
  const window = dom.window as unknown as Window;
  const storage = mockChromeStorage(initial);
  const cleanups: (() => void)[] = [];
  t.after(() => { for (const stop of cleanups.reverse()) stop(); dom.window.close(); });
  const project = () => { const stop = enableProjectColors(document, window); cleanups.push(stop); return stop; };
  const chat = () => { const stop = enableChatColors(document, window); cleanups.push(stop); return stop; };
  const node = (id: string) => document.getElementById(id)!;
  const context = (id: string) => {
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 100 });
    node(id).dispatchEvent(event);
    return event;
  };
  const host = () => document.querySelector<HTMLElement>('[data-cge-color-menu]');
  const select = (color: string) => host()!.shadowRoot!.querySelector<HTMLButtonElement>(`[data-color="${color}"]`)!.click();
  return { dom, document, window, storage, project, chat, node, context, host, select };
}

test('chat identity comes from stable normal/project/custom-GPT conversation routes only', () => {
  for (const path of [`/c/${chatId}`, `/c/${chatId}/?x=1#top`, `/g/${projectId}/c/${chatId}`,
    `/g/${projectId}-renamed/c/${chatId}`, `/g/g-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/c/${chatId}`]) {
    assert.equal(chatIdFromUrl(path), chatId);
  }
  for (const path of ['/c/title', `/g/${projectId}/project`, `https://example.com/c/${chatId}`,
    `/c/${chatId}/extra`, `https://user@chatgpt.com/c/${chatId}`, 'javascript:alert(1)']) assert.equal(chatIdFromUrl(path), null, path);
});

test('semantic sidebar fallback, nested metadata/button headers, wrapper hit areas, and chats are separate', (t) => {
  const s = setup(t);
  const roots = findSidebars(s.document);
  assert.deepEqual(roots.map((root) => root.id), ['unfamiliar-sidebar']);
  const projects = discoverProjects(roots[0]!);
  const chats = discoverChats(roots[0]!);
  assert.equal(projectAtTarget(s.node('project-header-shell'), projects)?.id, projectId);
  assert.equal(projectAtTarget(s.node('project-button'), projects)?.id, projectId);
  assert.equal(projectAtTarget(s.node('project-label'), projects)?.id, projectId);
  assert.equal(projectAtTarget(s.node('project-more'), projects), undefined);
  assert.equal(projectAtTarget(s.node('project-url-wrapper'), projects)?.id, 'g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(projectAtTarget(s.node('deep-project'), projects)?.id, 'g-p-cccccccccccccccccccccccccccccccc');
  assert.equal(projectAtTarget(s.node('nested-chat'), projects), undefined);
  assert.deepEqual(chats.map((row) => row.id), [nestedId, chatId, '33333333-3333-3333-3333-333333333333']);
});

test('project and chat storage namespaces, reset, invalid data, and duplicate titles stay isolated', async () => {
  const storage = mockChromeStorage();
  await Promise.all([saveProjectColor(projectId, 'red'), saveChatColor(chatId, 'blue'), saveChatColor(nestedId, 'green')]);
  assert.deepEqual(parseProjectColors(storage.values), { [projectId]: 'red' });
  assert.deepEqual(parseChatColors(storage.values), { [chatId]: 'blue', [nestedId]: 'green' });
  await saveChatColor(chatId, null);
  assert.equal(storage.values[`${projectPrefix}${projectId}`], 'red');
  assert.deepEqual(parseChatColors(storage.values), { [nestedId]: 'green' });
  assert.deepEqual(parseChatColors({ [`${chatPrefix}${chatId}`]: 'invalid', [`${chatPrefix}same-title`]: 'red', [`${projectPrefix}${projectId}`]: 'blue' }), {});
  await assert.rejects(saveChatColor(projectId, 'blue'));
  await assert.rejects(saveProjectColor(chatId, 'blue'));
});

test('both feature menus work through wrappers with one listener and do not intercept native controls or left clicks', async (t) => {
  const s = setup(t);
  let contextAdds = 0;
  const original = s.window.addEventListener.bind(s.window);
  s.window.addEventListener = ((type: string, ...args: unknown[]) => {
    if (type === 'contextmenu') contextAdds++;
    return (original as (...args: unknown[]) => void)(type, ...args);
  }) as typeof s.window.addEventListener;
  s.project(); s.chat();
  await tick();
  assert.equal(contextAdds, 1);
  for (const [id, label] of [['project-header-shell', 'Project color'], ['project-button', 'Project color'],
    ['deep-project', 'Project color'], ['project-url-wrapper', 'Project color'], ['chat-row', 'Chat color'], ['nested-row', 'Chat color']]) {
    assert.equal(s.context(id!).defaultPrevented, true, id);
    assert.equal(s.host()!.shadowRoot!.querySelector('[role="menu"]')!.getAttribute('aria-label'), label);
    assert.equal(s.document.querySelectorAll('[data-cge-color-menu]').length, 1);
    s.select('green');
    await tick();
    assert.equal(s.host(), null);
  }
  for (const id of ['project-more', 'url-more', 'chat-more', 'nested-more', 'main-link', 'unknown-chat', 'external-chat']) {
    assert.equal(s.context(id).defaultPrevented, false, id);
  }
  const click = new s.dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  s.node('chat-one').dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
});

test('independent disable/re-enable preserves colors and leaves the other feature working', async (t) => {
  const s = setup(t, { [`${projectPrefix}${projectId}`]: 'red', [`${chatPrefix}${chatId}`]: 'blue' });
  const stopProject = s.project(); const stopChat = s.chat();
  await tick();
  assert.equal(s.node('chat-row').getAttribute('data-cge-chat-color'), 'blue');
  assert.equal(s.node('project-header-shell').getAttribute('data-cge-project-color'), 'red');
  stopProject();
  assert.equal(s.context('project-button').defaultPrevented, false);
  assert.equal(s.node('project-header-shell').hasAttribute('data-cge-project-color'), false);
  assert.equal(s.context('chat-row').defaultPrevented, true);
  s.select('purple'); await tick();
  assert.equal(s.storage.values[`${chatPrefix}${chatId}`], 'purple');
  s.project(); await tick();
  assert.equal(s.node('project-header-shell').getAttribute('data-cge-project-color'), 'red');
  stopChat();
  assert.equal(s.context('chat-row').defaultPrevented, false);
  assert.equal(s.node('chat-row').hasAttribute('data-cge-chat-color'), false);
  assert.equal(s.context('project-button').defaultPrevented, true);
  assert.equal(s.storage.values[`${chatPrefix}${chatId}`], 'purple');
});

test('chat renames, dynamic insertion, recycled identity, and whole sidebar replacement restore saved colors', async (t) => {
  const s = setup(t, { [`${chatPrefix}${chatId}`]: 'blue', [`${chatPrefix}${nestedId}`]: 'orange' });
  s.chat(); await tick();
  s.node('chat-one').textContent = 'A new title';
  await settle();
  assert.equal(s.node('chat-row').getAttribute('data-cge-chat-color'), 'blue');
  s.node('chat-one').setAttribute('href', `/c/${nestedId}`);
  await settle();
  assert.equal(s.node('chat-row').getAttribute('data-cge-chat-color'), 'orange');
  const old = s.node('unfamiliar-sidebar');
  old.replaceWith(old.cloneNode(true));
  await settle();
  assert.equal(old.querySelector('[data-cge-chat-color]'), null);
  assert.equal(s.node('chat-row').getAttribute('data-cge-chat-color'), 'orange');
  const row = s.document.createElement('div');
  row.innerHTML = `<a href="/c/${chatId}">Duplicate title</a>`;
  s.node('unfamiliar-sidebar').append(row);
  await settle();
  assert.equal(row.getAttribute('data-cge-chat-color'), 'blue');
});

test('a newly mounted sidebar is recognized immediately on interaction without waiting for debounce', async (t) => {
  const s = setup(t);
  s.project(); s.chat(); await tick();
  const old = s.node('unfamiliar-sidebar');
  const replacement = old.cloneNode(true);
  old.remove();
  s.document.body.append(replacement);
  assert.equal(s.context('project-button').defaultPrevented, true);
  s.select('yellow'); await tick();
  assert.equal(s.storage.values[`${projectPrefix}${projectId}`], 'yellow');
  assert.equal(s.context('chat-row').defaultPrevented, true);
});

test('moving the same sidebar into a new layout updates ancestor observation and cleans removed rows', async (t) => {
  const s = setup(t, { [`${chatPrefix}${chatId}`]: 'blue' });
  s.chat(); await tick();
  const root = s.node('unfamiliar-sidebar');
  const replacementShell = s.document.createElement('div');
  s.document.body.append(replacementShell);
  replacementShell.append(root);
  await settle();
  root.remove();
  await settle();
  assert.equal(root.querySelector('[data-cge-chat-color]'), null);
});

test('chat menu dismisses on Escape/outside, reset removes only one conversation, and late save failure cannot revive disabled styles', async (t) => {
  const s = setup(t, { [`${chatPrefix}${chatId}`]: 'red', [`${chatPrefix}${nestedId}`]: 'blue' });
  const stop = s.chat(); await tick();
  s.context('chat-row');
  s.document.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(s.host(), null);
  s.context('chat-row');
  s.node('main-link').dispatchEvent(new s.dom.window.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(s.host(), null);
  s.context('chat-row'); s.select('default'); await tick();
  assert.equal(Object.hasOwn(s.storage.values, `${chatPrefix}${chatId}`), false);
  assert.equal(s.storage.values[`${chatPrefix}${nestedId}`], 'blue');
  s.storage.state.failWrite = true;
  s.context('chat-row'); s.select('purple'); stop(); await tick();
  assert.equal(s.document.querySelector('[data-cge-chat-color]'), null);
  assert.equal(s.document.querySelector('[data-cge-chat-styles]'), null);
  assert.equal(s.storage.listeners.size, 0);
});

test('diagnostic output omits titles, message bodies, URL slugs/queries and refuses a main-pane selection', (t) => {
  const s = setup(t);
  let output = '';
  s.dom.window.console.log = (value: string) => { output = value; };
  Object.assign(s.dom.window, { $0: s.node('project-header-shell') });
  const code = readFileSync(new URL('../docs/sidebar-diagnostic.js', import.meta.url), 'utf8');
  s.dom.window.eval(code);
  assert(output.includes(projectId));
  for (const secret of ['Repeated title', 'PRIVATE MESSAGE BODY', 'renamed']) assert.equal(output.includes(secret), false);
  let warned = false;
  s.dom.window.console.warn = () => { warned = true; };
  Object.assign(s.dom.window, { $0: s.node('main-link') });
  s.dom.window.eval(code);
  assert.equal(warned, true);
});
