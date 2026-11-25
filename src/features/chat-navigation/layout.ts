import type { ConversationScope, Question } from './types.ts';
import type { NavigationHiddenReason } from '../../shared/navigation-status.ts';

interface Box { left: number; right: number; top: number; bottom: number; width: number }
export interface ColumnSnapshot extends Box { viewportWidth: number }
export interface PanelLayout { visible: boolean; left: number; top: number; width: number; height: number; reason: NavigationHiddenReason; gutter: number }
export interface LayoutInput {
  viewportWidth: number; viewportHeight: number; main: Box; column: Box;
  sidebarRight: number; headerBottom: number; composerTop: number; collapsed: boolean;
}

export function panelLayout(input: LayoutInput): PanelLayout {
  const leftEdge = Math.max(0, input.main.left, input.sidebarRight) + 12;
  const available = input.column.left - leftEdge - 12;
  const top = Math.max(72, input.headerBottom + 12);
  const bottom = Math.min(input.viewportHeight - 16, input.composerTop - 12);
  const width = input.collapsed ? 36 : Math.max(0, Math.min(220, available));
  const reason: NavigationHiddenReason = input.viewportWidth < 960 ? 'narrow' : available < (input.collapsed ? 36 : 176) ? 'gutter' : bottom - top < 180 ? 'height' : 'none';
  return { visible: reason === 'none', reason,
    gutter: Math.max(0, Math.floor(input.column.left - Math.max(0, input.main.left, input.sidebarRight))),
    left: input.collapsed ? input.column.left - 48 : input.column.left - width - 12,
    top, width, height: Math.max(0, Math.min(560, bottom - top)) };
}

export function contentColumn(scope: ConversationScope, question: Question): HTMLElement {
  const mainWidth = scope.main.getBoundingClientRect().width;
  let column = question.target;
  for (let node: HTMLElement | null = question.message; node && scope.root.contains(node); node = node.parentElement) {
    const rect = node.getBoundingClientRect();
    const maxWidth = node.ownerDocument.defaultView?.getComputedStyle(node).maxWidth;
    if (rect.width >= 280 && rect.width < mainWidth - 32
      && ((maxWidth && maxWidth !== 'none') || /max-w-|thread-content|conversation-content/.test(node.className))) column = node;
    if (node === scope.root) break;
  }
  return column;
}

export function headerBottom(scope: ConversationScope, window: Window): number {
  let bottom = 56;
  for (const header of scope.main.querySelectorAll<HTMLElement>('header, [data-testid="conversation-header"]')) {
    const position = window.getComputedStyle(header).position;
    const rect = header.getBoundingClientRect();
    if ((position === 'fixed' || position === 'sticky') && rect.bottom < window.innerHeight / 2) bottom = Math.max(bottom, rect.bottom);
  }
  return bottom;
}

export function measureLayout(scope: ConversationScope, questions: readonly Question[], collapsed: boolean, window: Window,
  fallback: ColumnSnapshot | null = null, remember?: (box: ColumnSnapshot) => void): PanelLayout {
  const hidden: PanelLayout = { visible: false, left: 0, top: 0, width: 0, height: 0, reason: 'unknown-column', gutter: 0 };
  if (window.innerWidth < 960) return { ...hidden, reason: 'narrow' };
  if (!scope.root.isConnected) return hidden;
  const candidates = [...questions].sort((a, b) => Math.abs(a.message.getBoundingClientRect().top) - Math.abs(b.message.getBoundingClientRect().top));
  let columnBox: Box | undefined;
  for (const question of candidates.slice(0, 8)) {
    const box = contentColumn(scope, question).getBoundingClientRect();
    if (box.width > 0 && box.width < scope.main.getBoundingClientRect().width - 32) { columnBox = box; break; }
  }
  if (columnBox) remember?.({ left: columnBox.left, right: columnBox.right, top: columnBox.top,
    bottom: columnBox.bottom, width: columnBox.width, viewportWidth: window.innerWidth });
  else if (fallback?.viewportWidth === window.innerWidth) columnBox = fallback;
  if (!columnBox) return hidden;
  let sidebarRight = 0;
  for (const sidebar of scope.main.ownerDocument.querySelectorAll<HTMLElement>('aside, nav, [data-sidebar], #stage-sidebar, #stage-slideover-sidebar')) {
    const box = sidebar.getBoundingClientRect();
    if (box.width >= 120 && box.width < Math.min(480, window.innerWidth / 2) && box.height > 200
      && box.left < columnBox.left && box.top < window.innerHeight / 2) sidebarRight = Math.max(sidebarRight, box.right);
  }
  const composer = scope.main.querySelector<HTMLElement>('#composer-background, [data-testid="composer"]')
    ?? scope.main.querySelector<HTMLElement>('#prompt-textarea')?.closest<HTMLElement>('form')
    ?? scope.main.querySelector<HTMLElement>('#prompt-textarea');
  const composerTop = composer?.getBoundingClientRect().top;
  return panelLayout({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    main: scope.main.getBoundingClientRect(), column: columnBox, sidebarRight,
    headerBottom: headerBottom(scope, window), composerTop: composerTop && composerTop > 72 ? composerTop : window.innerHeight,
    collapsed });
}
