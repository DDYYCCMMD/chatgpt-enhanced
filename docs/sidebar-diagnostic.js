// DevTools > Elements: select a sidebar item, then paste this into Console.
// No titles, textContent, innerHTML, message bodies, or network calls are used.
(() => {
  if (location.origin !== 'https://chatgpt.com') return console.warn('Run this in the Chrome tab at https://chatgpt.com, not the popup or another app.');
  const selected = $0;
  if (!(selected instanceof Element)) return console.warn('Select a sidebar element in Elements first.');
  const messageBoundary = 'article,[data-message-author-role],[data-message-id],[data-testid^="conversation-turn-"]';
  const trustedSidebar = selected.closest('[data-sidebar],#stage-sidebar,#stage-slideover-sidebar,#sidebar,#history,[data-testid="sidebar"],[data-sidebar-project-container-id],[data-app-action-sidebar-project-id],[data-sidebar-archive-chatgpt-id]');
  if (selected.closest(messageBoundary) || (selected.closest('main,[role="main"]') && !trustedSidebar)) return console.warn('Select a sidebar item outside the conversation pane.');
  const stable = /g-p-(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})/i;
  const uuid = /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i;
  const shape = (node) => {
    let route = null;
    const href = node.getAttribute('href');
    if (href) {
      try {
        const url = new URL(href, location.origin);
        route = {
          sameOrigin: url.origin === 'https://chatgpt.com',
          projectId: url.pathname.match(stable)?.[0] ?? null,
          chatId: url.pathname.match(/\/c\/([^/]+)/)?.[1]?.match(uuid)?.[0] ?? null,
          projectHomeSuffix: /\/project\/?$/.test(url.pathname),
          hasChatSegment: /\/c\//.test(url.pathname),
        };
      } catch { route = 'unparseable'; }
    }
    return {
      tag: node.tagName.toLowerCase(), role: node.getAttribute('role'),
      knownRootId: /^(stage-(slideover-)?sidebar|history)$/.test(node.id) ? node.id : null,
      testIdIsSidebar: /sidebar/i.test(node.getAttribute('data-testid') ?? ''),
      tabIndex: node.getAttribute('tabindex'), hasPopup: node.getAttribute('aria-haspopup'),
      dataAttributes: node.getAttributeNames().filter((key) => key.startsWith('data-')).slice(0, 20),
      metadata: Object.fromEntries(['data-sidebar-project-container-id', 'data-app-action-sidebar-project-id', 'data-sidebar-project-id', 'data-project-id']
        .filter((key) => node.hasAttribute(key)).map((key) => [key, node.getAttribute(key)?.match(stable)?.[0]
          ?? node.getAttribute(key)?.match(new RegExp(`^(?:${uuid.source}|[a-f0-9]{32})$`, 'i'))?.[0] ?? '(unrecognized value redacted)'])),
      route,
    };
  };
  const ancestors = [];
  for (let node = selected; node && ancestors.length < 9; node = node.parentElement) ancestors.push(shape(node));
  const descendants = [...selected.querySelectorAll('a[href],button,[role="button"],[data-sidebar-project-container-id],[data-app-action-sidebar-project-id],[data-project-id]')]
    .slice(0, 12).map(shape);
  console.log(JSON.stringify({ ancestors, descendants,
    extensionStyles: document.querySelectorAll('[data-cge-project-styles],[data-cge-chat-styles]').length,
  }, null, 2));
})();
