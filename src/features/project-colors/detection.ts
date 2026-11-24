// Compatibility boundary: these are observed DOM conventions, not a public API.
export const SIDEBAR_SELECTOR = '#stage-sidebar, #stage-slideover-sidebar, [data-testid="sidebar"], nav[aria-label="Chat history"]';
const ID_PATTERN = 'g-p-(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})';
const ID = new RegExp(`^${ID_PATTERN}$`, 'i');
const PROJECT_PATH = new RegExp(`^/g/(${ID_PATTERN})(?:-[^/]+)?/project/?$`, 'i');
const METADATA_SELECTOR = '[data-sidebar-project-container-id], [data-app-action-sidebar-project-id]';

export function isProjectId(value: string): boolean {
  return ID.test(value);
}

export function projectIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value, 'https://chatgpt.com');
    if (url.origin !== 'https://chatgpt.com' || url.username || url.password) return null;
    return PROJECT_PATH.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function discoverProjects(sidebar: HTMLElement): ProjectRow[] {
  const rows = new Map<HTMLElement, string>();
  for (const link of sidebar.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const id = projectIdFromUrl(link.getAttribute('href') ?? '');
    if (id) rows.set(link, id);
  }
  for (const marker of sidebar.querySelectorAll<HTMLElement>(METADATA_SELECTOR)) {
    const raw = marker.getAttribute('data-sidebar-project-container-id')?.replace(/^project:/, '')
      ?? marker.getAttribute('data-app-action-sidebar-project-id') ?? '';
    if (!isProjectId(raw)) continue;
    const id = raw.toLowerCase();
    // Containers may also hold conversations: only their direct interactive header is eligible.
    const header = marker.matches('a, button, [role="button"]') ? marker
      : marker.querySelector<HTMLElement>(':scope > a, :scope > button, :scope > [role="button"]');
    if (!header) continue;
    if (header.getAttribute('aria-haspopup') === 'menu') continue;
    if (header.matches('a[href]') && projectIdFromUrl(header.getAttribute('href') ?? '') !== id) {
      rows.delete(header);
      continue;
    }
    const linkedIds = [...header.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map((link) => projectIdFromUrl(link.getAttribute('href') ?? ''));
    if (linkedIds.some((linkedId) => linkedId !== id)) continue;
    // Do not assign two overlapping rows to a single interactive header.
    for (const row of rows.keys()) if (header.contains(row)) rows.delete(row);
    rows.set(header, id);
  }
  return [...rows].map(([element, id]) => ({ element, id }));
}

export interface ProjectRow { element: HTMLElement; id: string }

export function projectAtTarget(target: Element, rows: readonly ProjectRow[]): ProjectRow | undefined {
  // Nested controls belong to ChatGPT (e.g. its native three-dot menu).
  return rows.find(({ element }) => {
    if (!element.contains(target)) return false;
    const control = target.closest('button, [role="button"], [aria-haspopup="menu"]');
    return !control || control === element || !element.contains(control);
  });
}
