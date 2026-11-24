import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { findSidebars } from '../src/shared/sidebar-colors/sidebar.ts';
import { discoverProjects } from '../src/features/project-colors/detection.ts';
import { discoverChats } from '../src/features/chat-colors/detection.ts';
import { enableProjectColors } from '../src/features/project-colors/index.ts';
import { enableChatColors } from '../src/features/chat-colors/index.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

const project = 'g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const chat = '11111111-1111-1111-1111-111111111111';
const fixture = `<main role="main"><div data-sidebar="true" id="modern-sidebar">
  <div data-app-action-sidebar-project-id="${project}" data-app-action-sidebar-project-row role="button" tabindex="0" id="project-row">Project</div>
  <div data-sidebar-archive-chatgpt-id="${chat}" id="chat-row"><div><a href="/c/${chat}" id="chat-link">Chat</a></div></div>
</div><section><article data-testid="conversation-turn-0"><div data-message-author-role="user">
  <aside data-sidebar="fake" id="message-fake-sidebar"><a href="/g/${project}/project" id="message-project">Message link</a>
    <div data-app-action-sidebar-project-id="${project}" role="button" id="message-marker">Quoted marker</div>
    <div data-sidebar-archive-chatgpt-id="${chat}"><a href="/c/${chat}" id="message-chat">Message link</a></div>
  </aside>
</div></article></section></main>`;

function setup(t: TestContext, html: string) {
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/' });
  mockChromeStorage();
  const doc = dom.window.document;
  const window = dom.window as unknown as Window;
  const stopProject = enableProjectColors(doc, window);
  const stopChat = enableChatColors(doc, window);
  t.after(() => { stopProject(); stopChat(); dom.window.close(); });
  const context = (id: string) => {
    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    doc.getElementById(id)!.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { dom, doc, context };
}

test('trusted sidebars inside a main app shell open both menus, while message copies stay excluded', async (t) => {
  const { doc, context } = setup(t, fixture);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(findSidebars(doc).map((root) => root.id), ['modern-sidebar']);
  assert.equal(context('project-row'), true);
  assert.equal(context('chat-link'), true);
  for (const id of ['message-project', 'message-marker', 'message-chat']) assert.equal(context(id), false, id);
  // Even direct detector calls on the whole app must reject conversation message subtrees.
  assert.deepEqual(discoverProjects(doc.querySelector('main')!).map((row) => row.id), [project]);
  assert.deepEqual(discoverChats(doc.querySelector('main')!).map((row) => row.id), [chat]);
});

test('explicit sidebar metadata can bootstrap inside main without a legacy root ID', async (t) => {
  const { doc, context } = setup(t, `<main><div data-app-action-sidebar-project-id="${project}" role="button" id="p">Project</div>
    <div data-sidebar-archive-chatgpt-id="${chat}"><a href="/c/${chat}" id="c">Chat</a></div></main>`);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(findSidebars(doc).length, 2);
  assert.equal(context('p'), true);
  assert.equal(context('c'), true);
});

test('an app-wide sidebar attribute cannot turn message content into an observed sidebar root', (t) => {
  const { doc } = setup(t, fixture);
  doc.querySelector('main')!.setAttribute('data-sidebar', 'provider');
  assert.deepEqual(findSidebars(doc).map((root) => root.id), ['modern-sidebar']);
});

test('stable navigation URL metadata works on role=link/summary rows and remains separately namespaced', async (t) => {
  const { doc, context } = setup(t, `<aside>
    <div id="p" role="link" data-project-url="/g/${project}/project">Project</div>
    <summary id="c" data-href="/c/${chat}">Chat</summary>
    <a id="conflict" href="/c/${chat}" data-href="/g/${project}/project">Conflict</a>
  </aside>`);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(context('p'), true);
  const projectMenu = doc.querySelector('[data-cge-color-menu]')!.shadowRoot!.querySelector('[role="menu"]')!;
  assert.equal(projectMenu.getAttribute('aria-label'), 'Project color');
  assert.equal(context('c'), true);
  assert.equal(doc.querySelector('[data-cge-color-menu]')!.shadowRoot!.querySelector('[role="menu"]')!.getAttribute('aria-label'), 'Chat color');
  assert.equal(context('conflict'), false);
});
