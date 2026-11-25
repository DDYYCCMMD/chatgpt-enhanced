import assert from 'node:assert/strict';
import { test } from 'node:test';
import { panelLayout } from '../src/features/chat-navigation/layout.ts';
import { createQuestionDiscovery, findConversation } from '../src/features/chat-navigation/discovery.ts';
import { createMessageJumper } from '../src/features/chat-navigation/scroll.ts';
import { FIRST_CONVERSATION, navigationDom } from './helpers/navigation-dom.ts';

const base = {
  viewportWidth: 1920, viewportHeight: 1000,
  main: { left: 0, right: 1920, top: 0, bottom: 1000, width: 1920 },
  column: { left: 650, right: 1418, top: 80, bottom: 800, width: 768 },
  sidebarRight: 260, headerBottom: 64, composerTop: 820, collapsed: false,
};

test('left-gutter layout never overlaps native sidebar, content, header or composer', () => {
  const expanded = panelLayout(base);
  assert.equal(expanded.visible, true);
  assert(expanded.left >= base.sidebarRight + 12);
  assert(expanded.left + expanded.width <= base.column.left - 12);
  assert(expanded.top >= base.headerBottom + 12);
  assert(expanded.top + expanded.height <= base.composerTop - 12);
  assert.equal(panelLayout({ ...base, collapsed: true }).width, 36);
  const compact = { ...base, collapsed: true, sidebarRight: 570 };
  assert.equal(panelLayout(compact).visible, true);
  assert.equal(panelLayout({ ...compact, collapsed: false }).visible, false);
  assert(panelLayout(compact).height > 36);
  assert.equal(panelLayout({ ...base, viewportWidth: 800 }).visible, false);
  assert.equal(panelLayout({ ...base, sidebarRight: 630 }).visible, false);
  assert.equal(panelLayout({ ...base, composerTop: 180 }).visible, false);
  const noGap = panelLayout({ ...base, column: { ...base.column, left: 0 } });
  assert.equal(noGap.visible, false);
  assert(noGap.width >= 0);
});

test('jumps are instantaneous even with CSS smooth scrolling, create no animation and reject detached targets', (t) => {
  const s = navigationDom(); t.after(() => s.dom.window.close());
  const scope = findConversation(s.document, FIRST_CONVERSATION)!;
  const question = createQuestionDiscovery().collect(scope)[1]!;
  s.scrollArea.style.scrollBehavior = 'smooth';
  question.target.animate = (() => assert.fail('Jump must not animate')) as typeof question.target.animate;
  const jumper = createMessageJumper(s.window, scope.root, () => 56);
  assert.equal(jumper.jump(question), true);
  assert.equal(s.scrolls.at(-1)!.behavior, 'instant');
  jumper.dispose();
  Object.defineProperty(s.window, 'matchMedia', { value: () => ({ matches: true }) });
  assert.equal(jumper.jump(question), true);
  assert.equal(s.scrolls.at(-1)!.behavior, 'instant');
  const count = s.scrolls.length;
  question.target.remove();
  assert.equal(jumper.jump(question), false);
  assert.equal(s.scrolls.length, count);
  jumper.dispose();
});
