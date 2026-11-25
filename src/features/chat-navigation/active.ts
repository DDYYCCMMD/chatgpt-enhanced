import type { Question } from './types.ts';
import { scrollRoot } from './scroll.ts';

export function activeQuestion(questions: readonly Question[], line: number): string | null {
  let candidate: string | null = questions[0]?.key ?? null;
  for (const question of questions) {
    if (!question.target.isConnected) continue;
    if (question.target.getBoundingClientRect().top <= line) candidate = question.key;
    else break;
  }
  return candidate;
}

export function createActiveTracker(document: Document, window: Window, getLine: () => number, onActive: (key: string | null) => void) {
  let questions: readonly Question[] = [];
  let observer: IntersectionObserver | undefined;
  let holdTimer: number | undefined;
  let held = false;
  let disposed = false;
  function update(): void { if (!held && !disposed) onActive(activeQuestion(questions, getLine())); }
  return {
    setQuestions(next: readonly Question[]): void {
      observer?.disconnect();
      questions = next;
      const Observer = document.defaultView?.IntersectionObserver;
      if (Observer && next.length) {
        observer = new Observer(update, { root: scrollRoot(next[0]!.target, window), rootMargin: '-72px 0px -50% 0px', threshold: [0, 1] });
        for (const question of next) observer.observe(question.target);
        update();
      }
    },
    select(key: string): void {
      held = true; onActive(key); window.clearTimeout(holdTimer);
      // Allow native intersection delivery to catch up after an instantaneous jump.
      holdTimer = window.setTimeout(() => { held = false; update(); }, 80);
    },
    dispose(): void {
      disposed = true; observer?.disconnect(); window.clearTimeout(holdTimer); questions = [];
    },
  };
}
