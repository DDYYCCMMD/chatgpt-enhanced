import type { IndexedQuestion, Question } from './types.ts';
import { isManagedScrollGesture, moveConversation, scrollRoot } from './scroll.ts';
import { findQuestionAnchor, sameQuestionIdentity, sameQuestionSnapshot } from './identity.ts';

export interface HistoryState { busy: boolean; text: string }
interface Options {
  valid(): boolean;
  mounted(): readonly Question[];
  refresh(): void;
  entry(key: string): IndexedQuestion | undefined;
  entries?(): readonly IndexedQuestion[];
  count(): number;
  full(): boolean;
  resolved(question: Question): boolean;
  headerBottom?(): number;
  state(value: HistoryState): void;
  settleMs?: number;
  stabilityMs?: number;
  boundaryMs?: number;
  maxSteps?: number;
  maxDurationMs?: number;
}

export function createHistoryNavigator(window: Window, root: HTMLElement, options: Options) {
  let disposed = false;
  let running: { cancelled: boolean; restore: boolean; wake: (() => void) | undefined } | null = null;
  const valid = () => !disposed && root.isConnected && options.valid();
  function surface() {
    const seed = options.mounted()[0]?.target ?? root.querySelector<HTMLElement>('[data-virtualized-turn]') ?? root;
    const element = scrollRoot(seed, window);
    return {
      top: () => element?.scrollTop ?? window.scrollY,
      height: () => element?.scrollHeight ?? root.ownerDocument.scrollingElement?.scrollHeight ?? 0,
      viewport: () => element?.clientHeight ?? window.innerHeight,
      edge: () => element?.getBoundingClientRect().top ?? 0,
      move: (top: number) => moveConversation(window, element, top),
    };
  }
  function cancel(restore = true): void {
    if (!running) return;
    running.cancelled = true; running.restore = restore; running.wake?.();
  }
  async function operate(kind: 'scan' | 'seek', key?: string): Promise<void> {
    if (running || !valid()) return;
    const job = { cancelled: false, restore: true, wake: undefined as (() => void) | undefined };
    running = job;
    const requested = kind === 'seek' && key ? options.entry(key) : undefined;
    const view = surface();
    const startTop = view.top();
    const savedAnchor = (() => {
      const question = [...options.mounted()].sort((a, b) => Math.abs(a.message.getBoundingClientRect().top - view.edge())
        - Math.abs(b.message.getBoundingClientRect().top - view.edge()))[0];
      const entry = question ? options.entry(question.key) : undefined;
      return question && entry ? { entry: { ...entry }, offset: question.message.getBoundingClientRect().top - view.edge() } : null;
    })();
    let success = false; let limited = false; let restoredExactly = false;
    let alignmentFailure = ''; let sightings = 0;
    let identityChanged = false; let observed = 0; let identityCandidates = 0; let snapshotMatches = 0;
    const settle = options.settleMs ?? 120;
    const stability = options.stabilityMs ?? 1200;
    const boundary = options.boundaryMs ?? 800;
    const allowed = (restoring = false) => valid() && (restoring ? job.restore : !job.cancelled);
    const signature = () => `${view.height()}:${options.mounted().map((question) => question.key).join('\n')}`;
    async function wait(restoring = false): Promise<boolean> {
      if (!allowed(restoring)) return false;
      await new Promise<void>((resolve) => {
        const finish = () => { window.clearTimeout(timer); job.wake = undefined; resolve(); };
        const timer = window.setTimeout(finish, settle); job.wake = finish;
      });
      if (!allowed(restoring)) return false;
      options.refresh(); return allowed(restoring);
    }
    async function waitForRender(previous: string, restoring = false): Promise<boolean> {
      const deadline = Date.now() + Math.max(40, settle);
      do {
        if (!await wait(restoring)) return false;
        if (signature() !== previous) return true;
      } while (Date.now() < deadline);
      return allowed(restoring);
    }
    const interrupted = (event: Event): void => {
      if (isManagedScrollGesture(event)) return;
      if (event.composedPath().some((node) => node instanceof root.ownerDocument.defaultView!.Element && node.hasAttribute('data-cge-question-navigation'))) return;
      if (event.type === 'keydown' && !['Escape', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes((event as KeyboardEvent).key)) return;
      cancel(false);
    };
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(type, interrupted, { capture: true, passive: true });
    options.state({ busy: true, text: kind === 'scan' ? '正在扫描历史问题…' : '正在定位历史问题…' });

    function match(entry: IndexedQuestion): Question | undefined {
      const candidates = options.mounted().filter((question) => sameQuestionIdentity(question, entry));
      const matches = candidates.filter((question) => sameQuestionSnapshot(question, entry));
      observed = options.mounted().length; identityCandidates = candidates.length; snapshotMatches = matches.length;
      if (candidates.length && !matches.length) identityChanged = true;
      return matches.length === 1 ? matches[0] : undefined;
    }
    // Loading older turns can prepend/rebase the native scroll range. Re-read the
    // actual message after every render; a saved pixel offset is never a result.
    async function align(entry: IndexedQuestion, offset: number, restoring: boolean): Promise<boolean> {
      const initial = match(entry);
      if (!initial) return false;
      if (!restoring) sightings++;
      if (!restoring && !options.resolved(initial)) { alignmentFailure = '目标节点校验未通过'; return false; }
      let stableSince = Date.now();
      const deadline = Date.now() + stability + Math.max(1200, settle * 40);
      while (allowed(restoring) && Date.now() <= deadline) {
        const question = match(entry);
        if (!question) { if (!restoring) alignmentFailure = '校正期间目标被卸载'; return false; }
        const delta = question.message.getBoundingClientRect().top - view.edge() - offset;
        const destination = Math.max(0, Math.min(view.top() + delta, view.height() - view.viewport()));
        if (Math.abs(destination - view.top()) > 2) {
          view.move(destination); stableSince = Date.now();
        }
        if (Date.now() - stableSince >= stability) return true;
        if (!await wait(restoring)) return false;
      }
      if (!restoring && allowed()) alignmentFailure = '目标位置持续变化';
      return false;
    }
    async function reachStart(restoring = false, budget = Infinity, entry?: IndexedQuestion, offset = 0): Promise<'found' | 'top' | 'failed'> {
      let previous = ''; let stableSince = Date.now();
      const deadline = Math.min(budget, Date.now() + Math.max(8000, boundary * 8));
      while (allowed(restoring) && Date.now() < deadline) {
        view.move(0);
        if (!await wait(restoring)) return 'failed';
        // A requested message may mount only briefly during native rebasing.
        // Anchor it immediately rather than waiting for the whole top to settle.
        if (entry && match(entry) && await align(entry, offset, restoring)) return 'found';
        const current = signature();
        if (current !== previous || view.top() > 2) stableSince = Date.now();
        previous = current;
        if (Date.now() - stableSince >= boundary) return 'top';
      }
      return 'failed';
    }
    // A short, overlapping native traversal is the fallback when virtualized
    // history has changed its coordinate origin. No binary search of stale pixels.
    async function traverse(entry?: IndexedQuestion, offset = 0, restoring = false, direction = 1, deadline = Infinity): Promise<boolean> {
      const started = Date.now();
      const duration = options.maxDurationMs ?? (entry ? 30000 : 60000);
      let bottomSince = Date.now(); let previous = '';
      for (let step = 0; allowed(restoring); step++) {
        if (step >= (options.maxSteps ?? 240) || Date.now() > deadline || Date.now() - started > duration || (!entry && options.full())) { limited = true; return false; }
        if (entry && match(entry) && await align(entry, offset, restoring)) return true;
        if (entry && identityChanged && !restoring) return false;
        const current = signature();
        const atBoundary = direction < 0 ? view.top() <= 2 : view.top() >= view.height() - view.viewport() - 2;
        if (!atBoundary || current !== previous) bottomSince = Date.now();
        previous = current;
        if (atBoundary && Date.now() - bottomSince >= boundary) return !entry;
        if (!restoring) options.state({ busy: true, text: entry ? '正在加载并定位原消息…' : `正在扫描 · 已识别 ${options.count()} 条` });
        if (!atBoundary || direction < 0) view.move(view.top() + direction * Math.max(120, view.viewport() * .8));
        if (!await waitForRender(current, restoring)) return false;
      }
      return false;
    }
    async function locate(entry: IndexedQuestion, offset: number, restoring = false): Promise<boolean> {
      const deadline = Date.now() + (options.maxDurationMs ?? 30000);
      if (match(entry) && await align(entry, offset, restoring)) return true;
      if (!allowed(restoring) || (!restoring && identityChanged)) return false;
      const anchor = findQuestionAnchor(root, entry);
      const position = options.entry(entry.key)?.position ?? entry.position;
      view.move(anchor && anchor.getBoundingClientRect().width > 0
        ? view.top() + anchor.getBoundingClientRect().top - view.edge() - offset : position - offset);
      const hintDeadline = Date.now() + Math.max(40, settle * 4);
      for (let attempt = 0; attempt < 40 && Date.now() <= hintDeadline; attempt++) {
        if (!await wait(restoring)) return false;
        if (match(entry) && await align(entry, offset, restoring)) return true;
        if (!restoring && identityChanged) return false;
      }
      const records = options.entries?.() ?? [];
      const rank = records.findIndex((record) => sameQuestionSnapshot(record, entry));
      const ranks = options.mounted().flatMap((question) => {
        const at = records.findIndex((record) => sameQuestionSnapshot(record, question));
        return at < 0 ? [] : [at];
      });
      if (rank >= 0 && ranks.length) {
        const direction = rank < Math.min(...ranks) ? -1 : rank > Math.max(...ranks) ? 1 : 0;
        if (direction && await traverse(entry, offset, restoring, direction, deadline)) return true;
      }
      const start = await reachStart(restoring, deadline, entry, offset);
      if (start === 'found') return true;
      if (start === 'failed') return false;
      return traverse(entry, offset, restoring, 1, deadline);
    }
    try {
      if (kind === 'scan') {
        if (await reachStart() === 'top') success = await traverse();
      } else if (requested) {
        const offset = Math.max(view.edge(), options.headerBottom?.() ?? 56) + 16 - view.edge();
        success = await locate({ ...requested }, offset);
      }
    } catch {
      limited = true;
    } finally {
      const failedIdentityChanged = identityChanged;
      const seekDiagnostic = `（挂载 ${observed} 条，标识候选 ${identityCandidates} 条，预览匹配 ${snapshotMatches} 条，目标出现 ${sightings} 次${alignmentFailure ? `，${alignmentFailure}` : ''}）`;
      if (valid() && job.restore && (kind === 'scan' || !success)) {
        options.state({ busy: true, text: '正在恢复阅读位置…' });
        try {
          if (savedAnchor) restoredExactly = await locate(savedAnchor.entry, savedAnchor.offset, true);
          if (!restoredExactly && allowed(true)) { view.move(startTop); await wait(true); }
        } catch { /* Scope may have disappeared while restoring. */ }
      }
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(type, interrupted, true);
      if (running === job) running = null;
      if (valid()) {
        const failure = failedIdentityChanged ? '定位失败：该标识对应的预览已变化' : '定位失败：未找到可验证的原消息';
        const returned = restoredExactly ? '，已恢复阅读位置' : '，已返回原位置附近';
        const ending = job.cancelled ? '已停止' : kind === 'seek' ? success ? '已定位历史问题' : failure + returned : limited ? '已达扫描上限，可稍后继续扫描' : success ? '本轮扫描结束' : '扫描未完成';
        const restoreText = job.restore && kind === 'scan' ? restoredExactly ? ' · 已恢复阅读位置' : ' · 已返回原位置附近' : '';
        const diagnostic = kind === 'seek' && !success && !job.cancelled ? seekDiagnostic : '';
        options.state({ busy: false, text: `${ending}${diagnostic}${restoreText} · 已识别 ${options.count()} 条` });
      }
    }
  }
  return {
    scan: () => operate('scan'), seek: (key: string) => operate('seek', key), cancel,
    get busy() { return running !== null; },
    dispose(): void { disposed = true; cancel(false); },
  };
}
