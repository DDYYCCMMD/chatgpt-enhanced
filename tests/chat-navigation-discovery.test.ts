import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { conversationId, createQuestionDiscovery, findConversation, messageStamp } from '../src/features/chat-navigation/discovery.ts';
import { questionPreview, PREVIEW_LENGTH } from '../src/features/chat-navigation/preview.ts';
import { FIRST_CONVERSATION, SECOND_CONVERSATION, navigationDom, bubbleNavigationDom } from './helpers/navigation-dom.ts';

test('a single explicit search message UUID takes precedence over a recyclable turn slot', (t) => {
  const { dom, document } = bubbleNavigationDom(); t.after(() => dom.window.close());
  const message = document.getElementById('user-1')!;
  const owner = message.closest('[data-chatgpt-search-message-ids]')!;
  owner.setAttribute('data-chatgpt-search-message-ids', JSON.stringify([FIRST_CONVERSATION]));
  const scope = findConversation(document, FIRST_CONVERSATION)!;
  assert.equal(messageStamp(message, scope.root), `id:${FIRST_CONVERSATION}`);
  document.getElementById('turn-1')!.dataset.turnKey = 'recycled-slot';
  assert.equal(messageStamp(message, scope.root), `id:${FIRST_CONVERSATION}`);
  owner.setAttribute('data-chatgpt-search-message-ids', JSON.stringify([FIRST_CONVERSATION, SECOND_CONVERSATION]));
  assert.equal(messageStamp(message, scope.root), 'turn-key:recycled-slot');
});

test('captured bubble structure without legacy author roles or thread IDs identifies only user messages', (t) => {
  const { dom, document } = bubbleNavigationDom(); t.after(() => dom.window.close());
  assert.equal(document.querySelectorAll('[data-message-author-role="user"]').length, 0);
  const scope = findConversation(document, FIRST_CONVERSATION)!;
  assert.equal(scope.root, document.querySelector('main'));
  Object.defineProperty(document.getElementById('assistant')!.firstChild!, 'nodeValue', {
    get: () => assert.fail('Assistant response was read'),
  });
  const questions = createQuestionDiscovery().collect(scope);
  assert.deepEqual(questions.map((q) => q.message.id), ['user-1', 'user-2']);
  assert.equal(questions[0]!.preview, questions[1]!.preview);
  assert.notEqual(questions[0]!.key, questions[1]!.key);
  assert.equal(questions[0]!.target, document.getElementById('turn-1'));
  assert.equal(questions[0]!.key, 'message:turn-key:turn-a');
});

test('mixed bubble and author markers deduplicate and reject conflicting assistant ownership', (t) => {
  const { dom, document } = bubbleNavigationDom(); t.after(() => dom.window.close());
  const scope = findConversation(document, FIRST_CONVERSATION)!;
  const first = document.getElementById('user-1')!;
  first.innerHTML = '<div data-message-author-role="user" data-message-id="canonical">Canonical message <span data-user-message-bubble>nested bubble</span></div>';
  document.getElementById('assistant')!.innerHTML = '<div data-message-author-role="assistant"><div data-user-message-bubble>False user</div></div>';
  const questions = createQuestionDiscovery().collect(scope);
  assert.equal(questions.length, 2);
  assert.equal(questions[0]!.key, 'message:id:canonical');
  assert.equal(questions.some((q) => q.preview.includes('False user')), false);
});

test('navigation structural diagnostic reports selection and container shapes without content or identifiers', (t) => {
  const { dom, document } = navigationDom(); t.after(() => dom.window.close());
  const output: string[] = [];
  dom.window.console.log = (value: string) => output.push(value);
  const selected = document.getElementById('user-1')!;
  selected.setAttribute('aria-label', 'PRIVATE LABEL');
  Object.defineProperty(dom.window, '$0', { value: selected, configurable: true });
  const code = readFileSync(new URL('../docs/navigation-diagnostic.js', import.meta.url), 'utf8');
  dom.window.eval(code);
  const report = JSON.parse(output[0]!);
  assert.equal(report.ancestors[0].author, 'user');
  assert(report.containers.some((node: { userDescendants: number }) => node.userDescendants >= 5));
  for (const secret of [FIRST_CONVERSATION, 'PRIVATE LABEL', '重复的问题', 'ASSISTANT', 'UNSENT COMPOSER', 'user-1']) {
    assert.equal(output[0]!.includes(secret), false);
  }
});

test('discovers only visible active-conversation user messages in chronological order, including duplicate text', (t) => {
  const { dom, document } = navigationDom(); t.after(() => dom.window.close());
  const assistant = document.getElementById('assistant')!;
  Object.defineProperty(assistant, 'textContent', { get: () => assert.fail('Assistant body was read') });
  const scope = findConversation(document, FIRST_CONVERSATION)!;
  const questions = createQuestionDiscovery().collect(scope);
  assert.deepEqual(questions.map((question) => question.message.id), ['user-1', 'user-2', 'user-3', 'user-4', 'user-5']);
  assert.equal(questions[0]!.preview, questions[1]!.preview);
  assert.notEqual(questions[0]!.key, questions[1]!.key);
  assert.equal(questions[2]!.preview.includes('const count = 2; console.log(count);'), true);
  assert.equal(questions[2]!.preview.includes('Copy code'), false);
  assert.equal(questions[3]!.preview, '图片或附件消息');
  assert.equal(questions[4]!.preview, '空白消息');
  const serialized = JSON.stringify(questions.map(({ key, preview, tooltip }) => ({ key, preview, tooltip })));
  for (const secret of ['ASSISTANT', 'HIDDEN TEMPLATE', 'CSS HIDDEN', 'UNSENT COMPOSER', 'private-file-name', 'private image description']) assert.equal(serialized.includes(secret), false);
});

test('message IDs deduplicate responsive copies while DOM-reference fallback never uses text identity', (t) => {
  const { dom, document } = navigationDom(); t.after(() => dom.window.close());
  const scope = findConversation(document, FIRST_CONVERSATION)!;
  scope.root.append(document.getElementById('user-1')!.cloneNode(true));
  const discovery = createQuestionDiscovery();
  assert.equal(discovery.collect(scope).length, 5);
  const first = document.createElement('div'); first.dataset.messageAuthorRole = 'user'; first.textContent = 'Same fallback text';
  const second = first.cloneNode(true) as HTMLElement;
  scope.root.append(first, second);
  const before = discovery.collect(scope).slice(-2);
  assert.notEqual(before[0]!.key, before[1]!.key);
  first.textContent = 'Edited fallback text';
  assert.equal(discovery.collect(scope).at(-2)!.key, before[0]!.key);
  first.replaceWith(first.cloneNode(true));
  assert.notEqual(discovery.collect(scope).at(-2)!.key, before[0]!.key);
});

test('previews handle multiline code, unsafe markup as text, and bounded Unicode truncation', (t) => {
  const { dom, document } = navigationDom(); t.after(() => dom.window.close());
  const message = document.createElement('div');
  message.append(document.createTextNode('<img onerror="alert(1)">\n' + '😀'.repeat(200)));
  const preview = questionPreview(message);
  assert.equal(Array.from(preview.preview).length, PREVIEW_LENGTH);
  assert(preview.preview.endsWith('…'));
  assert(preview.tooltip.length < 800);
  assert(preview.preview.startsWith('<img onerror='));
  message.textContent = 'a'.repeat(10000);
  assert(questionPreview(message).searchText.length <= 2048);
});

test('scopes exclude another conversation, hidden roots, and ambiguous visible mains', (t) => {
  const { dom, document } = navigationDom(); t.after(() => dom.window.close());
  const current = document.getElementById('thread')!;
  const other = document.createElement('section'); other.dataset.conversationId = SECOND_CONVERSATION;
  other.innerHTML = '<div data-message-author-role="user" data-message-id="other">OTHER CONVERSATION</div>';
  document.querySelector('main')!.append(other);
  assert.equal(findConversation(document, FIRST_CONVERSATION)!.root, current);
  assert.equal(createQuestionDiscovery().collect(findConversation(document, FIRST_CONVERSATION)!).some((q) => q.preview.includes('OTHER')), false);
  other.hidden = true;
  assert.equal(findConversation(document, SECOND_CONVERSATION), null);
  const duplicate = document.createElement('main'); duplicate.innerHTML = `<section data-conversation-id="${FIRST_CONVERSATION}"></section>`;
  document.body.append(duplicate);
  assert.equal(findConversation(document, FIRST_CONVERSATION), null);
});

test('route and stale-node guards reject an old message until its stable metadata changes', (t) => {
  const { dom, document } = navigationDom(); t.after(() => dom.window.close());
  assert.equal(conversationId(`/g/g-p-project/c/${FIRST_CONVERSATION}`), FIRST_CONVERSATION);
  assert.equal(conversationId('/'), null);
  assert.equal(conversationId('/g/g-p-project/project'), null);
  const scope = findConversation(document, FIRST_CONVERSATION)!;
  const node = document.getElementById('user-1')!;
  const blocked = new WeakMap([[node, messageStamp(node, scope.root)]]);
  assert.equal(createQuestionDiscovery().collect(scope, blocked).some((q) => q.message === node), false);
  node.dataset.messageId = 'new-conversation-message';
  assert.equal(createQuestionDiscovery().collect(scope, blocked).some((q) => q.message === node), true);
});
