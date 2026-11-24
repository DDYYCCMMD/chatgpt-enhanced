import { includingRoot, isNativeMenu, localPath, MESSAGE_SELECTOR, NATIVE_OVERLAY_SELECTOR, NAVIGATION_SELECTOR, navigationValue, PROJECT_ID_PATTERN, PROJECT_METADATA, PROJECT_METADATA_SELECTOR, rowAtTarget, rowHitArea, STABLE_ID_PATTERN } from '../../shared/sidebar-colors/dom.ts';
import type { SidebarRow } from '../../shared/sidebar-colors/types.ts';
export { SIDEBAR_SELECTOR } from '../../shared/sidebar-colors/sidebar.ts';
export type ProjectRow = SidebarRow;
export const projectAtTarget = rowAtTarget;

const ID = new RegExp(`^${PROJECT_ID_PATTERN}$`, 'i');
const RAW_ID = new RegExp(`^${STABLE_ID_PATTERN}$`, 'i');
const PROJECT_PATH = new RegExp(`^(?:/g/(${PROJECT_ID_PATTERN})(?:-[^/]+)?(?:/project)?|/projects?/(${PROJECT_ID_PATTERN}))/?$`, 'i');
export function isProjectId(value: string): boolean { return ID.test(value); }
export function projectIdFromUrl(value: string): string | null {
  const path = localPath(value);
  const match = path ? PROJECT_PATH.exec(path) : null;
  return (match?.[1] ?? match?.[2])?.toLowerCase() ?? null;
}

function metadataId(element: Element): string | null {
  const values = PROJECT_METADATA.filter((name) => element.hasAttribute(name)).map((name) => {
    const raw = element.getAttribute(name)!.replace(/^project:/, '');
    return isProjectId(raw) ? raw.toLowerCase() : RAW_ID.test(raw) ? `g-p-${raw.toLowerCase()}` : null;
  });
  return values.length && values.every((id) => id && id === values[0]) ? values[0]! : null;
}

function linksAgree(header: HTMLElement, id: string): boolean {
  return includingRoot<HTMLElement>(header, NAVIGATION_SELECTOR).every((link) => projectIdFromUrl(navigationValue(link) ?? '') === id);
}

export function discoverProjects(root: HTMLElement): SidebarRow[] {
  const rows = new Map<HTMLElement, string>();
  const primary = new Map<HTMLElement, HTMLElement>();
  for (const link of includingRoot<HTMLElement>(root, NAVIGATION_SELECTOR)) {
    if (link.closest(MESSAGE_SELECTOR)) continue;
    const id = projectIdFromUrl(navigationValue(link) ?? '');
    if (!id) continue;
    // A transient URL/metadata disagreement during React updates must fail closed.
    const owner = link.closest(PROJECT_METADATA_SELECTOR);
    if (owner && metadataId(owner) !== id) continue;
    rows.set(rowHitArea(link, root, id, projectIdFromUrl), id);
  }
  for (const marker of includingRoot<HTMLElement>(root, PROJECT_METADATA_SELECTOR)) {
    if (marker.closest(MESSAGE_SELECTOR)) continue;
    const id = metadataId(marker);
    if (!id) continue;
    // The real sidebar repeats container metadata on folder icons. Its explicit action row
    // owns the identity; neither the surrounding expanded list nor icon copies are rows.
    if (marker.querySelector('[data-app-action-sidebar-project-row], [data-app-action-sidebar-project-id][role="button"]')) continue;
    const firstBranch = marker.firstElementChild instanceof marker.ownerDocument.defaultView!.HTMLElement ? marker.firstElementChild : null;
    const interactive = 'a[href], button, summary, [role="button"], [role="link"], [role="treeitem"], [aria-expanded], [tabindex]';
    const scope = marker.matches(interactive) ? marker : firstBranch;
    const candidates = [marker, ...(scope ? includingRoot<HTMLElement>(scope, interactive) : [])];
    let header = candidates.find((candidate) => {
      if (candidate.closest(`${NATIVE_OVERLAY_SELECTOR}, ${MESSAGE_SELECTOR}`)) return false;
      if (isNativeMenu(candidate) || !candidate.matches(interactive)) return false;
      if (candidate.closest(PROJECT_METADATA_SELECTOR) !== marker) return false;
      return linksAgree(candidate, id);
    });
    // Some project containers use a noninteractive div header around the label and menu.
    // Only the first header branch is eligible; never paint the expanded chat container.
    if (!header && !marker.matches('a, button')) {
      const first = marker.firstElementChild;
      if (first instanceof marker.ownerDocument.defaultView!.HTMLElement
        && first.matches('div, header') && !first.closest(NATIVE_OVERLAY_SELECTOR) && linksAgree(first, id)
        && !first.querySelector(PROJECT_METADATA_SELECTOR)) header = first;
    }
    if (!header) continue;
    let hitArea = header;
    for (let parent = header.parentElement; parent && parent !== marker; parent = parent.parentElement) {
      if (!linksAgree(parent, id) || parent.querySelector(PROJECT_METADATA_SELECTOR)) break;
      hitArea = parent;
    }
    // An outer explicit metadata row is safe only when it contains no chat/unrelated links.
    const row = marker !== root && linksAgree(marker, id) && !isNativeMenu(marker)
      && !marker.querySelector(PROJECT_METADATA_SELECTOR) ? marker : hitArea;
    for (const element of rows.keys()) if (row.contains(element)) rows.delete(element);
    rows.set(row, id);
    primary.set(row, header);
  }
  return [...rows].map(([element, id]) => {
    const header = primary.get(element);
    return header ? { element, id, primary: header } : { element, id };
  });
}
