import type { QuestionSummary } from './types.ts';

export function sameQuestionIdentity(a: QuestionSummary, b: QuestionSummary): boolean {
  if (a.key === b.key) return true;
  if (a.key.startsWith('message:id:') && b.key.startsWith('message:id:')) return false;
  const keys = new Set([a.key, ...a.identityKeys ?? []]);
  return [b.key, ...b.identityKeys ?? []].some((key) => /^(message:(id|turn|turn-key):)/.test(key) && keys.has(key));
}
export function sameQuestionSnapshot(a: QuestionSummary, b: QuestionSummary): boolean {
  return sameQuestionIdentity(a, b) && a.tooltip === b.tooltip;
}

// An explicit live anchor is a coordinate hint, never proof of success.
export function findQuestionAnchor(root: HTMLElement, entry: QuestionSummary): HTMLElement | null {
  const keys = new Set([entry.key, ...entry.identityKeys ?? []]);
  const matches = [...root.querySelectorAll<HTMLElement>('[data-message-id],[data-turn-id],[data-turn-key]')].filter((node) =>
    [['data-message-id','id'], ['data-turn-id','turn'], ['data-turn-key','turn-key']].some(([attribute, prefix]) => {
      const value = node.getAttribute(attribute!); return value !== null && keys.has(`message:${prefix}:${value}`);
    }));
  const outer = matches.filter((node) => !matches.some((other) => other !== node && other.contains(node)));
  return outer.length === 1 ? outer[0]! : null;
}
