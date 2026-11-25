import type { Settings } from './settings.ts';
import { isNavigationStatus } from './navigation-status.ts';
import type { NavigationStatus } from './navigation-status.ts';

export const PAGE_STATUS_REQUEST = 'chatgpt-enhanced:page-status';
export const PAGE_STATUS_PROTOCOL = 5;
export type LastContext = 'none' | 'project' | 'chat' | 'unrecognized' | 'not-ready' | 'ambiguous';
export interface PageStatus {
  protocol: typeof PAGE_STATUS_PROTOCOL;
  version: string;
  phase: 'loading' | 'ready' | 'error';
  settings: Settings;
  roots: number;
  projects: number;
  chats: number;
  projectReady: boolean;
  chatReady: boolean;
  lastContext: LastContext;
  navigation: NavigationStatus;
}

export function isPageStatus(value: unknown): value is PageStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<PageStatus>;
  return status.protocol === PAGE_STATUS_PROTOCOL && typeof status.version === 'string'
    && ['loading', 'ready', 'error'].includes(status.phase ?? '')
    && typeof status.settings?.projectColors === 'boolean' && typeof status.settings.chatColors === 'boolean'
    && typeof status.settings.chatNavigation === 'boolean'
    && [status.roots, status.projects, status.chats].every((count) => Number.isInteger(count) && count! >= 0)
    && typeof status.projectReady === 'boolean' && typeof status.chatReady === 'boolean'
    && isNavigationStatus(status.navigation)
    && ['none', 'project', 'chat', 'unrecognized', 'not-ready', 'ambiguous'].includes(status.lastContext ?? '');
}
