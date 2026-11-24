import { projectColorStore } from '../../storage/project-colors.ts';
import { colorFeature, enableSidebarColors } from '../../shared/sidebar-colors/lifecycle.ts';
import { discoverProjects } from './detection.ts';

const adapter = { kind: 'project' as const, discover: discoverProjects, store: projectColorStore };
export const projectColors = colorFeature('projectColors', adapter);
export const enableProjectColors = (document: Document, window: Window): (() => void) => enableSidebarColors(document, window, adapter);
