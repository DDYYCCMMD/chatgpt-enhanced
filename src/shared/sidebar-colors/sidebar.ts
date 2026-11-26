import { discoverCodexCloudTasks } from '../../features/codex-cloud-colors/detection.ts';
import { MAIN_SELECTOR, MESSAGE_SELECTOR, PROJECT_METADATA_SELECTOR } from './dom.ts';

export const SIDEBAR_SELECTOR = '#stage-sidebar, #stage-slideover-sidebar, #sidebar, #history, [data-sidebar], [data-testid="sidebar"], [data-testid="sidebar-navigation"], [data-testid="sidebar-container"], nav[aria-label="Chat history"]';
const SEMANTIC_ROOTS = 'aside, nav, [role="navigation"]';

export function findSidebars(document: Document): HTMLElement[] {
  const roots = [...document.querySelectorAll<HTMLElement>(`${SIDEBAR_SELECTOR}, ${SEMANTIC_ROOTS}`)]
    .filter((root) => !root.closest(MESSAGE_SELECTOR))
    .filter((root) => !root.querySelector(MESSAGE_SELECTOR))
    .filter((root) => root.matches(SIDEBAR_SELECTOR) || (!root.closest(MAIN_SELECTOR) && (root.querySelector(
      `${PROJECT_METADATA_SELECTOR}, [data-project-url], [data-href], a[href^="/c/"], a[href^="/g/g-p-"], a[href^="https://chatgpt.com/c/"]`,
    ) || discoverCodexCloudTasks(root).length > 0)));
  // Explicitly sidebar-named project metadata can bootstrap an otherwise unlabelled mount.
  for (const marker of document.querySelectorAll<HTMLElement>('[data-sidebar-project-container-id], [data-app-action-sidebar-project-id], [data-sidebar-project-id], [data-sidebar-archive-chatgpt-id]')) {
    if (!marker.closest(MESSAGE_SELECTOR) && !roots.some((root) => root.contains(marker))) roots.push(marker);
  }
  return roots.filter((root, _, all) => !all.some((other) => other !== root && other.contains(root)));
}

export function watchSidebar(document: Document, window: Window, onRowsChanged: (roots: HTMLElement[]) => void) {
  let active = true;
  let roots: HTMLElement[] = [];
  let timer: number | undefined;
  let poll: number | undefined;
  let rowsDirty = false;
  const Observer = document.defaultView!.MutationObserver;
  const schedule = (notify: boolean): void => {
    rowsDirty ||= notify;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const dirty = rowsDirty;
      rowsDirty = false;
      scan(dirty);
    }, 60);
  };
  const rowsObserver = new Observer(() => schedule(true));
  const shellObserver = new Observer(() => schedule(false));
  function scan(notify = true): void {
    if (!active) return;
    const next = findSidebars(document);
    const changed = next.length !== roots.length || next.some((root, i) => root !== roots[i]);
    if (changed) {
      roots = next;
      rowsObserver.disconnect();
      for (const root of roots) {
        rowsObserver.observe(root, { subtree: true, childList: true, attributes: true,
          attributeFilter: ['href', 'data-project-url', 'data-href', 'role', 'tabindex', 'data-testid', 'data-sidebar-project-container-id', 'data-app-action-sidebar-project-id', 'data-app-action-sidebar-project-row', 'data-sidebar-project-id', 'data-project-id', 'data-sidebar-archive-chatgpt-id', 'data-app-action-sidebar-thread-row'] });
      }
    }
    // The same root can move to a different layout without changing its identity.
    shellObserver.disconnect();
    const ancestors = new Set<Element>();
    for (const root of roots) {
      for (let parent = root.parentElement; parent; parent = parent.parentElement) ancestors.add(parent);
    }
    for (const ancestor of ancestors) shellObserver.observe(ancestor, { childList: true });
    if (!roots.length && poll === undefined) poll = window.setInterval(() => scan(false), 1500);
    if (roots.length) { window.clearInterval(poll); poll = undefined; }
    if (changed || notify) onRowsChanged(roots);
  }
  const rediscover = (): void => scan(false);
  window.addEventListener('resize', rediscover);
  window.addEventListener('focus', rediscover);
  scan();
  return {
    scan: () => scan(true),
    roots: () => roots,
    dispose: () => {
      active = false;
      rowsObserver.disconnect(); shellObserver.disconnect();
      window.clearTimeout(timer); window.clearInterval(poll);
      window.removeEventListener('resize', rediscover);
      window.removeEventListener('focus', rediscover);
    },
  };
}
