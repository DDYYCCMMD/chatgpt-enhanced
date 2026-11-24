import { createColorStore } from './color-store.ts';
import { isProjectId } from '../features/project-colors/detection.ts';

// Preserve V0.2 keys: existing saved colors need no migration.
export const PROJECT_COLOR_PREFIX = 'projectColors.v1.';
export const projectColorStore = createColorStore(PROJECT_COLOR_PREFIX, isProjectId);
export const { parse: parseProjectColors, save: saveProjectColor, observe: observeProjectColors } = projectColorStore;
