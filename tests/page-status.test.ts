import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { checkCurrentPage, describeNavigation, describePageStatus } from '../src/popup/page-status.ts';
import { isPageStatus, PAGE_STATUS_PROTOCOL, PAGE_STATUS_REQUEST } from '../src/shared/page-status.ts';
import type { PageStatus } from '../src/shared/page-status.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

const baseline: PageStatus = {
  protocol: PAGE_STATUS_PROTOCOL, version: '0.2.1', phase: 'ready',
  settings: { projectColors: false, chatColors: false, codexCloudColors: false, chatNavigation: false },
  roots: 2, projects: 1, chats: 2, codexCloudTasks: 0, projectReady: false, chatReady: false, codexCloudReady: false, lastContext: 'none',
  navigation: { phase: 'disabled', questions: 0, reason: 'none', viewportWidth: 0, gutter: 0 },
};

test('status validates response shape and explains disabled, missing, and unrecognized states', () => {
  assert(isPageStatus(baseline));
  for (const value of [null, {}, { ...baseline, protocol: 99 }, { ...baseline, roots: -1 },
    { ...baseline, settings: {} }, { ...baseline, lastContext: 'secret text' }]) assert.equal(isPageStatus(value), false);
  assert.match(describePageStatus(baseline, '0.2.1'), /颜色开关均关闭/);
  assert.match(describePageStatus({ ...baseline, settings: { ...baseline.settings, chatColors: true }, roots: 0, lastContext: 'unrecognized' }, '0.2.1'), /未发现侧边栏/);
  assert.match(describePageStatus({ ...baseline, lastContext: 'chat' }, '0.2.1'), /已接管聊天菜单/);
});

test('navigation diagnostics distinguish missing scope, empty extraction and hidden layout without including message text', () => {
  const navigation = { phase: 'hidden' as const, questions: 5, reason: 'gutter' as const, viewportWidth: 1920, gutter: 28 };
  assert.match(describeNavigation(navigation), /5 条用户问题/);
  assert.match(describeNavigation(navigation), /28px 不足以显示导航/);
  assert.match(describeNavigation({ ...navigation, phase: 'waiting-container' }), /没有识别到当前会话容器/);
  assert.match(describeNavigation({ ...navigation, phase: 'empty', questions: 0 }), /没有识别到已渲染的用户消息/);
  assert.match(describeNavigation({ ...navigation, phase: 'visible', reason: 'none' }), /面板已显示/);
  assert.equal(isPageStatus({ ...baseline, navigation: { ...navigation, questions: -1 } }), false);
});

test('popup checks only active tab ID and top-frame messaging, and reports no-receiver/old-protocol errors', async () => {
  mockChromeStorage();
  let query: unknown;
  let sent: unknown;
  Object.defineProperty(chrome, 'runtime', { value: { getManifest: () => ({ version: '0.2.1' }) }, configurable: true });
  const tabs = {
    query: async (options: unknown) => { query = options; return [{ id: 7 }]; },
    sendMessage: async (...args: unknown[]): Promise<unknown> => { sent = args; return baseline; },
  };
  Object.defineProperty(chrome, 'tabs', { value: tabs, configurable: true });
  assert.match(await checkCurrentPage(), /已连接/);
  assert.deepEqual(query, { active: true, currentWindow: true });
  assert.deepEqual(sent, [7, { type: PAGE_STATUS_REQUEST }, { frameId: 0 }]);
  tabs.sendMessage = async () => { throw new Error('No receiving end'); };
  assert.match(await checkCurrentPage(), /未连接到当前页脚本/);
  tabs.sendMessage = async () => ({ protocol: 0 });
  assert.match(await checkCurrentPage(), /不支持连接检查/);
});

test('content status checks sender, reports only counts/booleans, and tracks actual context-handler entry', async (t) => {
  const dom = new JSDOM(readFileSync(new URL('./fixtures/sidebar-user-capture.html', import.meta.url), 'utf8'), { url: 'https://chatgpt.com/' });
  const storage = mockChromeStorage({ 'settings.v1.projectColors': true, 'settings.v1.chatColors': true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  type Listener = (message: unknown, sender: { id: string }, respond: (response: unknown) => void) => void;
  const listeners: Listener[] = [];
  Object.defineProperty(chrome, 'runtime', { configurable: true, value: {
    id: 'own-extension', getManifest: () => ({ version: '0.2.1' }),
    onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
  } });
  t.after(() => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close(); });
  await import('../src/content/index.ts');
  await new Promise<void>((resolve) => setImmediate(resolve));
  let result: unknown;
  const request = (id = 'own-extension') => {
    result = undefined;
    listeners[0]!({ type: PAGE_STATUS_REQUEST }, { id }, (response) => { result = response; });
    return result;
  };
  assert.equal(request('other-extension'), undefined);
  assert(isPageStatus(request()));
  const status = result as PageStatus;
  assert.equal(status.phase, 'ready');
  assert.equal(status.projects, 1);
  assert.equal(status.chats, 2);
  assert.equal(status.chatReady, true);
  const json = JSON.stringify(status);
  for (const forbidden of ['g-p-', 'Anonymous Project', '11111111-1111', 'Duplicate chat title', 'PRIVATE MESSAGE']) assert.equal(json.includes(forbidden), false);
  dom.window.document.getElementById('captured-chat-link')!.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert(isPageStatus(request()));
  assert.equal((result as PageStatus).lastContext, 'chat');
  await storage.local.set({ 'settings.v1.chatColors': false });
  assert(isPageStatus(request()));
  assert.equal((result as PageStatus).settings.chatColors, false);
  assert.equal((result as PageStatus).chatReady, false);
});
