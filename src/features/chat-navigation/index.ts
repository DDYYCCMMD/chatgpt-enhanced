import type { Feature } from '../../shared/feature.ts';
import type { ConversationScope, Question } from './types.ts';
import { conversationId, createQuestionDiscovery, findConversation, isRendered, isUserMessage, isCurrentQuestion, messageStamp, userRelevantMutation } from './discovery.ts';
import { contentColumn, headerBottom, measureLayout } from './layout.ts';
import { createQuestionPanel } from './panel.ts';
import { createMessageJumper, scrollRoot } from './scroll.ts';
import { createActiveTracker } from './active.ts';
import { navigationStatuses } from './status.ts';
import type { NavigationStatus } from '../../shared/navigation-status.ts';
import { createQuestionIndex } from './question-index.ts';
import { createHistoryNavigator } from './history.ts';
import { createNavigationBackup } from '../../storage/navigation-backup.ts';
import type { ColumnSnapshot } from './layout.ts';
import { sameQuestionSnapshot } from './identity.ts';

interface Session {
  scope: ConversationScope;
  questions: Question[];
  jumper: ReturnType<typeof createMessageJumper>;
  tracker: ReturnType<typeof createActiveTracker>;
  history: ReturnType<typeof createHistoryNavigator>;
}

export function enableChatNavigation(document: Document, window: Window): () => void {
  const diagnostic: NavigationStatus = { phase: 'waiting-conversation', questions: 0, reason: 'none', viewportWidth: Math.round(window.innerWidth), gutter: 0 };
  navigationStatuses.set(document, diagnostic);
  let active = true;
  let route: string | null = null;
  let session: Session | null = null;
  let discovery = createQuestionDiscovery();
  const index = createQuestionIndex(window);
  let columnSnapshot: ColumnSnapshot | null = null;
  let blocked = new WeakMap<HTMLElement, string>();
  let seen = new WeakMap<HTMLElement, string>();
  let refreshTimer: number | undefined;
  let frame: number | undefined;
  const Observer = document.defaultView!.MutationObserver;
  const rootObserver = new Observer((records) => {
    if (syncRoute() || records.some(userRelevantMutation)) scheduleRefresh();
  });
  const shellObserver = new Observer(() => {
    if (syncRoute()) { scheduleRefresh(); return; }
    if (!route) return;
    const next = findConversation(document, route);
    if (next?.root !== session?.scope.root || next?.main !== session?.scope.main) scheduleRefresh();
    else if (next) watchAncestors(next.root);
  });
  const panel = createQuestionPanel(document, (key) => {
    if (syncRoute()) { scheduleRefresh(); return; }
    const requested = index.get(key);
    const previousQuestion = session?.questions.find((item) => item.key === key);
    reconcile();
    const matches = requested ? session?.questions.filter((item) => sameQuestionSnapshot(item, requested)) ?? [] : [];
    if (!requested || index.get(key)?.tooltip !== requested.tooltip
      || matches.length > 1 || (previousQuestion && session && !isCurrentQuestion(previousQuestion, session.scope.root) && matches.length !== 1)) {
      panel.setHistoryState({ busy: false, text: '该条目已变化，目录已更新，请重新选择。' }); return;
    }
    const question = matches[0];
    if (question && requested.searchText !== requested.tooltip && requested.searchText !== question.searchText) return;
    const currentScope = route ? findConversation(document, route) : null;
    if (!session || (session.history.busy && !session.history.canSeek) || currentScope?.root !== session.scope.root) return;
    if (question && !isCurrentQuestion(question, session.scope.root)) {
      scheduleRefresh(); return;
    }
    // Mounted destinations also need verification after the site's scroll reflow.
    void session.history.seek(key);
  }, () => { panel.setCollapsed(!panel.isCollapsed()); scheduleLayout(); }, () => {
    if (!session) return;
    if (session.history.busy) session.history.cancel(true);
    else void session.history.scan();
  });
  const backup = createNavigationBackup(window, {
    entries: () => index.merge([]),
    restore: (entries) => { index.restore(entries); panel.setQuestions(index.merge([]), false, session?.questions.length ?? 0); scheduleRefresh(); },
    error: () => panel.setHistoryState({ busy: false, text: '本地备份读取或保存失败，页面导航仍可使用。' }),
  });

  function updateTheme(): void {
    const root = document.documentElement;
    const explicit = root.matches('.dark, [data-theme="dark"]');
    const light = root.matches('.light, [data-theme="light"]');
    panel.setTheme(explicit || (!light && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)));
  }
  const themeObserver = new Observer(updateTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  systemTheme?.addEventListener('change', updateTheme);
  updateTheme();

  const Resize = document.defaultView?.ResizeObserver;
  const previousSizes = new WeakMap<Element, { width: number; height: number }>();
  let composer: HTMLElement | null = null;
  const resizeObserver = Resize ? new Resize((entries) => {
    let changed = false;
    for (const entry of entries) {
      const previous = previousSizes.get(entry.target);
      const size = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (!previous || previous.width !== size.width || (entry.target === composer && previous.height !== size.height)) changed = true;
      previousSizes.set(entry.target, size);
    }
    if (changed) scheduleLayout();
  }) : undefined;
  const layoutTargets = new Set<Element>();
  const layoutObserver = new Observer(() => {
    scheduleLayout();
    if (session && !isRendered(session.scope.root, session.scope.main)) scheduleRefresh();
  });
  const onLayoutTransition = (event: Event): void => {
    if (event.target instanceof document.defaultView!.Element && layoutTargets.has(event.target)) scheduleLayout();
  };
  document.addEventListener('transitionend', onLayoutTransition);

  function scheduleLayout(): void {
    if (!active || frame !== undefined) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      if (!active) return;
      if (!session) panel.host.hidden = true;
      else {
        const layout = measureLayout(session.scope, session.questions, panel.isCollapsed(), window, columnSnapshot, (box) => { columnSnapshot = box; });
        panel.setLayout(layout);
        diagnostic.viewportWidth = Math.round(window.innerWidth);
        diagnostic.gutter = layout.gutter;
        if (index.size) {
          diagnostic.reason = layout.reason;
          diagnostic.phase = layout.visible ? panel.isCollapsed() ? 'collapsed' : 'visible' : 'hidden';
        }
      }
    });
  }

  function disposeSession(): void {
    rootObserver.disconnect(); shellObserver.disconnect(); resizeObserver?.disconnect(); layoutObserver.disconnect(); layoutTargets.clear();
    session?.history.dispose(); session?.tracker.dispose(); session?.jumper.dispose(); session = null; composer = null;
    panel.setHistoryState({ busy: false, text: '' });
    diagnostic.questions = 0; diagnostic.reason = 'none'; diagnostic.gutter = 0;
    panel.setQuestions([], true); panel.host.hidden = true;
  }

  function syncRoute(): boolean {
    const next = conversationId(window.location.pathname);
    if (next === route) return false;
    blocked = seen;
    seen = new WeakMap();
    backup.flush();
    disposeSession();
    index.clear();
    columnSnapshot = null;
    route = next;
    diagnostic.phase = next ? 'waiting-container' : 'waiting-conversation';
    discovery = createQuestionDiscovery();
    backup.activate(route);
    return true;
  }

  function scheduleRefresh(): void {
    if (!active) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(reconcile, 80);
  }

  function attach(scope: ConversationScope): void {
    disposeSession();
    const ownerRoute = route;
    const getLine = (): number => {
      const container = session?.questions[0] ? scrollRoot(session.questions[0].target, window) : null;
      return Math.max(headerBottom(scope, window), container?.getBoundingClientRect().top ?? 0) + 24;
    };
    session = {
      scope, questions: [],
      jumper: createMessageJumper(window, scope.root, () => headerBottom(scope, window)),
      tracker: createActiveTracker(document, window, getLine, (key) => panel.setActive(key)),
      history: createHistoryNavigator(window, scope.root, {
        valid: () => active && route === ownerRoute && conversationId(window.location.pathname) === ownerRoute
          && session?.scope.root === scope.root && findConversation(document, ownerRoute!)?.root === scope.root,
        mounted: () => session?.questions ?? [], refresh: reconcile,
        entry: (key) => index.get(key), entries: () => index.merge([]), count: () => index.size, full: () => index.full,
        headerBottom: () => headerBottom(scope, window),
        resolved: (question) => {
          if (!session || !isCurrentQuestion(question, scope.root)) return false;
          const jumped = session.jumper.jump(question);
          if (jumped) session.tracker.select(question.key);
          return jumped;
        },
        state: (state) => panel.setHistoryState(state),
      }),
    };
    panel.setQuestions(index.merge([]), false, 0);
    rootObserver.observe(scope.root, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['data-message-author-role', 'data-user-message-bubble', 'data-message-id', 'data-chatgpt-search-message-ids', 'data-turn-id', 'data-turn-key', 'data-testid', 'data-conversation-id', 'hidden', 'aria-hidden', 'class', 'style'] });
    // Watch only shallow ancestor child lists for replacement, not the entire document subtree.
    watchAncestors(scope.root);
  }

  function watchAncestors(root: HTMLElement): void {
    shellObserver.disconnect();
    for (let parent = root.parentElement; parent; parent = parent.parentElement) shellObserver.observe(parent, { childList: true });
    layoutObserver.disconnect(); layoutTargets.clear();
    for (let parent = root.parentElement; parent; parent = parent.parentElement) layoutTargets.add(parent);
    for (const sidebar of document.querySelectorAll('aside, nav, [data-sidebar], #stage-sidebar, #stage-slideover-sidebar')) layoutTargets.add(sidebar);
    for (const target of layoutTargets) layoutObserver.observe(target, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded'] });
  }

  function reconcile(): void {
    if (!active) return;
    syncRoute();
    if (!route) { diagnostic.phase = 'waiting-conversation'; return; }
    const scope = findConversation(document, route);
    if (!scope) { disposeSession(); diagnostic.phase = 'waiting-container'; return; }
    panel.setFontFamily(window.getComputedStyle(scope.main).fontFamily);
    if (session?.scope.root !== scope.root || session.scope.main !== scope.main) attach(scope);
    const current = session!;
    const next = discovery.collect(scope, blocked);
    for (const previous of current.questions) {
      if (previous.message.isConnected && scope.root.contains(previous.message)
        && !isUserMessage(previous.message, scope.root)) index.remove(previous.key);
    }
    const previousSummaries = index.merge([]).map((question) => ({ ...question }));
    const summaries = index.merge(next);
    const summariesChanged = previousSummaries.length !== summaries.length || summaries.some((question, i) => {
      const previous = previousSummaries[i];
      return previous?.key !== question.key || previous.preview !== question.preview || previous.tooltip !== question.tooltip
        || previous.searchText !== question.searchText;
    });
    for (const question of next) seen.set(question.message, messageStamp(question.message, scope.root));
    const changed = next.length !== current.questions.length || next.some((question, index) => {
      const previous = current.questions[index];
      return question.key !== previous?.key || question.target !== previous.target
        || question.searchText !== previous.searchText || question.message !== previous.message;
    });
    current.questions = next;
    diagnostic.questions = summaries.length;
    diagnostic.phase = summaries.length ? 'measuring' : 'empty';
    if (changed || summariesChanged) panel.setQuestions(summaries, false, next.length);
    if (summariesChanged) backup.schedule();
    if (changed) current.tracker.setQuestions(next);
    resizeObserver?.disconnect();
    resizeObserver?.observe(scope.main);
    if (next[0]) resizeObserver?.observe(contentColumn(scope, next[0]));
    composer = scope.main.querySelector<HTMLElement>('#composer-background, [data-testid="composer"], #prompt-textarea');
    if (composer) resizeObserver?.observe(composer);
    scheduleLayout();
  }

  const onLocation = (): void => { if (syncRoute()) scheduleRefresh(); };
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  navigation?.addEventListener('currententrychange', onLocation);
  window.addEventListener('popstate', onLocation);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('focus', onLocation);
  // Only read the pathname on normal ticks. Query roots only after route change or while absent.
  const routeTimer = window.setInterval(() => {
    if (syncRoute() || (route && !session)) reconcile();
  }, 500);
  reconcile();

  return () => {
    if (!active) return;
    active = false;
    window.clearTimeout(refreshTimer); window.clearInterval(routeTimer);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    navigation?.removeEventListener('currententrychange', onLocation);
    window.removeEventListener('popstate', onLocation);
    window.removeEventListener('resize', scheduleLayout);
    window.removeEventListener('focus', onLocation);
    document.removeEventListener('transitionend', onLayoutTransition);
    systemTheme?.removeEventListener('change', updateTheme);
    themeObserver.disconnect(); backup.dispose(); disposeSession(); index.clear(); panel.dispose();
    blocked = new WeakMap(); seen = new WeakMap(); discovery = createQuestionDiscovery();
    if (navigationStatuses.get(document) === diagnostic) navigationStatuses.delete(document);
  };
}

export const chatNavigation: Feature = {
  id: 'chatNavigation',
  enable: () => enableChatNavigation(document, window),
};
