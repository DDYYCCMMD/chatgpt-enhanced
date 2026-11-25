import type { Question } from './types.ts';

export function scrollRoot(element: HTMLElement, window: Window): HTMLElement | null {
  for (let parent = element.parentElement; parent && parent !== element.ownerDocument.body; parent = parent.parentElement) {
    const overflow = window.getComputedStyle(parent).overflowY;
    if (/auto|scroll/.test(overflow) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}

export function createMessageJumper(window: Window, root: HTMLElement, getHeaderBottom: () => number) {
  return {
    jump(question: Question): boolean {
      const target = question.target;
      if (!target.isConnected || !question.message.isConnected || !root.contains(target)) return false;
      const container = scrollRoot(target, window);
      const viewportTop = container?.getBoundingClientRect().top ?? 0;
      const top = target.getBoundingClientRect().top - Math.max(viewportTop, getHeaderBottom()) - 16;
      if (container && typeof container.scrollTo === 'function') {
        container.scrollTo({ top: container.scrollTop + top, behavior: 'instant' });
      } else if (!container && typeof window.scrollTo === 'function') {
        window.scrollTo({ top: window.scrollY + top, behavior: 'instant' });
      } else if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
      }
      return true;
    },
    dispose(): void {},
  };
}
