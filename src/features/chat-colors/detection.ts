import { includingRoot, localPath, MESSAGE_SELECTOR, NAVIGATION_SELECTOR, navigationValue, rowHitArea, STABLE_ID_PATTERN, PROJECT_ID_PATTERN } from '../../shared/sidebar-colors/dom.ts';
import type { SidebarRow } from '../../shared/sidebar-colors/types.ts';

const ID = new RegExp(`^${STABLE_ID_PATTERN}$`, 'i');
const PATH = new RegExp(`^(?:/c|/g/(?:${PROJECT_ID_PATTERN}|g-${STABLE_ID_PATTERN})(?:-[^/]+)?/c)/(${STABLE_ID_PATTERN})/?$`, 'i');
export function isChatId(id: string): boolean { return ID.test(id); }
export function chatIdFromUrl(value: string): string | null {
  const path = localPath(value);
  return path ? PATH.exec(path)?.[1]?.toLowerCase() ?? null : null;
}
export function discoverChats(root: HTMLElement): SidebarRow[] {
  const rows = new Map<HTMLElement, string>();
  for (const link of includingRoot<HTMLElement>(root, NAVIGATION_SELECTOR)) {
    if (link.closest(MESSAGE_SELECTOR)) continue;
    const id = chatIdFromUrl(navigationValue(link) ?? '');
    if (!id) continue;
    const nativeRow = link.closest<HTMLElement>('[data-sidebar-archive-chatgpt-id]');
    if (nativeRow && root.contains(nativeRow)) {
      if (nativeRow.getAttribute('data-sidebar-archive-chatgpt-id')?.toLowerCase() !== id
        || !includingRoot<HTMLElement>(nativeRow, NAVIGATION_SELECTOR).every((item) => chatIdFromUrl(navigationValue(item) ?? '') === id)) continue;
      rows.set(nativeRow, id);
    } else rows.set(rowHitArea(link, root, id, chatIdFromUrl), id);
  }
  return [...rows].map(([element, id]) => ({ element, id }));
}
