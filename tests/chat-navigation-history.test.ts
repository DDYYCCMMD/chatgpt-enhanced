import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { createHistoryNavigator } from '../src/features/chat-navigation/history.ts';
import type { HistoryState } from '../src/features/chat-navigation/history.ts';
import { createQuestionIndex } from '../src/features/chat-navigation/question-index.ts';
import { createQuestionDiscovery } from '../src/features/chat-navigation/discovery.ts';
import type { Question } from '../src/features/chat-navigation/types.ts';
import { navigationDom } from './helpers/navigation-dom.ts';
import { createMessageJumper, moveConversation } from '../src/features/chat-navigation/scroll.ts';

function setup(t: TestContext, limit = 2000, maxSteps = 40, timing: { settleMs?: number; stabilityMs?: number; boundaryMs?: number; orderGuide?: boolean; maxDurationMs?: number } = {}) {
  const s = navigationDom();
  const root = s.document.getElementById('thread')!;
  const scope = { root, main: s.document.querySelector('main')! };
  const model: {id: string; top: number; text: string; messageId?: string}[] = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, top: 100 + i * 600, text: 'Duplicate question' }));
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
      const turn = s.document.createElement('div'); turn.dataset.turnKey = item.id; turn.dataset.virtualizedTurn = '';
      const message = s.document.createElement('div'); message.dataset.userMessageBubble = ''; message.textContent = item.text;
      if (item.messageId) message.dataset.messageId = item.messageId;
      turn.append(message); root.append(turn);
      turn.getBoundingClientRect = () => ({ top: 72 + item.top - s.scrollArea.scrollTop, bottom: 172 + item.top - s.scrollArea.scrollTop,
        left: 650, right: 1418, width: 768, height: 100, x: 650, y: 72 + item.top - s.scrollArea.scrollTop, toJSON: () => ({}) });
      message.getBoundingClientRect = turn.getBoundingClientRect;
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
    valid: () => live, mounted: () => mounted, refresh, entry: (key) => index.get(key), entries: () => timing.orderGuide === false ? [] : index.merge([]), count: () => index.size,
    full: () => index.full, resolved: (question) => { assert(question.message.isConnected); resolved.push(question.key); return true; },
    state: (state) => states.push(state), settleMs: 1, stabilityMs: 12, boundaryMs: 8, maxSteps, maxDurationMs: 1000, ...timing,
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

test('fast scan waits for delayed virtualized mounts before moving on', async (t) => {
  const s = setup(t);
  let timer: ReturnType<typeof setTimeout> | undefined;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    s.scrollArea.scrollTop = options.top ?? 0; s.moves.push(s.scrollArea.scrollTop);
    clearTimeout(timer); timer = setTimeout(s.render, 3);
  }) as typeof s.scrollArea.scrollTo;
  t.after(() => clearTimeout(timer));
  await s.history.scan();
  assert.equal(s.index.size, 5);
  assert.equal(s.scrollArea.scrollTop, 1700);
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
  assert.match(s.states.at(-1)!.text, /未找到可验证/);
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
  assert(s.mutations.every((observer) => !observer.observing));
});

test('session geometry relocates a rebased target in one probe without scanning neighbouring viewports', async (t) => {
  const s = setup(t); await s.history.scan();
  s.model.forEach((item) => { item.top += 4000; });
  s.setScrollHeight(7200); s.scrollArea.scrollTop = 5700; s.render(); s.refresh();
  const before = s.moves.length;
  await s.history.seek('message:turn-key:m1');
  assert.deepEqual(s.moves.slice(before), [4684]);
  assert.deepEqual(s.resolved, ['message:turn-key:m1']);
  assert.match(s.states.at(-1)!.text, /已定位/);
});

test('a quiet local top showing later known messages waits for older target loading instead of traversing away', async (t) => {
  const s = setup(t); await s.history.scan();
  const positions = s.model.map((item) => item.top);
  const move = s.scrollArea.scrollTo;
  let started = false; let timer: ReturnType<typeof setTimeout> | undefined;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    if (!started && (options.top ?? 0) < 100) {
      started = true;
      s.model.forEach((item, i) => { item.top = i === 2 ? 100 : 5000 + i * 1000; });
      timer = setTimeout(() => {
        s.model.forEach((item, i) => { item.top = positions[i]!; }); s.render();
      }, 150);
    }
    move(options);
  }) as typeof s.scrollArea.scrollTo;
  t.after(() => clearTimeout(timer));
  await s.history.seek('message:turn-key:m0');
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
  assert.equal(s.scrollArea.scrollTop, 84);
  assert.match(s.states.at(-1)!.text, /已定位/);
});

test('an incorrect end-distance probe falls back to original coordinates and never selects a neighbour', async (t) => {
  const s = setup(t); await s.history.scan();
  s.setScrollHeight(7200); s.refresh(); // New content below, not a prefix rebase.
  const before = s.moves.length;
  await s.history.seek('message:turn-key:m1');
  assert.deepEqual(s.moves.slice(before), [4684, 684]);
  assert.deepEqual(s.resolved, ['message:turn-key:m1']);
  assert.equal(s.scrollArea.scrollTop, 684);
});

test('resizing invalidates session projection and restored summaries never retain old layout samples', async (t) => {
  const s = setup(t); await s.history.scan();
  const saved = s.index.merge([]).map((entry) => ({ ...entry }));
  s.setScrollHeight(7200);
  Object.defineProperty(s.window, 'innerWidth', { value: 1600, writable: true });
  s.refresh();
  const before = s.moves.length;
  await s.history.seek('message:turn-key:m1');
  assert.deepEqual(s.moves.slice(before), [684]);
  s.index.clear(); s.index.restore(saved);
  assert(s.index.merge([]).every((entry) => entry.positionSample === undefined));
});

test('exact target mounting wakes the waiter before its timed poll and disposes the readiness observer', async (t) => {
  const s = setup(t, 2000, 40, { settleMs: 120, stabilityMs: 20 });
  s.scrollArea.scrollTop = 600; s.render(); s.refresh();
  s.scrollArea.scrollTop = 1700; s.render(); s.refresh();
  let timer: ReturnType<typeof setTimeout> | undefined;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    s.scrollArea.scrollTop = options.top ?? 0; s.moves.push(s.scrollArea.scrollTop);
    clearTimeout(timer); timer = setTimeout(s.render, 10);
  }) as typeof s.scrollArea.scrollTo;
  t.after(() => clearTimeout(timer));
  const nativeTimeout = s.window.setTimeout.bind(s.window);
  let timedPollsBeforeMatch = 0;
  s.window.setTimeout = ((callback: TimerHandler, delay?: number) => nativeTimeout(() => {
    if (delay === 120 && !s.resolved.length) timedPollsBeforeMatch++;
    if (typeof callback === 'function') callback();
  }, delay)) as typeof s.window.setTimeout;
  await s.history.seek('message:turn-key:m1');
  assert.deepEqual(s.resolved, ['message:turn-key:m1']);
  assert.equal(timedPollsBeforeMatch, 0);
  assert(s.mutations.every((observer) => !observer.observing));
});

test('early readiness does not declare success before an 800ms snap-back and revalidates the exact target', async (t) => {
  const s = setup(t, 2000, 40, { settleMs: 20, stabilityMs: 1000, maxDurationMs: 4000 });
  s.scrollArea.scrollTop = 600; s.render(); s.refresh();
  s.scrollArea.scrollTop = 1700; s.render(); s.refresh();
  const move = s.scrollArea.scrollTo;
  let timer: ReturnType<typeof setTimeout> | undefined; let scheduled = false;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    move(options);
    if (!scheduled) {
      scheduled = true;
      timer = setTimeout(() => {
        assert.equal(s.states.at(-1)!.busy, true);
        s.scrollArea.scrollTop = 1700; s.render();
      }, 800);
    }
  }) as typeof s.scrollArea.scrollTo;
  t.after(() => clearTimeout(timer));
  await s.history.seek('message:turn-key:m1');
  assert(s.resolved.length >= 2);
  assert(s.resolved.every((key) => key === 'message:turn-key:m1'));
  assert.equal(s.scrollArea.scrollTop, 684);
  assert.match(s.states.at(-1)!.text, /已定位/);
});

test('rapid requests finish the old guard and execute only the latest queued destination', async (t) => {
  const s = setup(t); await s.history.scan();
  const first = s.history.seek('message:turn-key:m3');
  const second = s.history.seek('message:turn-key:m1');
  const latest = s.history.seek('message:turn-key:m4');
  await Promise.all([first, second, latest]);
  assert.deepEqual(s.resolved, ['message:turn-key:m3', 'message:turn-key:m4']);
  assert.equal(s.scrollArea.scrollTop, 2484);
  assert.equal(s.history.canSeek, false);
  const moves = s.moves.length;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(s.moves.length, moves);
  assert(s.mutations.every((observer) => !observer.observing));
});

test('manual takeover and disposal invalidate queued seeks before they can move the page', async (t) => {
  const s = setup(t); await s.history.scan();
  const first = s.history.seek('message:turn-key:m3');
  const queued = s.history.seek('message:turn-key:m1');
  s.scrollArea.scrollTop = 800; s.render();
  s.window.dispatchEvent(new s.dom.window.WheelEvent('wheel'));
  await Promise.all([first, queued]);
  assert.deepEqual(s.resolved, ['message:turn-key:m3']);
  assert.equal(s.scrollArea.scrollTop, 800);
  s.resolved.length = 0;
  const active = s.history.seek('message:turn-key:m1');
  const pending = s.history.seek('message:turn-key:m4');
  s.history.dispose();
  const moves = s.moves.length;
  await Promise.all([active, pending]);
  assert(!s.resolved.includes('message:turn-key:m4'));
  assert.equal(s.moves.length, moves);
  assert.equal(s.history.busy, false);
});

test('a queued click keeps its original preview snapshot when the target is edited during handoff', async (t) => {
  const s = setup(t); await s.history.scan();
  const first = s.history.seek('message:turn-key:m3');
  const queued = s.history.seek('message:turn-key:m1');
  s.model[1]!.text = 'Edited after the click was queued';
  await Promise.all([first, queued]);
  assert.deepEqual(s.resolved, ['message:turn-key:m3']);
  assert.match(s.states.at(-1)!.text, /预览已变化/);
  assert.equal(s.scrollArea.scrollTop, 1884);
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
      s.model.unshift({id: 'older', top: 100, text: 'Older question'});
    }
    move(options);
  }) as typeof s.scrollArea.scrollTo;
  await s.history.scan();
  assert.equal(s.scrollArea.scrollTop, 2100); // Same user turn and viewport offset, after the prepend.
  assert.equal(s.index.merge([])[0]!.key, 'message:turn-key:older');
  assert.match(s.states.at(-1)!.text, /已恢复阅读位置/);
});

test('reused turn keys with different content cannot resolve a cached click to the wrong question', async (t) => {
  const s = setup(t); await s.history.scan();
  s.model[0]!.text = 'Different question occupying the same virtual slot';
  await s.history.seek('message:turn-key:m0');
  assert.deepEqual(s.resolved, []);
  assert.equal(s.scrollArea.scrollTop, 1700);
  assert.match(s.states.at(-1)!.text, /预览已变化/);
});

test('turn-key cache entries still resolve after remount promotes the same message to a message ID', async (t) => {
  const s = setup(t); await s.history.scan();
  s.model[0]!.messageId = 'real-message-id';
  await s.history.seek('message:turn-key:m0');
  assert.deepEqual(s.resolved, ['message:id:real-message-id']);
  assert.equal(s.index.size, 5);
  assert.equal(s.index.get('message:turn-key:m0')!.key, 'message:id:real-message-id');
  assert.match(s.states.at(-1)!.text, /已定位/);
});

test('stale pixel offsets fall back to overlapping traversal and an exact identity', async (t) => {
  const s = setup(t); await s.history.scan();
  for (const entry of s.index.merge([])) entry.position *= .05;
  await s.history.seek('message:turn-key:m4');
  assert.deepEqual(s.resolved, ['message:turn-key:m4']);
  assert.match(s.states.at(-1)!.text, /已定位/);
  assert(s.states.some((state) => state.text.includes('正在加载并定位原消息')));
});

test('timeline scroll intent releases follow-bottom without cancelling its own navigation', async (t) => {
  const s = setup(t); await s.history.scan();
  s.scrollArea.setAttribute('data-app-action-timeline-scroll', '');
  let intent = false; let gestures = 0;
  s.scrollArea.addEventListener('wheel', () => { intent = true; gestures++; });
  const move = s.scrollArea.scrollTo;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    move(options);
    if (!intent) { s.scrollArea.scrollTop = 1700; s.render(); }
  }) as typeof s.scrollArea.scrollTo;
  await s.history.seek('message:turn-key:m0');
  assert(gestures > 0);
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
  assert.equal(s.scrollArea.scrollTop, 84);
  assert.match(s.states.at(-1)!.text, /已定位历史问题/);
});

test('an already-zero rebased timeline still receives upward intent to load earlier history', (t) => {
  const s = setup(t);
  s.scrollArea.setAttribute('data-app-action-timeline-scroll', '');
  s.scrollArea.scrollTop = 0;
  const deltas: number[] = [];
  s.scrollArea.addEventListener('wheel', (event) => deltas.push((event as WheelEvent).deltaY));
  moveConversation(s.window, s.scrollArea, 0);
  moveConversation(s.window, s.scrollArea, 0);
  assert.deepEqual(deltas, [-80, -80]);
  assert.equal(s.scrollArea.scrollTop, 0);
});

test('native element anchoring uses the user bubble rather than the outer virtual turn and retains header clearance', (t) => {
  const s = navigationDom(); t.after(() => s.dom.window.close());
  const root = s.document.getElementById('thread')!;
  const question = createQuestionDiscovery().collect({ root, main: s.document.querySelector('main')! })
    .find((question) => question.message.id === 'user-2')!;
  question.message.getBoundingClientRect = () => ({ top: 600 - s.scrollArea.scrollTop, bottom: 700 - s.scrollArea.scrollTop,
    left: 1000, right: 1400, width: 400, height: 100, x: 1000, y: 600 - s.scrollArea.scrollTop, toJSON: () => ({}) });
  let nativeAnchors = 0;
  question.message.scrollIntoView = (options) => {
    assert.deepEqual(options, { behavior: 'instant', block: 'start', inline: 'nearest' });
    nativeAnchors++; s.scrollArea.scrollTop = 528;
  };
  const jumper = createMessageJumper(s.window, root, () => 56);
  assert(jumper.jump(question));
  assert.equal(nativeAnchors, 1);
  assert.equal(s.scrollArea.scrollTop, 512);
});

test('a requested message mounting during top loading is anchored before boundary settling can lose it', async (t) => {
  const s = setup(t, 2000, 40, { boundaryMs: 50, orderGuide: false }); await s.history.scan();
  s.index.get('message:turn-key:m0')!.position = 2500;
  const move = s.scrollArea.scrollTo;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduled = false;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    move(options);
    if (options.top === 0 && !scheduled) {
      scheduled = true;
      timer = setTimeout(() => {
        if (!s.resolved.includes('message:turn-key:m0')) {
          s.model.splice(0, 1); s.render();
        }
      }, 8);
    }
  }) as typeof s.scrollArea.scrollTo;
  t.after(() => clearTimeout(timer));
  await s.history.seek('message:turn-key:m0');
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
  assert.equal(s.scrollArea.scrollTop, 84);
});

test('a later prepend is realigned by message identity before declaring the destination stable', async (t) => {
  const s = setup(t, 2000, 40, { stabilityMs: 50 }); await s.history.scan();
  const move = s.scrollArea.scrollTo;
  let shifted = false; let timer: ReturnType<typeof setTimeout> | undefined;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    move(options);
    if (!shifted) {
      shifted = true;
      timer = setTimeout(() => { s.model.forEach((item) => { item.top += 350; }); s.render(); }, 10);
    }
  }) as typeof s.scrollArea.scrollTo;
  t.after(() => clearTimeout(timer));
  await s.history.seek('message:turn-key:m0');
  assert.equal(s.scrollArea.scrollTop, 434);
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
  assert.match(s.states.at(-1)!.text, /已定位历史问题/);
});

test('rebased cached pixels never reorder an already established chronological index', async (t) => {
  const s = setup(t); await s.history.scan();
  const keys = s.index.merge([]).map((entry) => entry.key);
  for (const [i, entry] of s.index.merge([]).entries()) entry.position = (5 - i) * 10;
  s.refresh();
  assert.deepEqual(s.index.merge([]).map((entry) => entry.key), keys);
});

test('a late backup read restores chronology around an already mounted tail without replacing live previews', async (t) => {
  const s = setup(t); await s.history.scan();
  const saved = s.index.merge([]).map((entry) => ({ ...entry }));
  s.index.clear();
  s.scrollArea.scrollTop = 2500; s.render(); s.refresh();
  const tail = s.index.merge([])[0]!;
  tail.preview = 'Current live preview';
  s.index.restore(saved);
  assert.deepEqual(s.index.merge([]).map((entry) => entry.key), saved.map((entry) => entry.key));
  assert.equal(s.index.get(tail.key)!.preview, 'Current live preview');
});

test('a remount taking longer than the former ten-poll limit can finish without bouncing back', async (t) => {
  const s = setup(t); await s.history.scan();
  let timer: ReturnType<typeof setTimeout> | undefined;
  s.scrollArea.scrollTo = ((options: ScrollToOptions) => {
    s.scrollArea.scrollTop = options.top ?? 0; s.moves.push(s.scrollArea.scrollTop);
    clearTimeout(timer); timer = setTimeout(s.render, 24);
  }) as typeof s.scrollArea.scrollTo;
  t.after(() => clearTimeout(timer));
  await s.history.seek('message:turn-key:m0');
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
  assert.match(s.states.at(-1)!.text, /已定位/);
});

test('a surviving keyed placeholder supplies live geometry instead of stale saved pixels', async (t) => {
  const s = setup(t); await s.history.scan();
  s.model[0]!.top = 2100;
  const placeholder = s.document.createElement('div'); placeholder.dataset.turnKey = 'm0'; s.root.append(placeholder);
  placeholder.getBoundingClientRect = () => ({top:72+2100-s.scrollArea.scrollTop,bottom:172+2100-s.scrollArea.scrollTop,
    left:650,right:1418,width:768,height:100,x:650,y:72+2100-s.scrollArea.scrollTop,toJSON:()=>({})});
  const before = s.moves.length;
  await s.history.seek('message:turn-key:m0');
  assert.equal(s.moves[before], 2084);
  assert.deepEqual(s.resolved, ['message:turn-key:m0']);
});

test('two conflicting message IDs cannot be merged by a shared turn alias or duplicate preview', async (t) => {
  const s = setup(t); s.model[0]!.messageId = 'original-id'; await s.history.scan();
  s.model[0]!.messageId = 'different-id';
  await s.history.seek('message:id:original-id');
  assert.deepEqual(s.resolved, []);
  assert.match(s.states.at(-1)!.text, /定位失败/);
});
