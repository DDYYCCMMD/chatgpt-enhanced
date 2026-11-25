import type { IndexedQuestion, Question } from './types.ts';
import { scrollRoot } from './scroll.ts';

// Page-memory summaries only: never retain detached DOM in the history index.
export function createQuestionIndex(window: Window, limit = 2000) {
  const entries = new Map<string, IndexedQuestion>();
  return {
    merge(mounted: readonly Question[]): IndexedQuestion[] {
      for (const question of mounted) {
        if (!entries.has(question.key) && entries.size >= limit) continue;
        const container = scrollRoot(question.target, window);
        const position = question.target.getBoundingClientRect().top
          - (container?.getBoundingClientRect().top ?? 0) + (container?.scrollTop ?? window.scrollY);
        const { key, preview, tooltip, searchText, order } = question;
        entries.set(key, { key, preview, tooltip, searchText, order, position: Math.max(0, position) });
      }
      const sorted = [...entries.values()].sort((a, b) => a.position - b.position);
      sorted.forEach((question, index) => { question.order = index + 1; });
      return sorted;
    },
    get: (key: string) => entries.get(key),
    remove: (key: string) => entries.delete(key),
    get size() { return entries.size; },
    get full() { return entries.size >= limit; },
    clear: () => entries.clear(),
  };
}
