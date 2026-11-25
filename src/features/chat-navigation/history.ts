import type { IndexedQuestion, Question } from './types.ts';
import { scrollRoot } from './scroll.ts';

export interface HistoryState { busy: boolean; text: string }
interface Options {
  valid(): boolean;
  mounted(): readonly Question[];
  refresh(): void;
  entry(key: string): IndexedQuestion | undefined;
  count(): number;
  full(): boolean;
  resolved(question: Question): boolean;
  headerBottom?(): number;
  state(value: HistoryState): void;
  settleMs?: number;
  maxSteps?: number;
  maxDurationMs?: number;
}

export function createHistoryNavigator(window: Window, root: HTMLElement, options: Options) {
  let disposed = false;
  let running: { cancelled: boolean; restore: boolean; wake: (() => void) | undefined } | null = null;
  const valid = () => !disposed && root.isConnected && options.valid();
  function surface() {
    const target = options.mounted()[0]?.target ?? root.querySelector<HTMLElement>('[data-virtualized-turn]') ?? root;
    const element = scrollRoot(target, window);
    return {
      top: () => element?.scrollTop ?? window.scrollY,
      height: () => element?.scrollHeight ?? root.ownerDocument.scrollingElement?.scrollHeight ?? 0,
      viewport: () => element?.clientHeight ?? window.innerHeight,
      edge: () => element?.getBoundingClientRect().top ?? 0,
      move(top: number): void {
        const clamped = Math.max(0, Math.min(top, this.height() - this.viewport()));
        if (element && typeof element.scrollTo === 'function') element.scrollTo({ top: clamped, behavior: 'instant' });
        else if (element) element.scrollTop = clamped;
        else window.scrollTo({ top: clamped, behavior: 'instant' });
      },
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
    const view = surface();
    const startTop = view.top();
    const savedAnchor = (() => {
      const anchor = [...options.mounted()].sort((a, b) => Math.abs(a.target.getBoundingClientRect().top - view.edge())
        - Math.abs(b.target.getBoundingClientRect().top - view.edge()))[0];
      return anchor ? { key: anchor.key, offset: anchor.target.getBoundingClientRect().top - view.edge() } : null;
    })();
    let success = false;
    let limited = false;
    let restoredExactly = false;
    const started = Date.now();
    const settle = options.settleMs ?? 300;
    async function wait(force = false, delay = settle): Promise<boolean> {
      if (!valid() || (!force && job.cancelled)) return false;
      await new Promise<void>((resolve) => {
        const finish = () => { window.clearTimeout(timer); job.wake = undefined; resolve(); };
        const timer = window.setTimeout(finish, delay); job.wake = finish;
      });
      if (!valid() || (!force && job.cancelled)) return false;
      options.refresh(); return valid();
    }
    const interrupted = (event: Event): void => {
      if (event.composedPath().some((node) => node instanceof root.ownerDocument.defaultView!.Element && node.hasAttribute('data-cge-question-navigation'))) return;
      if (event.type === 'keydown' && !['Escape', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes((event as KeyboardEvent).key)) return;
      // A deliberate page gesture takes over; never drag the user back afterwards.
      cancel(false);
    };
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(type, interrupted, { capture: true, passive: true });
    options.state({ busy: true, text: kind === 'scan' ? '正在扫描历史问题…' : '正在定位历史问题…' });
    try {
      if (kind === 'scan') {
        let previousHeight = -1; let stable = 0;
        // Give ChatGPT a bounded opportunity to mount older history at its top.
        for (let attempt = 0; attempt < 8 && stable < 2; attempt++) {
          view.move(0); if (!await wait()) break;
          const height = view.height(); stable = height === previousHeight ? stable + 1 : 0; previousHeight = height;
        }
        stable = 0;
        for (let step = 0; valid() && !job.cancelled; step++) {
          if (step >= (options.maxSteps ?? 160) || Date.now() - started > (options.maxDurationMs ?? 60000) || options.full()) { limited = true; break; }
          options.state({ busy: true, text: `正在扫描 · 已识别 ${options.count()} 条` });
          const top = view.top(); const height = view.height();
          const atBottom = top >= height - view.viewport() - 2;
          view.move(atBottom ? top : top + Math.max(160, view.viewport() * .7));
          if (!await wait()) break;
          stable = atBottom && height === view.height() ? stable + 1 : 0;
          if (stable >= 3) { success = true; break; }
        }
      } else {
        const entry = key ? options.entry(key) : undefined;
        if (entry) {
          const clearance = Math.max(view.edge(), options.headerBottom?.() ?? 56) + 16 - view.edge();
          view.move(entry.position - clearance);
          // Wait in place for virtualization; never walk through neighbouring turns.
          for (let attempt = 0; attempt < 10; attempt++) {
            if (!await wait(false, options.settleMs ?? 50)) break;
            const target = options.mounted().find((question) => question.key === key);
            if (target && options.resolved(target)) { success = true; break; }
          }
        }
      }
    } catch {
      // Fixed UI status only; never log content, identifiers or errors from the page.
      limited = true;
    } finally {
      if (valid() && job.restore && (kind === 'scan' || !success)) {
        options.state({ busy: true, text: '正在恢复阅读位置…' });
        const position = savedAnchor ? options.entry(savedAnchor.key)?.position : undefined;
        view.move(position === undefined ? startTop : position - savedAnchor!.offset);
        if (await wait(true) && job.restore) {
          const current = savedAnchor ? options.mounted().find((question) => question.key === savedAnchor.key) : null;
          if (current) {
            view.move(view.top() + current.target.getBoundingClientRect().top - view.edge() - savedAnchor!.offset);
            restoredExactly = true;
            await wait(true);
          }
        }
      }
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(type, interrupted, true);
      if (running === job) running = null;
      if (valid()) {
        const ending = job.cancelled ? '已停止' : kind === 'seek' ? success ? '已定位历史问题' : '该问题尚未重新渲染，请重新扫描' : limited ? '已达扫描上限，可稍后继续扫描' : success ? '本轮扫描结束' : '扫描未完成';
        const restoreText = job.restore && kind === 'scan' ? restoredExactly ? ' · 已恢复阅读位置' : ' · 已返回原位置附近' : '';
        options.state({ busy: false, text: `${ending}${restoreText} · 已识别 ${options.count()} 条` });
      }
    }
  }
  return {
    scan: () => operate('scan'),
    seek: (key: string) => operate('seek', key),
    cancel,
    get busy() { return running !== null; },
    dispose(): void { disposed = true; cancel(false); },
  };
}
