import type { ProjectColorMap } from './colors.ts';
import type { ProjectRow } from './detection.ts';

export const COLOR_ATTRIBUTE = 'data-cge-project-color';
const palette = {
  red: '225 75 83', orange: '224 132 39', yellow: '191 155 32',
  green: '43 157 108', blue: '64 133 219', purple: '154 101 214',
};

export function installHighlights(document: Document): () => void {
  const style = document.createElement('style');
  style.setAttribute('data-cge-project-styles', '');
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
    ${Object.entries(palette).map(([color, rgb]) => `[${COLOR_ATTRIBUTE}="${color}"] { --cge-color: ${rgb}; }`).join('\n')}
  `;
  document.head.append(style);
  return () => style.remove();
}

export function renderHighlights(rows: readonly ProjectRow[], colors: ProjectColorMap): void {
  for (const { element, id } of rows) {
    const color = colors[id];
    if (color && element.getAttribute(COLOR_ATTRIBUTE) !== color) element.setAttribute(COLOR_ATTRIBUTE, color);
    else if (!color && element.hasAttribute(COLOR_ATTRIBUTE)) element.removeAttribute(COLOR_ATTRIBUTE);
  }
}

export function clearHighlights(rows: readonly ProjectRow[]): void {
  for (const { element } of rows) element.removeAttribute(COLOR_ATTRIBUTE);
}
