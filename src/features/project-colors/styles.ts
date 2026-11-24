import { createHighlightRenderer } from '../../shared/sidebar-colors/highlights.ts';

const renderer = createHighlightRenderer('project');
export const COLOR_ATTRIBUTE = renderer.attribute;
export const { installHighlights, renderHighlights, clearHighlights } = renderer;
