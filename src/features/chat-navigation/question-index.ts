import type { IndexedQuestion, Question } from './types.ts';
import { scrollRoot } from './scroll.ts';
import { sameQuestionSnapshot } from './identity.ts';

// Page-memory summaries only: never retain detached DOM in the history index.
export function createQuestionIndex(window: Window, limit = 2000) {
  const entries = new Map<string, IndexedQuestion>();
  let order: string[] = [];
  let previousWindow: string[] = [];
  let previousTop = 0;
  const ordered = () => order.flatMap((key, index) => {
    const entry = entries.get(key); if (!entry) return [];
    entry.order = index + 1; return [entry];
  });
  return {
    restore(saved: readonly IndexedQuestion[]): void {
      const liveOrder = order;
      const restored: string[] = [];
      for (const entry of saved) {
        const known = entries.get(entry.key) ?? [...entries.values()].find((known) => sameQuestionSnapshot(known, entry));
        if (known) { if (!restored.includes(known.key)) restored.push(known.key); continue; }
        if (entries.size >= limit) continue;
        const { positionSample: _sessionGeometry, ...summary } = entry;
        entries.set(entry.key, { ...summary }); restored.push(entry.key);
      }
      // Storage can return after the page has already mounted its last turns.
      // Keep live values, but do not put that tail before the restored history.
      order = restored;
      for (let i = 0; i < liveOrder.length; i++) {
        const key = liveOrder[i]!;
        if (order.includes(key)) continue;
        const before = liveOrder[i - 1];
        const after = liveOrder.slice(i + 1).find((item) => order.includes(item));
        const at = before && order.includes(before) ? order.indexOf(before) + 1
          : after ? order.indexOf(after) : order.length;
        order.splice(at, 0, key);
      }
    },
    merge(mounted: readonly Question[]): IndexedQuestion[] {
      if (!mounted.length) return ordered();
      const container = scrollRoot(mounted[0]!.target, window);
      const top = container?.scrollTop ?? window.scrollY;
      const windowKeys: string[] = [];
      for (const question of mounted) {
        if (!entries.has(question.key) && entries.size >= limit) continue;
        const box = question.message.getBoundingClientRect();
        // Inactive cached panes have no geometry; never replace usable hints with 0.
        if (!box.width) continue;
        const position = box.top - (container?.getBoundingClientRect().top ?? 0) + top;
        const { key, preview, tooltip, searchText, order: ordinal } = question;
        for (const alias of question.identityKeys ?? []) {
          const previous = entries.get(alias);
          if (previous && alias !== key && sameQuestionSnapshot(previous, question)) {
            entries.delete(alias); order = order.map((item) => item === alias ? key : item);
            previousWindow = previousWindow.map((item) => item === alias ? key : item);
          }
        }
        entries.set(key, { key, identityKeys: question.identityKeys ?? [], preview, tooltip, searchText, order: ordinal, position: Math.max(0, position),
          positionSample: { height: container?.scrollHeight ?? question.message.ownerDocument.scrollingElement?.scrollHeight ?? 0,
            width: container?.clientWidth || window.innerWidth } });
        windowKeys.push(key);
      }
      // Native history loading rebases pixels. Preserve known logical order and
      // merge overlapping DOM windows instead of globally sorting cached offsets.
      for (let i = 0; i < windowKeys.length; i++) {
        const key = windowKeys[i]!;
        const before = windowKeys[i - 1];
        const after = windowKeys.slice(i + 1).find((item) => order.includes(item));
        let at = order.indexOf(key);
        if (before && at >= 0 && at < order.indexOf(before)) { order.splice(at, 1); at = -1; }
        if (at >= 0) continue;
        const previous = before ?? (top < previousTop ? undefined : previousWindow.at(-1));
        const next = after ?? (top < previousTop ? previousWindow[0] : undefined);
        const insert = previous && order.includes(previous) ? order.indexOf(previous) + 1
          : next && order.includes(next) ? order.indexOf(next) : top < previousTop ? 0 : order.length;
        order.splice(insert, 0, key);
      }
      if (windowKeys.length) { previousWindow = windowKeys; previousTop = top; }
      return ordered();
    },
    get: (key: string) => {
      if (entries.has(key)) return entries.get(key);
      const matches = [...entries.values()].filter((entry) => entry.identityKeys?.includes(key));
      return matches.length === 1 ? matches[0] : undefined;
    },
    remove(key: string): boolean { order = order.filter((item) => item !== key); return entries.delete(key); },
    get size() { return entries.size; },
    get full() { return entries.size >= limit; },
    clear(): void { entries.clear(); order = []; previousWindow = []; previousTop = 0; },
  };
}
