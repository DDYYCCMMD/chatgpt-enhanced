import type { Settings } from './settings.ts';
import type { ColorKind } from './sidebar-colors/types.ts';
import { isNavigationStatus } from './navigation-status.ts';
import type { NavigationStatus } from './navigation-status.ts';

export const PAGE_STATUS_REQUEST = 'chatgpt-enhanced:page-status';
export const PAGE_STATUS_PROTOCOL = 6;
export type LastContext = 'none' | ColorKind | 'unrecognized' | 'not-ready' | 'ambiguous';
export interface PageStatus {
  protocol: typeof PAGE_STATUS_PROTOCOL;
  version: string;
  phase: 'loading' | 'ready' | 'error';
  settings: Settings;
  roots: number;
  projects: number;
  chats: number;
  codexCloudTasks: number;
  projectReady: boolean;
  chatReady: boolean;
  codexCloudReady: boolean;
  lastContext: LastContext;
  navigation: NavigationStatus;
}

export function isPageStatus(value: unknown): value is PageStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<PageStatus>;
  return status.protocol === PAGE_STATUS_PROTOCOL && typeof status.version === 'string'
    && ['loading', 'ready', 'error'].includes(status.phase ?? '')
    && typeof status.settings?.projectColors === 'boolean' && typeof status.settings.chatColors === 'boolean'
    && typeof status.settings.chatNavigation === 'boolean' && typeof status.settings.codexCloudColors === 'boolean'
    && [status.roots, status.projects, status.chats, status.codexCloudTasks].every((count) => Number.isInteger(count) && count! >= 0)
    && typeof status.projectReady === 'boolean' && typeof status.chatReady === 'boolean' && typeof status.codexCloudReady === 'boolean'
    && isNavigationStatus(status.navigation)
    && ['none', 'project', 'chat', 'codex-cloud', 'unrecognized', 'not-ready', 'ambiguous'].includes(status.lastContext ?? '');
}
