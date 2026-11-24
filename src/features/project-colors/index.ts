import type { Feature } from '../../shared/feature.ts';
import { observeProjectColors, saveProjectColor } from '../../storage/project-colors.ts';
import type { ProjectColorMap } from './colors.ts';
import { discoverProjects, projectAtTarget, SIDEBAR_SELECTOR } from './detection.ts';
import type { ProjectRow } from './detection.ts';
import { createColorMenu } from './menu.ts';
import { clearHighlights, installHighlights, renderHighlights } from './styles.ts';

export function enableProjectColors(document: Document, window: Window): () => void {
  let active = true;
  let ready = false;
  let colors: ProjectColorMap = {};
  let rows: ProjectRow[] = [];
  let sidebars: HTMLElement[] = [];
  let refreshTimer: number | undefined;
  let shellTimer: number | undefined;
  let discoveryTimer: number | undefined;
  const removeStyles = installHighlights(document);
  const menu = createColorMenu(document, window);

  function refresh(): void {
    if (!active) return;
    menu.close();
    const next = sidebars.flatMap(discoverProjects);
    const elements = new Set(next.map((row) => row.element));
    clearHighlights(rows.filter((row) => !elements.has(row.element)));
    rows = next;
    renderHighlights(rows, colors);
  }

  function scheduleRefresh(): void {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, 60);
  }

  const Observer = document.defaultView!.MutationObserver;
  const sidebarObserver = new Observer(scheduleRefresh);
  // Only shallow child-list observation of the sidebar's ancestor chain; never watch main.
  const shellObserver = new Observer(() => {
    window.clearTimeout(shellTimer);
    shellTimer = window.setTimeout(discoverSidebars, 60);
  });

  function discoverSidebars(): void {
    if (!active) return;
    const next = [...document.querySelectorAll<HTMLElement>(SIDEBAR_SELECTOR)]
      .filter((root, _, roots) => !roots.some((other) => other !== root && other.contains(root)));
    if (next.length === sidebars.length && next.every((root, index) => root === sidebars[index])) return;
    sidebarObserver.disconnect();
    shellObserver.disconnect();
    sidebars = next;
    const ancestors = new Set<Element>();
    for (const sidebar of sidebars) {
      sidebarObserver.observe(sidebar, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['href', 'data-sidebar-project-container-id', 'data-app-action-sidebar-project-id'],
      });
      let parent = sidebar.parentElement;
      while (parent) {
        ancestors.add(parent);
        parent = parent.parentElement;
      }
    }
    for (const ancestor of ancestors) shellObserver.observe(ancestor, { childList: true });
    window.clearInterval(discoveryTimer);
    discoveryTimer = sidebars.length ? undefined : window.setInterval(discoverSidebars, 1500);
    refresh();
  }

  function onContextMenu(event: MouseEvent): void {
    if (!ready || event.defaultPrevented || !(event.target instanceof document.defaultView!.Element)) return;
    // React may have just recycled the row: recheck identity at the interaction boundary.
    refresh();
    const row = projectAtTarget(event.target, rows);
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    const bounds = row.element.getBoundingClientRect();
    menu.open({
      anchor: row.element,
      x: keyboard ? bounds.left : event.clientX,
      y: keyboard ? bounds.bottom : event.clientY,
      selected: colors[row.id],
      onSelect: async (color) => {
        const stillMatches = active && row.element.isConnected && sidebars.some((sidebar) =>
          sidebar.isConnected && discoverProjects(sidebar).some((current) => current.element === row.element && current.id === row.id));
        if (!stillMatches) {
          menu.close();
          throw new Error('Project row changed while its color menu was open');
        }
        const previous = colors[row.id];
        if (color) colors[row.id] = color;
        else delete colors[row.id];
        renderHighlights(rows, colors);
        try {
          await saveProjectColor(row.id, color);
        } catch (error) {
          if (active) {
            if (previous) colors[row.id] = previous;
            else delete colors[row.id];
            renderHighlights(rows, colors);
          }
          throw error;
        }
      },
    });
  }

  const stopStorage = observeProjectColors((saved) => {
    colors = saved;
    ready = true;
    renderHighlights(rows, colors);
  }, () => {
    console.warn('[ChatGPT Enhanced] Project colors could not be loaded. Toggle the feature to retry.');
  });
  document.addEventListener('contextmenu', onContextMenu, true);
  // Only poll for a sidebar root while none is mounted; never poll project rows.
  discoveryTimer = window.setInterval(discoverSidebars, 1500);
  discoverSidebars();
  return () => {
    active = false;
    document.removeEventListener('contextmenu', onContextMenu, true);
    sidebarObserver.disconnect();
    shellObserver.disconnect();
    window.clearTimeout(refreshTimer);
    window.clearTimeout(shellTimer);
    window.clearInterval(discoveryTimer);
    stopStorage();
    menu.close();
    clearHighlights(rows);
    removeStyles();
    rows = [];
  };
}

export const projectColors: Feature = {
  id: 'projectColors',
  enable: () => enableProjectColors(document, window),
};
