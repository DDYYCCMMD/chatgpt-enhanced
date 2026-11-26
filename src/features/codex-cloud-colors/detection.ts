import { includingRoot, localPath, MESSAGE_SELECTOR, NATIVE_OVERLAY_SELECTOR, NAVIGATION_SELECTOR, navigationValue, rowHitArea } from '../../shared/sidebar-colors/dom.ts';
import type { SidebarRow } from '../../shared/sidebar-colors/types.ts';

const TASK_ID = 'task_[be]_[a-f0-9]{32}';
const ID = new RegExp(`^${TASK_ID}$`);
const PATH = new RegExp(`^/codex/(?:cloud/)?tasks/(${TASK_ID})/?$`);

export const isCodexCloudTaskId = (id: string): boolean => ID.test(id);

export function codexCloudTaskIdFromUrl(value: string): string | null {
  const path = localPath(value);
  return path ? PATH.exec(path)?.[1] ?? null : null;
}

export function discoverCodexCloudTasks(root: HTMLElement): SidebarRow[] {
  const rows = new Map<HTMLElement, string>();
  for (const item of includingRoot<HTMLElement>(root, NAVIGATION_SELECTOR)) {
    if (item.closest(`${MESSAGE_SELECTOR}, ${NATIVE_OVERLAY_SELECTOR}`)) continue;
    const id = codexCloudTaskIdFromUrl(navigationValue(item) ?? '');
    if (id) rows.set(rowHitArea(item, root, id, codexCloudTaskIdFromUrl), id);
  }
  return [...rows].map(([element, id]) => ({ element, id }));
}
