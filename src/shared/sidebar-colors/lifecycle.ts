import type { Feature } from '../feature.ts';
import type { ColorStore } from '../../storage/color-store.ts';
import type { ColorMap } from './palette.ts';
import type { ColorKind, SidebarRow } from './types.ts';
import { rowAtTarget } from './dom.ts';
import { createColorMenu } from './menu.ts';
import { createHighlightRenderer } from './highlights.ts';
import { watchSidebar } from './sidebar.ts';
import type { LastContext } from '../page-status.ts';

interface Adapter {
  kind: ColorKind;
  discover: (root: HTMLElement) => SidebarRow[];
  store: ColorStore;
}
interface State {
  adapter: Adapter;
  rows: SidebarRow[];
  colors: ColorMap;
  ready: boolean;
  active: boolean;
  refs: number;
  renderer: ReturnType<typeof createHighlightRenderer>;
  dispose: () => void;
}

// One delegation listener, menu, and sidebar watcher per document, shared by both features.
const hosts = new WeakMap<Document, ReturnType<typeof createHost>>();

function createHost(document: Document, window: Window) {
  const states = new Map<ColorKind, State>();
  const menu = createColorMenu(document, window);
  let menuOwner: State | undefined;
  let lastContext: LastContext = 'none';
  function refresh(state: State, roots: HTMLElement[]): void {
    if (menuOwner === state) { menu.close(); menuOwner = undefined; }
    const rows = roots.flatMap(state.adapter.discover);
    const elements = new Set(rows.map((row) => row.element));
    state.renderer.clearHighlights(state.rows.filter((row) => !elements.has(row.element)));
    state.rows = rows;
    state.renderer.renderHighlights(rows, state.colors);
  }
  const watcher = watchSidebar(document, window, (roots) => {
    for (const state of states.values()) refresh(state, roots);
  });

  function onContextMenu(event: MouseEvent): void {
    if (event.composedPath().some((node) => node instanceof document.defaultView!.Element && node.hasAttribute('data-cge-color-menu'))) return;
    watcher.scan(); // Also handles a new mount or recycled wrapper before mutation debounce.
    const target = event.composedPath().find((node): node is Element => node instanceof document.defaultView!.Element);
    if (!target) { lastContext = 'unrecognized'; return; }
    const matches = [...states.values()].flatMap((state) => {
      const row = state.ready ? rowAtTarget(target, state.rows) : undefined;
      return row ? [{ state, row }] : [];
    });
    if (matches.length !== 1) {
      lastContext = matches.length > 1 ? 'ambiguous'
        : [...states.values()].some((state) => !state.ready) ? 'not-ready' : 'unrecognized';
      return; // Ambiguous ownership must retain native behavior.
    }
    const { state, row } = matches[0]!;
    lastContext = state.adapter.kind;
    event.preventDefault();
    event.stopPropagation();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    const bounds = row.element.getBoundingClientRect();
    menuOwner = state;
    menu.open({
      anchor: row.element, label: state.adapter.kind === 'project' ? 'Project color' : 'Chat color',
      x: keyboard ? bounds.left : event.clientX, y: keyboard ? bounds.bottom : event.clientY,
      selected: state.colors[row.id],
      onSelect: async (color) => {
        const valid = state.active && row.element.isConnected && watcher.roots().some((root) => root.isConnected
          && state.adapter.discover(root).some((current) => current.element === row.element && current.id === row.id));
        if (!valid) { menu.close(); throw new Error('Sidebar row identity changed'); }
        const previous = state.colors[row.id];
        if (color) state.colors[row.id] = color;
        else delete state.colors[row.id];
        state.renderer.renderHighlights(state.rows, state.colors);
        try { await state.adapter.store.save(row.id, color); }
        catch (error) {
          if (state.active) {
            if (previous) state.colors[row.id] = previous;
            else delete state.colors[row.id];
            state.renderer.renderHighlights(state.rows, state.colors);
          }
          throw error;
        }
      },
    });
  }
  // Window capture precedes native document/root listeners that may stop propagation.
  window.addEventListener('contextmenu', onContextMenu, true);

  function register(adapter: Adapter): () => void {
    let state = states.get(adapter.kind);
    if (state) state.refs++;
    else {
      const renderer = createHighlightRenderer(adapter.kind);
      const removeStyles = renderer.installHighlights(document);
      state = { adapter, renderer, colors: {}, rows: [], ready: false, active: true, refs: 1, dispose: () => {} };
      const current = state;
      const unsubscribe = adapter.store.observe((colors) => {
        current.colors = colors;
        current.ready = true;
        renderer.renderHighlights(current.rows, colors);
      }, () => console.warn(`[ChatGPT Enhanced] ${adapter.kind} colors could not be loaded. Toggle the feature to retry.`));
      current.dispose = () => {
        current.active = false;
        unsubscribe();
        renderer.clearHighlights(current.rows);
        removeStyles();
        if (menuOwner === current) { menu.close(); menuOwner = undefined; }
      };
      states.set(adapter.kind, current);
      refresh(current, watcher.roots());
    }
    const current = state;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      if (--current.refs > 0) return;
      current.dispose();
      states.delete(adapter.kind);
      if (!states.size) {
        watcher.dispose(); menu.close();
        window.removeEventListener('contextmenu', onContextMenu, true);
        hosts.delete(document);
      }
    };
  }
  return { register, status: () => ({
    projectReady: states.get('project')?.ready ?? false,
    chatReady: states.get('chat')?.ready ?? false,
    lastContext,
  }) };
}

export function sidebarColorStatus(document: Document) {
  return hosts.get(document)?.status() ?? { projectReady: false, chatReady: false, lastContext: 'none' as const };
}

export function enableSidebarColors(document: Document, window: Window, adapter: Adapter): () => void {
  let host = hosts.get(document);
  if (!host) { host = createHost(document, window); hosts.set(document, host); }
  return host.register(adapter);
}

export function colorFeature(id: Feature['id'], adapter: Adapter): Feature {
  return { id, enable: () => enableSidebarColors(document, window, adapter) };
}
