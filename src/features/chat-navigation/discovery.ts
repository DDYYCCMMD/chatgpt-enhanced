import { questionPreview } from './preview.ts';
import type { ConversationScope, Question } from './types.ts';

const AUTHOR_USER_SELECTOR = '[data-message-author-role="user"]';
const USER_BUBBLE_SELECTOR = '[data-user-message-bubble]';
export const USER_MESSAGE_SELECTOR = `${AUTHOR_USER_SELECTOR}, ${USER_BUBBLE_SELECTOR}`;
const TURN_SELECTOR = '[data-turn-id], [data-turn-key], [data-testid^="conversation-turn-"], article';
const EXCLUDED = 'template, [hidden], [aria-hidden="true"], [inert], nav, aside, [data-sidebar], #stage-sidebar, #stage-slideover-sidebar, [data-cge-question-navigation]';
const SCOPES = '[data-conversation-id], [data-testid="conversation-turns"], [data-testid="conversation"], #thread';

export function conversationId(path: string): string | null {
  // Root/new-chat pages stay idle until ChatGPT assigns a conversation URL.
  return /(?:^|\/)c\/([a-z0-9-]+)\/?$/i.exec(path)?.[1]?.toLowerCase() ?? null;
}

export function isRendered(element: HTMLElement, boundary?: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.matches(EXCLUDED)) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.contentVisibility === 'hidden') return false;
    if (node === boundary) break;
  }
  return true;
}

export function findConversation(document: Document, id: string): ConversationScope | null {
  const mains = [...document.querySelectorAll<HTMLElement>('main, [role="main"]')]
    .filter((main) => isRendered(main));
  // Prefer a nested main over an outer role=main application shell.
  const leaves = mains.filter((main) => !mains.some((other) => other !== main && main.contains(other)));
  const matches: ConversationScope[] = [];
  for (const main of leaves) {
    const explicit = [...main.querySelectorAll<HTMLElement>(SCOPES)].filter((root) => isRendered(root, main));
    if (main.matches(SCOPES)) explicit.unshift(main);
    const identified = explicit.filter((root) => root.hasAttribute('data-conversation-id'));
    const current = identified.filter((root) => root.getAttribute('data-conversation-id')?.toLowerCase() === id);
    if (identified.length && !current.length) continue;
    const root = current.length === 1 ? current[0]!
      : !identified.length ? explicit.find((candidate) => !candidate.parentElement?.closest(SCOPES)) ?? explicit[0] ?? main
      : null;
    if (root) matches.push({ main, root });
  }
  return matches.length === 1 ? matches[0]! : null;
}

export function messageStamp(message: HTMLElement, root: HTMLElement): string {
  const turn = message.closest<HTMLElement>(TURN_SELECTOR);
  const id = message.getAttribute('data-message-id');
  if (id) return `id:${id}`;
  if (turn && root.contains(turn)) {
    if (turn.hasAttribute('data-turn-id')) return `turn:${turn.getAttribute('data-turn-id')}`;
    if (turn.getAttribute('data-turn-key')) return `turn-key:${turn.getAttribute('data-turn-key')}`;
    if (turn.hasAttribute('data-testid')) return `test:${turn.getAttribute('data-testid')}`;
  }
  return '';
}

export function isUserMessage(message: HTMLElement, root: HTMLElement): boolean {
  if (!message.matches(USER_MESSAGE_SELECTOR)) return false;
  const author = message.getAttribute('data-message-author-role');
  if (author !== null && author !== 'user') return false;
  // Explicit authors outrank bubble markers. Never infer users from text or styling.
  const outerAuthor = message.parentElement?.closest('[data-message-author-role]');
  if (outerAuthor && root.contains(outerAuthor)) return false;
  if (author === 'user') return true;
  if (message.querySelector('[data-message-author-role]')) return false;
  const outerBubble = message.parentElement?.closest(USER_BUBBLE_SELECTOR);
  return !outerBubble || !root.contains(outerBubble);
}

export function createQuestionDiscovery() {
  const references = new WeakMap<HTMLElement, string>();
  let sequence = 0;
  function collect(scope: ConversationScope, blocked?: WeakMap<HTMLElement, string>): Question[] {
    const questions: Question[] = [];
    const seen = new Set<string>();
    for (const message of scope.root.querySelectorAll<HTMLElement>(USER_MESSAGE_SELECTOR)) {
      if (!isRendered(message, scope.main)) continue;
      if (!isUserMessage(message, scope.root)) continue;
      const owner = message.closest('[data-conversation-id]');
      if (owner && !owner.contains(scope.root) && owner !== scope.root) continue;
      const stamp = messageStamp(message, scope.root);
      if (blocked?.has(message) && blocked.get(message) === stamp) continue;
      let key = stamp ? `message:${stamp}` : references.get(message);
      if (!key) { key = `dom:${++sequence}`; references.set(message, key); }
      if (seen.has(key)) continue;
      seen.add(key);
      const turn = message.closest<HTMLElement>(TURN_SELECTOR);
      const target = turn && scope.root.contains(turn) ? turn : message;
      questions.push({ key, message, target, order: questions.length + 1, ...questionPreview(message) });
    }
    return questions;
  }
  return { collect };
}

export function userRelevantMutation(record: MutationRecord): boolean {
  const element = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
  const author = element?.closest('[data-message-author-role]');
  if (author) return author.getAttribute('data-message-author-role') === 'user';
  if (element?.closest(USER_BUBBLE_SELECTOR)) return true;
  // Removing the marker must also invalidate an existing navigation entry.
  if (record.type === 'attributes' && record.attributeName === 'data-user-message-bubble') return true;
  if (record.type === 'attributes') return Boolean(element?.matches('[data-conversation-id]') || element?.querySelector(USER_MESSAGE_SELECTOR));
  return [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1 && (
    (node as Element).matches(`${USER_MESSAGE_SELECTOR}, [data-conversation-id]`)
    || (node as Element).querySelector(`${USER_MESSAGE_SELECTOR}, [data-conversation-id]`)
  ));
}
