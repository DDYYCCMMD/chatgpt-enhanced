import type { Question } from './types.ts';
import { isCurrentQuestion } from './discovery.ts';

const managedGestures = new WeakSet<Event>();
export const isManagedScrollGesture = (event: Event): boolean => managedGestures.has(event);

function announceScrollIntent(container: HTMLElement, direction: number): void {
  if (!container.hasAttribute('data-app-action-timeline-scroll')) return;
  const Wheel = container.ownerDocument.defaultView!.WheelEvent;
  const gesture = new Wheel('wheel', { deltaY: (direction || -1) * 80, bubbles: true, cancelable: true, view: container.ownerDocument.defaultView });
  managedGestures.add(gesture);
  container.dispatchEvent(gesture);
}

// The live timeline follows the bottom until its wheel handler sees scroll intent.
// An isolated-world scrollTo alone does not release it and is undone on re-render.
// This standard DOM event has no default scrolling action; scrollTo does the move.
export function moveConversation(window: Window, container: HTMLElement | null, top: number): void {
  const current = container?.scrollTop ?? window.scrollY;
  const next = Math.max(0, Math.min(top, container ? container.scrollHeight - container.clientHeight : Infinity));
  if (container?.hasAttribute('data-app-action-timeline-scroll') && (Math.abs(next - current) > 1 || next === 0)) {
    announceScrollIntent(container, next === 0 ? -1 : Math.sign(next - current));
  }
  if (Math.abs(next - current) < .5) return;
  if (container && typeof container.scrollTo === 'function') container.scrollTo({ top: next, behavior: 'instant' });
  else if (container) container.scrollTop = next;
  else window.scrollTo({ top: next, behavior: 'instant' });
}

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
      if (!target.isConnected || !isCurrentQuestion(question, root)) return false;
      const container = scrollRoot(target, window);
      const viewportTop = container?.getBoundingClientRect().top ?? 0;
      const line = Math.max(viewportTop, getHeaderBottom()) + 16;
      if (container && typeof question.message.scrollIntoView === 'function') {
        announceScrollIntent(container, Math.sign(question.message.getBoundingClientRect().top - line));
        question.message.scrollIntoView({ behavior: 'instant', block: 'start', inline: 'nearest' });
      }
      const top = question.message.getBoundingClientRect().top - line;
      moveConversation(window, container, (container?.scrollTop ?? window.scrollY) + top);
      return true;
    },
    dispose(): void {},
  };
}
