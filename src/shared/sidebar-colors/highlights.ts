import { COLOR_RGB } from './palette.ts';
import type { ColorMap } from './palette.ts';
import type { SidebarRow, ColorKind } from './types.ts';

export function createHighlightRenderer(kind: ColorKind) {
  const COLOR_ATTRIBUTE = `data-cge-${kind}-color`;


  function installHighlights(document: Document): () => void {
    const style = document.createElement('style');
    style.setAttribute(`data-cge-${kind}-styles`, '');
    style.textContent = `
      [${COLOR_ATTRIBUTE}] {
        --cge-tint-alpha: .10;
        background-image: linear-gradient(90deg, rgb(var(--cge-color)) 0 3px, transparent 3px),
          linear-gradient(rgb(var(--cge-color) / var(--cge-tint-alpha)), rgb(var(--cge-color) / var(--cge-tint-alpha)));
      }
      [${COLOR_ATTRIBUTE}]:dir(rtl) {
        background-image: linear-gradient(270deg, rgb(var(--cge-color)) 0 3px, transparent 3px),
          linear-gradient(rgb(var(--cge-color) / var(--cge-tint-alpha)), rgb(var(--cge-color) / var(--cge-tint-alpha)));
      }
      @media (prefers-color-scheme: dark) { [${COLOR_ATTRIBUTE}] { --cge-tint-alpha: .18; } }
      :is(.dark, [data-theme="dark"]) [${COLOR_ATTRIBUTE}] { --cge-tint-alpha: .18; }
      :is(.light, [data-theme="light"]) [${COLOR_ATTRIBUTE}] { --cge-tint-alpha: .10; }
      ${Object.entries(COLOR_RGB).map(([color, rgb]) => `[${COLOR_ATTRIBUTE}="${color}"] { --cge-color: ${rgb}; }`).join('\n')}
    `;
    document.head.append(style);
    return () => style.remove();
  }

  function renderHighlights(rows: readonly SidebarRow[], colors: ColorMap): void {
    for (const { element, id } of rows) {
      const color = colors[id];
      if (color && element.getAttribute(COLOR_ATTRIBUTE) !== color) element.setAttribute(COLOR_ATTRIBUTE, color);
      else if (!color && element.hasAttribute(COLOR_ATTRIBUTE)) element.removeAttribute(COLOR_ATTRIBUTE);
    }
  }

  function clearHighlights(rows: readonly SidebarRow[]): void {
    for (const { element } of rows) element.removeAttribute(COLOR_ATTRIBUTE);
  }

  return { attribute: COLOR_ATTRIBUTE, installHighlights, renderHighlights, clearHighlights };
}
