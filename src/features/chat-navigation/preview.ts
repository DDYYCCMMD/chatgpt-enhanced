const SKIP = 'button, input, textarea, select, script, style, template, [role="button"], [aria-hidden="true"], [hidden], [inert]';
const BLOCK = new Set(['DIV', 'P', 'PRE', 'LI', 'BR', 'SECTION']);
export const PREVIEW_LENGTH = 88;
const TEXT_BUDGET = 2048;

export function truncate(value: string, length: number): string {
  const chars = Array.from(value);
  return chars.length <= length ? value : `${chars.slice(0, Math.max(0, length - 1)).join('')}…`;
}

// Read only the supplied user-message subtree. No HTML rendering, logging, or persistence.
export function questionPreview(message: HTMLElement): { preview: string; tooltip: string; searchText: string } {
  let text = '';
  function visit(node: Node): void {
    if (text.length >= TEXT_BUDGET) return;
    if (node.nodeType === 3) {
      text += (node.nodeValue ?? '').slice(0, TEXT_BUDGET - text.length);
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    if (element !== message && (element.matches(SKIP)
      || (element.hasAttribute('data-message-author-role') && element.getAttribute('data-message-author-role') !== 'user'))) return;
    if (element !== message) {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      if (style?.display === 'none' || style?.visibility === 'hidden') return;
    }
    if (BLOCK.has(element.tagName)) text += ' ';
    for (const child of element.childNodes) visit(child);
    if (BLOCK.has(element.tagName)) text += ' ';
  }
  visit(message);
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const fallback = message.querySelector('img, picture, video, audio, [data-attachment-id], [data-testid*="attachment"]')
    ? '图片或附件消息' : message.querySelector('textarea') ? '正在编辑的消息' : '空白消息';
  const label = normalized || fallback;
  return { preview: truncate(label, PREVIEW_LENGTH), tooltip: truncate(label, 360), searchText: label };
}
