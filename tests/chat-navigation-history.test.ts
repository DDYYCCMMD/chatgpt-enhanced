import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createHistoryNavigator } from '../src/features/chat-navigation/history.ts';
import type { HistoryState } from '../src/features/chat-navigation/history.ts';
import { createQuestionIndex } from '../src/features/chat-navigation/question-index.ts';
import { createQuestionDiscovery } from '../src/features/chat-navigation/discovery.ts';
import type { Question } from '../src/features/chat-navigation/types.ts';
import { navigationDom } from './helpers/navigation-dom.ts';

function setup(t: TestContext, limit = 2000, maxSteps = 40) {
  const s = navigationDom();
  const root = s.document.getElementById('thread')!;
  const scope = { root, main: s.document.querySelector('main')! };
  const model = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, top: 100 + i * 600 }));
  const index = createQuestionIndex(s.window, limit);
  const discovery = createQuestionDiscovery();
  let mounted: Question[] = [];
  let live = true;
  const states: HistoryState[] = [];
  const resolved: string[] = [];
  const moves: number[] = [];
  function render() {
    root.replaceChildren();
    for (const item of model) {
      if (item.top < s.scrollArea.scrollTop - 80 || item.top > s.scrollArea.scrollTop + 780) continue;
      const turn = s.document.createElement('div'); turn.dataset.turnKey = item.id;
      const message = s.document.createElement('div'); message.dataset.userMessageBubble = ''; message.textContent = 'Duplicate question';
      turn.append(message); root.append(turn);
      turn.getBoundingClientRect = () => ({ top: 72 + item.top - s.scrollArea.scrollTop, bottom: 172 + item.top - s.scrollArea.scrollTop,
        left: 650, right: 1418, width: 768, height: 100, x: 650, y: 72 + item.top - s.scrollArea.scrollTop, toJSON: () => ({}) });
      const assistant = s.document.createElement('div'); assistant.dataset.messageAuthorRole = 'assistant';
      assistant.textContent = 'PRIVATE ASSISTANT'; root.append(assistant);
      Object.defineProperty(assistant.firstChild!, 'nodeValue', { get: () => assert.fail('Assistant content was read') });
    }
  }
  function refresh() { mounted = discovery.collect(scope); index.merge(mounted); }
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    s.scrollArea.scrollTop = options.top ?? 0; moves.push(s.scrollArea.scrollTop); render();
  }) as typeof s.scrollArea.scrollTo;
  s.scrollArea.scrollTop = 1700; render(); refresh();
  const history = createHistoryNavigator(s.window, root, {
    valid: () => live, mounted: () => mounted, refresh, entry: (key) => index.get(key), count: () => index.size,
    full: () => index.full, resolved: (question) => { assert(question.message.isConnected); resolved.push(question.key); return true; },
    state: (state) => states.push(state), settleMs: 1, maxSteps, maxDurationMs: 1000,
  });
  t.after(() => { history.dispose(); index.clear(); s.dom.window.close(); });
  return { ...s, root, model, index, history, states, resolved, moves, render, refresh, invalidate: () => { live = false; } };
}

test('manual scan discovers virtualized history, keeps summaries without detached nodes and restores reading offset', async (t) => {
  const s = setup(t);
  assert.equal(s.index.size, 1);
  await s.history.scan();
  assert.equal(s.index.size, 5);
  assert.equal(s.scrollArea.scrollTop, 1700);
  assert.deepEqual(s.index.merge([]).map((q) => q.key), ['m0', 'm1', 'm2', 'm3', 'm4'].map((key) => `message:turn-key:${key}`));
  assert.equal(s.states.at(-1)!.busy, false);
  assert.match(s.states.at(-1)!.text, /已恢复阅读位置/);
  for (const summary of s.index.merge([])) {
    assert.equal('message' in summary, false); assert.equal('target' in summary, false);
    assert.equal(summary.preview, 'Duplicate question');
  }
  assert.equal(s.moves[0], 0);
});

test('cached navigation waits for an exact stable identity; missing targets restore instead of selecting another turn', async (t) => {
  const s = setup(t); await s.history.scan();
  const before = s.moves.length;
  await s.history.seek('message:turn-key:m0');
  assert.equal(s.moves.length - before, 1); // One positional jump, no neighbouring viewport traversal.
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
  s.scrollArea.scrollTop = 1700; s.render(); s.refresh();
  s.model.splice(0, 1);
  await s.history.seek('message:turn-key:m0');
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
  assert.equal(s.scrollArea.scrollTop, 1700);
  assert.match(s.states.at(-1)!.text, /尚未重新渲染/);
});

test('stop restores the original position, while wheel takeover and disposal prevent further automatic scrolling', async (t) => {
  const s = setup(t);
  const pending = s.history.scan(); s.history.cancel(true); await pending;
  assert.equal(s.scrollArea.scrollTop, 1700);
  assert.match(s.states.at(-1)!.text, /已停止/);
  const manual = s.history.scan();
  s.scrollArea.scrollTop = 800; s.render();
  s.window.dispatchEvent(new s.dom.window.WheelEvent('wheel'));
  await manual;
  assert.equal(s.scrollArea.scrollTop, 800);
  const disposed = s.history.scan();
  s.invalidate(); s.history.dispose();
  const moveCount = s.moves.length;
  await disposed;
  assert.equal(s.moves.length, moveCount);
  assert.equal(s.history.busy, false);
});

test('scan caps and entry caps return partial results and still restore the reading position', async (t) => {
  const s = setup(t, 2, 1);
  await s.history.scan();
  assert(s.index.size <= 2);
  assert.equal(s.scrollArea.scrollTop, 1700);
  assert.match(s.states.at(-1)!.text, /扫描上限/);
});

test('known summaries update on edits and prepend ordering without growing past the memory cap', (t) => {
  const s = setup(t, 3);
  const initial = s.index.merge([])[0]!;
  s.root.querySelector('[data-user-message-bubble]')!.textContent = 'Edited question';
  s.refresh();
  assert.equal(s.index.size, 1);
  assert.equal(s.index.get(initial.key)!.preview, 'Edited question');
  s.scrollArea.scrollTop = 0; s.render(); s.refresh();
  assert(s.index.merge([])[0]!.position < s.index.get(initial.key)!.position);
  s.scrollArea.scrollTop = 2500; s.render(); s.refresh();
  assert.equal(s.index.size, 3);
  s.index.clear(); assert.equal(s.index.size, 0);
});

test('reading anchor restoration accounts for older turns prepended during a scan', async (t) => {
  const s = setup(t);
  const move = s.scrollArea.scrollTo;
  let prepended = false;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    if (options.top === 0 && !prepended) {
      prepended = true;
      s.model.forEach((item) => { item.top += 400; });
      s.model.unshift({id: 'older', top: 100});
    }
    move(options);
  }) as typeof s.scrollArea.scrollTo;
  await s.history.scan();
  assert.equal(s.scrollArea.scrollTop, 2100); // Same user turn and viewport offset, after the prepend.
  assert.equal(s.index.merge([])[0]!.key, 'message:turn-key:older');
  assert.match(s.states.at(-1)!.text, /已恢复阅读位置/);
});
