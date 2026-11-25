// Select one of YOUR message bubbles in Elements, then run this in Console.
// Read-only: no message text, HTML, titles, classes, IDs, URLs or attribute values
// are included. Only fixed role labels, attribute names, counts and visibility.
(() => {
  if (location.origin !== 'https://chatgpt.com') return console.warn('Run this in the ChatGPT page Console.');
  if (!($0 instanceof Element)) return console.warn('Select your message bubble in Elements first.');
  const users = '[data-message-author-role="user"]';
  const turns = '[data-turn="user"]';
  const shape = (node) => {
    const style = getComputedStyle(node);
    const author = node.getAttribute('data-message-author-role');
    const turn = node.getAttribute('data-turn');
    return {
      tag: node.tagName.toLowerCase(),
      attributes: node.getAttributeNames().slice(0, 30),
      author: ['user', 'assistant', 'system'].includes(author) ? author : null,
      turn: ['user', 'assistant'].includes(turn) ? turn : null,
      threadRoot: node.id === 'thread',
      conversationRoot: node.hasAttribute('data-conversation-id'),
      conversationContainer: ['conversation', 'conversation-turns'].includes(node.getAttribute('data-testid')),
      turnContainer: /^conversation-turn-\d+$/.test(node.getAttribute('data-testid') ?? ''),
      excludedRegion: node.matches('nav,aside,[data-sidebar],#stage-sidebar,#stage-slideover-sidebar'),
      hidden: node.matches('[hidden],[aria-hidden="true"],[inert]') || style.display === 'none'
        || style.visibility === 'hidden' || style.contentVisibility === 'hidden',
      userDescendants: node.querySelectorAll(users).length,
      userTurnDescendants: node.querySelectorAll(turns).length,
    };
  };
  const ancestors = [];
  for (let node = $0; node && ancestors.length < 18; node = node.parentElement) ancestors.push(shape(node));
  const containers = [...document.querySelectorAll('main,[role="main"],#thread,[data-testid="conversation"],[data-testid="conversation-turns"],[data-conversation-id]')]
    .slice(0, 20).map(shape);
  console.log(JSON.stringify({ ancestors, containers }, null, 2));
})();
