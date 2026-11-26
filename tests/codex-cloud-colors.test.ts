import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { codexCloudTaskIdFromUrl } from '../src/features/codex-cloud-colors/detection.ts';
import { enableCodexCloudColors } from '../src/features/codex-cloud-colors/index.ts';
import { enableChatColors } from '../src/features/chat-colors/index.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

const taskId = 'task_e_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const otherTaskId = 'task_b_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const taskPath = `/codex/cloud/tasks/${taskId}`;
const chatId = '22222222-2222-2222-2222-222222222222';
const key = `codexCloudColors.v1.${taskId}`;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('only recognized same-origin Codex task URLs supply a color identity', () => {
  assert.equal(codexCloudTaskIdFromUrl(taskPath), taskId);
  assert.equal(codexCloudTaskIdFromUrl(`https://chatgpt.com/codex/tasks/${taskId}/?view=diff#top`), taskId);
  for (const path of [`/c/${chatId}`, `/codex/cloud/tasks/${chatId}`, `${taskPath}/extra`,
    `https://other.example${taskPath}`, `https://user@chatgpt.com${taskPath}`, '/codex/tasks/same-title']) {
    assert.equal(codexCloudTaskIdFromUrl(path), null, path);
  }
});

test('Codex colors persist by task ID and preserve native controls and ordinary chat colors', async (t) => {
  const dom = new JSDOM(`<nav>
    <li id="task"><a id="target" href="${taskPath}">Same title</a><button id="more" aria-haspopup="menu">More</button></li>
    <li id="other"><a href="/codex/tasks/${otherTaskId}">Same title</a></li>
    <a id="conflict" href="${taskPath}" data-href="/codex/tasks/${otherTaskId}">Conflicting ID</a>
  </nav><nav data-sidebar><a id="chat" href="/c/${chatId}">Same title</a></nav>
  <main><a id="main-link" href="${taskPath}">Task link in conversation</a></main>`, { url: 'https://chatgpt.com/' });
  const { document } = dom.window;
  const window = dom.window as unknown as Window;
  const chatKey = `chatColors.v1.${chatId}`;
  const storage = mockChromeStorage({ [chatKey]: 'blue' });
  const stopChat = enableChatColors(document, window);
  let stopCodex = enableCodexCloudColors(document, window);
  t.after(() => { stopCodex(); stopChat(); dom.window.close(); });
  const node = (id: string) => document.getElementById(id)!;
  const context = (id: string) => !node(id).dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const menu = () => document.querySelector('[data-cge-color-menu]')!.shadowRoot!;
  const select = (color: string) => menu().querySelector<HTMLButtonElement>(`[data-color="${color}"]`)!.click();
  await tick();

  for (const id of ['more', 'main-link', 'conflict']) assert.equal(context(id), false, id);
  assert.equal(context('task'), true);
  assert.equal(menu().querySelector('[role="menu"]')!.getAttribute('aria-label'), 'Codex Cloud color');
  select('red'); await tick();
  assert.equal(storage.values[key], 'red');
  assert.equal(node('task').getAttribute('data-cge-codex-cloud-color'), 'red');
  assert.equal(node('other').getAttribute('data-cge-codex-cloud-color'), null);
  assert.equal(node('chat').getAttribute('data-cge-chat-color'), 'blue');

  stopCodex();
  assert.equal(context('task'), false);
  assert.equal(node('task').getAttribute('data-cge-codex-cloud-color'), null);
  node('target').textContent = 'Renamed task';
  node('target').setAttribute('href', `/codex/tasks/${taskId}`);
  stopCodex = enableCodexCloudColors(document, window);
  await tick();
  assert.equal(node('task').getAttribute('data-cge-codex-cloud-color'), 'red');
  assert.equal(context('target'), true);
  select('default'); await tick();
  assert.equal(storage.values[key], undefined);
  assert.equal(storage.values[chatKey], 'blue');
});
