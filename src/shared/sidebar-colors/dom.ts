import type { SidebarRow } from './types.ts';

export const PROJECT_METADATA = ['data-sidebar-project-container-id', 'data-app-action-sidebar-project-id', 'data-sidebar-project-id', 'data-project-id'] as const;
export const PROJECT_METADATA_SELECTOR = PROJECT_METADATA.map((name) => `[${name}]`).join(',');
export const UUID_PATTERN = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
export const STABLE_ID_PATTERN = `(?:[a-f0-9]{32}|${UUID_PATTERN})`;
export const PROJECT_ID_PATTERN = `g-p-${STABLE_ID_PATTERN}`;
export const MAIN_SELECTOR = 'main, [role="main"], [data-message-author-role]';
// A generic main may be the whole app shell. Message boundaries remain a hard exclusion,
// including when a quoted HTML fragment happens to contain sidebar-like attributes.
export const MESSAGE_SELECTOR = 'article, [data-message-author-role], [data-message-id], [data-testid^="conversation-turn-"]';
export const NAVIGATION_SELECTOR = 'a[href], [data-project-url], [data-href]';
// A sidebar drawer itself may use popover. Exclude menu/tooltip surfaces, not all popovers.
export const NATIVE_OVERLAY_SELECTOR = '[popover="hint"], [role="menu"], [role="tooltip"], [data-native-menu-root]';

export function localPath(value: string): string | null {
  try {
    const url = new URL(value, 'https://chatgpt.com');
    return url.origin === 'https://chatgpt.com' && !url.username && !url.password ? url.pathname : null;
  } catch { return null; }
}

export function includingRoot<T extends HTMLElement>(root: HTMLElement, selector: string): T[] {
  return [...(root.matches(selector) ? [root as T] : []), ...root.querySelectorAll<T>(selector)];
}

export function navigationValue(element: Element): string | null {
  const values = ['href', 'data-project-url', 'data-href'].map((name) => element.getAttribute(name))
    .filter((value): value is string => value !== null);
  if (!values.length) return null;
  const paths = values.map(localPath);
  return paths[0] && paths.every((path) => path === paths[0]) ? values[0]! : null;
}

export function isNativeMenu(element: Element): boolean {
  return element.matches('button[aria-haspopup], [role="button"][aria-haspopup], [data-testid="project-menu-button"], [data-testid="conversation-options-button"]');
}

// Expand a link to its nearest safe row hit area, never to a section containing other items.
export function rowHitArea(item: HTMLElement, root: HTMLElement, id: string, fromUrl: (url: string) => string | null): HTMLElement {
  const parent = item.parentElement;
  if (!parent || parent === root || parent.matches(`nav, aside, section, ${MAIN_SELECTOR}`)) return item;
  const links = includingRoot<HTMLElement>(parent, NAVIGATION_SELECTOR);
  if (!links.length || links.some((link) => fromUrl(navigationValue(link) ?? '') !== id)) return item;
  if (parent.matches('[role="button"], [role="treeitem"], [data-sidebar-item], li')
    || (parent.tagName === 'DIV' && parent.children.length <= 3)) return parent;
  return item;
}

export function rowAtTarget(target: Element, rows: readonly SidebarRow[]): SidebarRow | undefined {
  if (target.closest(`[data-cge-color-menu], ${NATIVE_OVERLAY_SELECTOR}`)) return undefined;
  return rows.find(({ element, primary }) => {
    if (!element.contains(target)) return false;
    const control = target.closest('button, [role="button"], [aria-haspopup]');
    return !control || ((control === element || control === primary) && !isNativeMenu(control)) || !element.contains(control);
  });
}
