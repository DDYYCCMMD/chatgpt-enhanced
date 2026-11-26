import { createColorStore } from '../../storage/color-store.ts';
import { colorFeature, enableSidebarColors } from '../../shared/sidebar-colors/lifecycle.ts';
import { discoverCodexCloudTasks, isCodexCloudTaskId } from './detection.ts';

const adapter = {
  kind: 'codex-cloud' as const,
  discover: discoverCodexCloudTasks,
  store: createColorStore('codexCloudColors.v1.', isCodexCloudTaskId),
};
export const codexCloudColors = colorFeature('codexCloudColors', adapter);
export const enableCodexCloudColors = (document: Document, window: Window): (() => void) => enableSidebarColors(document, window, adapter);
