import { projectColors } from '../features/project-colors/index.ts';
import { chatColors } from '../features/chat-colors/index.ts';
import { codexCloudColors } from '../features/codex-cloud-colors/index.ts';
import { discoverCodexCloudTasks } from '../features/codex-cloud-colors/detection.ts';
import { chatNavigation } from '../features/chat-navigation/index.ts';
import { createFeatureController } from '../shared/feature.ts';
import { observeSettings } from '../storage/settings.ts';
import { DEFAULT_SETTINGS } from '../shared/settings.ts';
import { PAGE_STATUS_PROTOCOL, PAGE_STATUS_REQUEST } from '../shared/page-status.ts';
import type { PageStatus } from '../shared/page-status.ts';
import { findSidebars } from '../shared/sidebar-colors/sidebar.ts';
import { discoverProjects } from '../features/project-colors/detection.ts';
import { discoverChats } from '../features/chat-colors/detection.ts';
import { sidebarColorStatus } from '../shared/sidebar-colors/lifecycle.ts';
import { chatNavigationStatus } from '../features/chat-navigation/status.ts';

const controller = createFeatureController([projectColors, chatColors, codexCloudColors, chatNavigation]);
let unsubscribe: (() => void) | undefined;
let settings = { ...DEFAULT_SETTINGS };
let phase: PageStatus['phase'] = 'loading';

// Read-only, same-extension diagnostics: counts/booleans only, never IDs or text.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)
    || message.type !== PAGE_STATUS_REQUEST || sender.id !== chrome.runtime.id) return;
  const roots = findSidebars(document);
  const status: PageStatus = {
    protocol: PAGE_STATUS_PROTOCOL, version: chrome.runtime.getManifest().version, phase, settings: { ...settings },
    roots: roots.length,
    projects: new Set(roots.flatMap(discoverProjects).map((row) => row.id)).size,
    chats: new Set(roots.flatMap(discoverChats).map((row) => row.id)).size,
    codexCloudTasks: new Set(roots.flatMap(discoverCodexCloudTasks).map((row) => row.id)).size,
    ...sidebarColorStatus(document),
    navigation: chatNavigationStatus(document),
  };
  sendResponse(status);
});

function start(): void {
  unsubscribe ??= observeSettings(
    (next) => { settings = next; controller.apply(next); phase = 'ready'; },
    () => { phase = 'error'; console.warn('[ChatGPT Enhanced] Could not load feature settings. Reload the tab to retry.'); },
  );
}

window.addEventListener('pagehide', () => {
  unsubscribe?.();
  unsubscribe = undefined;
  controller.dispose();
});
window.addEventListener('pageshow', start);
start();
