import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { enableChatNavigation } from '../src/features/chat-navigation/index.ts';
import { chatNavigationStatus } from '../src/features/chat-navigation/status.ts';
import { NAVIGATION_BACKUP_SETTING } from '../src/storage/navigation-backup.ts';
import { enableProjectColors } from '../src/features/project-colors/index.ts';
import { enableChatColors } from '../src/features/chat-colors/index.ts';
import { createFeatureController } from '../src/shared/feature.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';
import { FIRST_CONVERSATION, SECOND_CONVERSATION, navigationDom, bubbleNavigationDom, settleNavigation } from './helpers/navigation-dom.ts';

function setup(t: TestContext, bubbles = false, rail = false) {
  const context = bubbles ? bubbleNavigationDom() : navigationDom();
  const storage = mockChromeStorage();
  const stop = enableChatNavigation(context.document, context.window);
  if (!rail) context.document.querySelector('[data-cge-question-navigation]')!.shadowRoot!.querySelector<HTMLButtonElement>('.expand')!.click();
  t.after(() => { stop(); context.dom.window.close(); });
  const host = () => context.document.querySelector<HTMLElement>('[data-cge-question-navigation]')!;
  const shadow = () => host().shadowRoot!;
  const questions = () => [...shadow().querySelectorAll<HTMLButtonElement>('.question')];
  return { ...context, storage, stop, host, shadow, questions };
}

test('a new destination stays selectable during verification and supersedes the previous guard safely', async (t) => {
  const s = setup(t); await settleNavigation();
  s.questions()[1]!.click();
  assert.equal(s.shadow().querySelector('.panel')!.getAttribute('aria-busy'), 'true');
  assert(s.questions().every((button) => !button.disabled));
  s.questions()[4]!.click();
  await settleNavigation();
  assert.equal(s.scrollArea.scrollTop, 1652);
  assert.equal(s.shadow().querySelector('.panel')!.getAttribute('aria-busy'), 'true');
  await new Promise((resolve) => setTimeout(resolve, 1400));
  assert.equal(s.scrollArea.scrollTop, 1652);
  assert.equal(s.shadow().querySelector('.panel')!.getAttribute('aria-busy'), 'false');
});

test('a recycled bubble whose text changes before debounce cannot jump under its old label', async (t) => {
  const s = setup(t, true); await settleNavigation();
  const button = s.questions()[0]!;
  s.document.getElementById('user-1')!.textContent = 'Changed question with reused turn metadata';
  button.click();
  assert.equal(s.scrolls.length, 0);
  assert.match(s.shadow().querySelector('.scan-status')!.textContent!, /条目已变化/);
});

test('known geometry keeps the navigation visible when virtualized columns temporarily report zero width', async (t) => {
  const s = setup(t); await settleNavigation();
  for (const column of s.document.querySelectorAll<HTMLElement>('.max-w-thread')) {
    column.getBoundingClientRect = () => ({left:0,right:0,top:0,bottom:0,width:0,height:0,x:0,y:0,toJSON:()=>({})});
  }
  s.window.dispatchEvent(new s.dom.window.Event('resize')); await settleNavigation();
  assert.equal(s.host().hidden, false);
  assert.equal(s.questions().length, 5);
});

test('opt-in backups restore earlier questions when a new navigation lifecycle mounts only the last turn', async (t) => {
  const s = navigationDom(); const storage = mockChromeStorage({ [NAVIGATION_BACKUP_SETTING]: true });
  const stop = enableChatNavigation(s.document, s.window); await settleNavigation(); stop();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert(Object.keys(storage.values).some((key) => key.startsWith('navigation.backup.v1.')));
  const last = s.document.getElementById('user-5')!.closest('article')!.cloneNode(true);
  s.document.getElementById('thread')!.replaceChildren(last);
  const stopAgain = enableChatNavigation(s.document, s.window); t.after(() => { stopAgain(); s.dom.window.close(); });
  await settleNavigation();
  assert.equal(chatNavigationStatus(s.document).questions, 5);
});

test('navigation uses the page font and a styled scan hint instead of the browser native title', async (t) => {
  const s = navigationDom();
  s.document.querySelector<HTMLElement>('main')!.style.fontFamily = 'Arial, sans-serif';
  const stop = enableChatNavigation(s.document, s.window);
  t.after(() => { stop(); s.dom.window.close(); });
  await settleNavigation();
  const host = s.document.querySelector<HTMLElement>('[data-cge-question-navigation]')!;
  assert.equal(host.style.getPropertyValue('--page-font'), 'Arial, sans-serif');
  const scan = host.shadowRoot!.querySelector<HTMLButtonElement>('.scan-rail')!;
  assert.equal(scan.hasAttribute('title'), false);
  scan.dispatchEvent(new s.dom.window.Event('pointerenter'));
  const hint = host.shadowRoot!.querySelector<HTMLElement>('.control-hint')!;
  assert.equal(hint.hidden, false);
  assert.match(hint.textContent!, /扫描历史问题/);
  scan.dispatchEvent(new s.dom.window.Event('pointerleave'));
  assert.equal(hint.hidden, true);
});

test('default tick rail previews on hover/focus, dismisses safely and jumps only on click', async (t) => {
  const s = setup(t, false, true); await settleNavigation();
  const ticks = () => [...s.shadow().querySelectorAll<HTMLButtonElement>('.tick')];
  const tooltip = s.shadow().querySelector<HTMLElement>('.tooltip')!;
  assert.equal(s.host().dataset.mode, 'rail');
  assert.equal(s.host().style.width, '36px');
  assert.equal(chatNavigationStatus(s.document).phase, 'collapsed');
  assert.equal(ticks().length, 5);
  assert.equal(s.shadow().querySelector<HTMLElement>('.panel')!.hidden, true);
  ticks()[1]!.dispatchEvent(new s.dom.window.Event('pointerenter'));
  assert.equal(tooltip.hidden, false);
  assert.match(s.shadow().querySelector('.tooltip-number')!.textContent!, /重复的问题/);
  assert.equal(s.scrolls.length, 0);
  ticks()[1]!.dispatchEvent(new s.dom.window.Event('pointerleave'));
  await new Promise((resolve) => setTimeout(resolve, 175));
  assert.equal(tooltip.hidden, true);
  ticks()[1]!.focus();
  assert.equal(tooltip.hidden, false);
  assert.equal(ticks()[1]!.getAttribute('aria-describedby'), tooltip.id);
  ticks()[1]!.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  assert.equal(tooltip.hidden, true);
  assert.equal(ticks()[1]!.hasAttribute('aria-describedby'), false);
  ticks()[1]!.click();
  assert.equal(s.scrolls.length, 1);
  assert.equal(s.scrolls[0]!.top, 452);
  assert.equal(ticks()[1]!.getAttribute('aria-current'), 'true');
  s.shadow().querySelector<HTMLButtonElement>('.expand')!.click(); await settleNavigation();
  assert.equal(s.host().dataset.mode, 'list');
  assert.equal(s.shadow().querySelector<HTMLElement>('.rail')!.hidden, true);
  s.shadow().querySelector<HTMLButtonElement>('.collapse')!.click(); await settleNavigation();
  assert.equal(ticks().length, 5);
  s.document.getElementById('turn-1')!.remove(); await settleNavigation();
  assert.equal(ticks().length, 5); // Unmounted questions stay in the session index.
  assert.equal(tooltip.hidden, true);
  s.stop();
  assert.equal(s.document.querySelector('[data-cge-question-navigation]'), null);
  assert.equal(s.storage.state.writes, 0);
});

test('narrow gutters retain the rail and allow a bounded preview to the right without expanding the list', async (t) => {
  const s = setup(t, false, true);
  s.setColumnLeft(340); s.window.dispatchEvent(new s.dom.window.Event('resize'));
  await settleNavigation();
  assert.equal(s.host().hidden, false);
  const expand = s.shadow().querySelector<HTMLButtonElement>('.expand')!;
  assert.equal(expand.disabled, true);
  expand.click(); await settleNavigation();
  assert.equal(s.host().dataset.mode, 'rail');
  s.shadow().querySelector('.tick')!.dispatchEvent(new s.dom.window.Event('pointerenter'));
  assert.equal(s.shadow().querySelector<HTMLElement>('.tooltip')!.hidden, false);
  assert.equal(s.shadow().querySelector<HTMLElement>('.tooltip')!.style.left, '42px');
});

test('reference-style card shows the original question, remains reachable by pointer and jumps instantly on click', async (t) => {
  const s = setup(t, false, true); await settleNavigation();
  const tick = s.shadow().querySelectorAll<HTMLButtonElement>('.tick')[1]!;
  const card = s.shadow().querySelector<HTMLElement>('.tooltip')!;
  tick.dispatchEvent(new s.dom.window.Event('pointerenter'));
  assert.match(s.shadow().querySelector('.tooltip-number')!.textContent!, /重复的问题/);
  tick.dispatchEvent(new s.dom.window.Event('pointerleave'));
  card.dispatchEvent(new s.dom.window.Event('pointerenter'));
  await new Promise((resolve) => setTimeout(resolve, 175));
  assert.equal(card.hidden, false);
  s.shadow().querySelector<HTMLButtonElement>('.preview-jump')!.click();
  assert.equal(card.hidden, true);
  assert.equal(s.scrolls.at(-1)!.top, 452);
  assert.equal(s.scrolls.at(-1)!.behavior, 'instant');
  tick.dispatchEvent(new s.dom.window.Event('pointerenter'));
  s.document.body.dispatchEvent(new s.dom.window.Event('pointerdown', { bubbles: true }));
  assert.equal(card.hidden, true);
});

test('bubble-only pages render, update, jump and guard recycled virtualized turns', async (t) => {
  const s = setup(t, true); await settleNavigation();
  assert.equal(s.questions().length, 2);
  assert.equal(s.host().hidden, false);
  assert.equal(chatNavigationStatus(s.document).phase, 'visible');
  s.questions()[1]!.click();
  assert.equal(s.scrolls.at(-1)!.top, 452);
  const stale = s.questions()[0]!;
  s.document.getElementById('turn-1')!.dataset.turnKey = 'recycled-turn';
  stale.click();
  assert.equal(s.scrolls.length, 1);
  s.document.getElementById('user-1')!.textContent = 'Edited bubble';
  await settleNavigation();
  assert(s.questions().some((button) => /Edited bubble/.test(button.textContent!)));
  const assistant = s.document.getElementById('assistant')!;
  const button = s.questions()[0];
  assistant.firstChild!.nodeValue = 'Streaming assistant';
  await settleNavigation();
  assert.equal(s.questions()[0], button);
  const turn = s.document.createElement('div'); turn.dataset.turnKey = 'added-turn';
  turn.innerHTML = '<div class="max-w-thread"><div data-user-message-bubble>Added bubble</div></div>';
  s.scrollArea.append(turn); await settleNavigation();
  assert.equal(s.questions().length, 4); // Includes the old identity of the recycled turn.
  const removedMarker = s.questions().find((button) => button.dataset.questionKey === 'message:turn-key:recycled-turn')!;
  s.document.getElementById('user-1')!.removeAttribute('data-user-message-bubble');
  removedMarker.click();
  assert.equal(s.scrolls.length, 1);
  await settleNavigation();
  assert.equal(s.questions().length, 3);
  turn.remove(); await settleNavigation();
  assert.equal(s.questions().length, 3);
  assert.equal(s.storage.state.writes, 0);
});

test('renders left-gutter navigation with search, clear, safe labels/tooltips, and collapse/expand', async (t) => {
  const s = setup(t); await settleNavigation();
  assert.equal(s.questions().length, 5);
  assert.equal(s.host().hidden, false);
  assert.equal(chatNavigationStatus(s.document).phase, 'visible');
  assert.equal(chatNavigationStatus(s.document).questions, 5);
  const left = Number.parseFloat(s.host().style.left);
  assert(left >= 260);
  assert(left + Number.parseFloat(s.host().style.width) < 650);
  const input = s.shadow().querySelector('input')!;
  input.value = 'code'; input.dispatchEvent(new s.dom.window.Event('input'));
  assert.equal(s.questions().length, 1);
  assert.equal(s.questions()[0]!.querySelector('.number')!.textContent, '3.');
  s.shadow().querySelector<HTMLButtonElement>('.clear')!.click();
  assert.equal(s.questions().length, 5);
  s.shadow().querySelector<HTMLButtonElement>('.collapse')!.focus();
  s.shadow().querySelector<HTMLButtonElement>('.collapse')!.click(); await settleNavigation();
  assert.equal(s.host().style.width, '36px');
  assert.equal(s.shadow().querySelector<HTMLElement>('.panel')!.hidden, true);
  assert.equal(s.shadow().activeElement, s.shadow().querySelector('.expand'));
  s.shadow().querySelector<HTMLButtonElement>('.expand')!.click(); await settleNavigation();
  assert.equal(s.shadow().querySelector<HTMLElement>('.panel')!.hidden, false);
  assert(s.questions().every((button) => !button.hasAttribute('title')));
  s.questions()[0]!.dispatchEvent(new s.dom.window.Event('pointerenter'));
  assert.equal(s.shadow().querySelector<HTMLElement>('.tooltip')!.hidden, false);
  assert.match(s.shadow().querySelector('.tooltip-text')!.textContent!, /重复的问题/);
  assert.equal(s.storage.state.writes, 0);
});

test('jumps instantly to the correct duplicate-text message with header offset, leaving URL unchanged', async (t) => {
  const s = setup(t); await settleNavigation();
  const path = s.window.location.pathname;
  s.questions()[1]!.click();
  assert.equal(s.scrolls.length, 1);
  assert.equal(s.scrolls[0]!.behavior, 'instant');
  assert.equal(s.scrolls[0]!.top, 452);
  assert.equal(s.document.getElementById('turn-2')!.getBoundingClientRect().top, 88);
  assert.equal(s.questions()[1]!.getAttribute('aria-current'), 'true');
  assert.equal(s.window.location.pathname, path);
  const stale = s.questions()[2]!;
  s.document.getElementById('turn-3')!.remove();
  stale.click();
  assert.equal(s.scrolls.length, 1);
  await settleNavigation();
  assert.equal(s.questions().length, 5);
});

test('recycled or hidden message targets are rejected at click time before observer debounce', async (t) => {
  const s = setup(t); await settleNavigation();
  const stale = s.questions()[0]!;
  s.document.getElementById('user-1')!.dataset.messageId = 'recycled-user';
  stale.click();
  assert.equal(s.scrolls.length, 0);
  await settleNavigation();
  const nowHidden = s.questions().find((button) => button.dataset.questionKey === 'message:id:recycled-user')!;
  s.document.getElementById('user-1')!.hidden = true;
  nowHidden.click();
  assert.equal(s.scrolls.length, 0);
});

test('new and edited user messages update the list; assistant streaming does not rebuild or reread previews', async (t) => {
  const s = setup(t); await settleNavigation();
  const first = s.questions()[0];
  const user = s.document.getElementById('user-1')!;
  const userText = user.querySelector('p')!.firstChild!;
  let reads = 0;
  const originalValue = userText.nodeValue;
  Object.defineProperty(userText, 'nodeValue', { configurable: true, get: () => { reads++; return originalValue; } });
  Object.defineProperty(user, 'childNodes', { configurable: true, get: () => assert.fail('Unnecessary user preview reread during assistant streaming') });
  const assistant = s.document.getElementById('assistant')!.querySelector('p')!;
  assistant.firstChild!.nodeValue = 'Stream chunk';
  assistant.append(s.document.createTextNode(' next chunk'));
  await settleNavigation();
  assert.equal(s.questions()[0], first);
  assert.equal(reads, 0);
  Reflect.deleteProperty(userText, 'nodeValue');
  delete (user as unknown as Record<string, unknown>).childNodes;
  user.querySelector('p')!.textContent = 'Edited user question';
  await settleNavigation();
  assert.match(s.questions()[0]!.textContent!, /Edited user question/);
  const article = s.document.createElement('article'); article.dataset.testid = 'conversation-turn-6';
  article.innerHTML = '<div class="max-w-thread" style="max-width:768px"><div data-message-author-role="user" data-message-id="new-user">New user question</div></div>';
  s.document.getElementById('thread')!.append(article); await settleNavigation();
  assert.equal(s.questions().length, 6);
  assert.equal(s.storage.state.writes, 0);
});

test('SPA route switch clears search and stale targets before reading replacement conversation', async (t) => {
  const s = setup(t); await settleNavigation();
  const input = s.shadow().querySelector('input')!; input.value = 'code'; input.dispatchEvent(new s.dom.window.Event('input'));
  s.dom.window.history.pushState({}, '', `/c/${SECOND_CONVERSATION}`);
  s.window.dispatchEvent(new s.dom.window.PopStateEvent('popstate'));
  assert.equal(s.questions().length, 0);
  assert.equal(input.value, '');
  const root = s.document.getElementById('thread')!;
  root.dataset.conversationId = SECOND_CONVERSATION;
  // The original nodes still exist during transition: do not label them as the new conversation.
  await settleNavigation();
  assert.equal(s.questions().length, 0);
  root.innerHTML = '<article id="turn-1" data-testid="conversation-turn-0"><div class="max-w-thread" style="max-width:768px"><div data-message-author-role="user" data-message-id="second-user">Second conversation only</div></div></article>';
  await settleNavigation();
  assert.equal(s.questions().length, 1);
  assert.match(s.questions()[0]!.textContent!, /Second conversation only/);
});

test('pushState without an event is noticed by URL-only polling and same-route DOM replacement is rebound', async (t) => {
  const s = setup(t); await settleNavigation();
  const old = s.document.getElementById('thread')!;
  old.replaceWith(old.cloneNode(true)); await settleNavigation();
  assert.equal(s.questions().length, 5);
  const replacement = s.document.getElementById('thread')!;
  s.dom.window.history.pushState({}, '', `/g/g-p-project/c/${SECOND_CONVERSATION}`);
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(s.questions().length, 0);
  replacement.dataset.conversationId = SECOND_CONVERSATION;
  replacement.innerHTML = '<article id="turn-1"><div class="max-w-thread" style="max-width:768px"><div data-message-author-role="user" data-message-id="new-route">New route question</div></div></article>';
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(s.questions().length, 1);
  assert.match(s.questions()[0]!.textContent!, /New route question/);
});

test('a root metadata change before the URL cannot reclassify old message nodes as the new conversation', async (t) => {
  const s = setup(t); await settleNavigation();
  const root = s.document.getElementById('thread')!;
  root.dataset.conversationId = SECOND_CONVERSATION;
  await settleNavigation();
  assert.equal(s.questions().length, 0);
  s.dom.window.history.pushState({}, '', `/c/${SECOND_CONVERSATION}`);
  s.window.dispatchEvent(new s.dom.window.PopStateEvent('popstate'));
  await settleNavigation();
  assert.equal(s.questions().length, 0);
  root.replaceChildren();
  const next = s.document.createElement('div'); next.dataset.messageAuthorRole = 'user'; next.dataset.messageId = 'brand-new'; next.textContent = 'New conversation';
  root.append(next); await settleNavigation();
  assert.equal(s.questions().length, 1);
});

test('IntersectionObserver updates active reading state; narrow screens hide safely and theme changes stay scoped', async (t) => {
  const s = setup(t); await settleNavigation();
  assert(s.intersections.some((observer) => observer.observed.size === 5));
  s.scrollArea.scrollTop = 500;
  s.intersections.at(-1)!.trigger();
  assert.equal(s.questions()[1]!.getAttribute('aria-current'), 'true');
  Object.defineProperty(s.window, 'innerWidth', { value: 800, writable: true });
  s.window.dispatchEvent(new s.dom.window.Event('resize')); await settleNavigation();
  assert.equal(s.host().hidden, true);
  assert.equal(chatNavigationStatus(s.document).phase, 'hidden');
  assert.equal(chatNavigationStatus(s.document).reason, 'narrow');
  Object.defineProperty(s.window, 'innerWidth', { value: 1920, writable: true });
  s.window.dispatchEvent(new s.dom.window.Event('resize')); await settleNavigation();
  assert.equal(s.host().hidden, false);
  s.setColumnLeft(300); s.window.dispatchEvent(new s.dom.window.Event('resize')); await settleNavigation();
  assert.equal(s.host().hidden, true);
  assert.equal(chatNavigationStatus(s.document).reason, 'gutter');
  assert.equal(chatNavigationStatus(s.document).gutter, 40);
  s.document.documentElement.className = 'dark'; await settleNavigation();
  assert.equal(s.host().dataset.theme, 'dark');
});

test('same-URL cached branch visibility changes bind the newly active rendered root', async (t) => {
  const s = setup(t); await settleNavigation();
  const alternate = s.document.createElement('section'); alternate.dataset.conversationId = FIRST_CONVERSATION;
  alternate.innerHTML = '<article id="turn-1"><div class="max-w-thread" style="max-width:768px"><div data-message-author-role="user" data-message-id="alternate-user">Alternate rendered branch</div></div></article>';
  alternate.style.display = 'none'; s.document.querySelector('main')!.append(alternate);
  await settleNavigation();
  assert.equal(s.questions().length, 5);
  s.scrollArea.style.display = 'none'; alternate.style.display = 'block';
  await settleNavigation();
  assert.equal(s.questions().length, 6);
  assert(s.questions().some((button) => /Alternate rendered branch/.test(button.textContent!)));
});

test('scan controls expose stop/progress and disabling clears the session index and pending operation', async (t) => {
  const s = setup(t); await settleNavigation();
  s.scrollArea.scrollTop = 500;
  const scan = s.shadow().querySelector<HTMLButtonElement>('.scan-history')!;
  scan.click();
  assert.equal(s.shadow().querySelector('.panel')!.getAttribute('aria-busy'), 'true');
  assert(s.questions().every((button) => button.disabled));
  assert.match(scan.textContent!, /停止/);
  scan.click();
  await new Promise((resolve) => setTimeout(resolve, 1550));
  assert.equal(s.scrollArea.scrollTop, 500);
  assert.equal(s.shadow().querySelector('.panel')!.getAttribute('aria-busy'), 'false');
  assert.match(s.shadow().querySelector('.scan-status')!.textContent!, /已停止/);
  scan.click(); s.stop();
  const moves = s.scrolls.length;
  await settleNavigation();
  assert.equal(s.scrolls.length, moves);
  const stop = enableChatNavigation(s.document, s.window);
  s.document.getElementById('turn-1')!.remove(); await settleNavigation();
  assert.equal(chatNavigationStatus(s.document).questions, 5); // Already discovered in the new lifecycle.
  stop();
});

test('disable disposes all navigation observers, targets, timers and UI without writes', async (t) => {
  const s = setup(t); await settleNavigation();
  assert(s.mutations.some((observer) => observer.observing));
  assert(s.mutations.every((observer) => !observer.subtreeTargets.includes(s.document.body)));
  s.questions()[0]!.click();
  const oldHost = s.host();
  s.stop(); s.stop();
  assert.equal(chatNavigationStatus(s.document).phase, 'disabled');
  assert.equal(s.document.querySelector('[data-cge-question-navigation]'), null);
  assert.equal(oldHost.shadowRoot!.querySelectorAll('.question').length, 0);
  assert(s.mutations.every((observer) => !observer.observing));
  assert(s.intersections.every((observer) => observer.observed.size === 0));
  assert(s.resizes.every((observer) => observer.observed.size === 0));
  s.document.getElementById('thread')!.append(s.document.createElement('div'));
  s.window.dispatchEvent(new s.dom.window.Event('resize'));
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(s.document.querySelector('[data-cge-question-navigation]'), null);
  assert.equal(s.storage.state.writes, 0);
});

test('feature controller keeps real Sidebar Colors independent through navigation toggle cycles', async (t) => {
  const s = navigationDom(); t.after(() => s.dom.window.close());
  const storage = mockChromeStorage({
    'projectColors.v1.g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 'red',
    [`chatColors.v1.${FIRST_CONVERSATION}`]: 'blue',
  });
  const controller = createFeatureController([
    { id: 'projectColors', enable: () => enableProjectColors(s.document, s.window) },
    { id: 'chatColors', enable: () => enableChatColors(s.document, s.window) },
    { id: 'chatNavigation', enable: () => enableChatNavigation(s.document, s.window) },
  ]);
  t.after(() => controller.dispose());
  controller.apply({ projectColors: true, chatColors: true, chatNavigation: true });
  controller.apply({ projectColors: true, chatColors: true, chatNavigation: true });
  await settleNavigation();
  assert.equal(s.document.querySelectorAll('[data-cge-question-navigation]').length, 1);
  controller.apply({ projectColors: true, chatColors: true, chatNavigation: false });
  assert.equal(s.document.querySelector('[data-cge-question-navigation]'), null);
  assert.equal(s.document.getElementById('sidebar-project')!.getAttribute('data-cge-project-color'), 'red');
  assert.equal(s.document.getElementById('sidebar-chat')!.getAttribute('data-cge-chat-color'), 'blue');
  assert.equal(storage.listeners.size, 2);
  controller.apply({ projectColors: false, chatColors: false, chatNavigation: true }); await settleNavigation();
  assert.equal(s.document.querySelectorAll('[data-cge-question-navigation]').length, 1);
  assert.equal(s.document.querySelector('[data-cge-project-color]'), null);
  assert.equal(storage.listeners.size, 1); // Navigation's independent opt-in backup preference observer.
  controller.dispose();
});
