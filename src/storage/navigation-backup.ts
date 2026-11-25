import type { IndexedQuestion } from '../features/chat-navigation/types.ts';

export const NAVIGATION_BACKUP_SETTING = 'settings.v1.navigationBackup';
const EPOCH = 'navigation.backup.epoch.v1';
const PREFIX = 'navigation.backup.v1.';
const MAX_ENTRIES = 300;
const MAX_CONVERSATIONS = 8;
const validRoute = (id: string) => /^[a-z0-9-]{1,128}$/i.test(id);

interface RecordValue { version: 1; updated: number; entries: IndexedQuestion[] }
export function validateNavigationBackup(value: unknown): IndexedQuestion[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Partial<RecordValue>;
  if (record.version !== 1 || !Number.isFinite(record.updated) || !Array.isArray(record.entries)) return [];
  const seen = new Set<string>();
  return record.entries.slice(0, MAX_ENTRIES).flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Partial<IndexedQuestion>;
    if (typeof row.key !== 'string' || !/^message:(?:id|turn|turn-key):.{1,220}$/.test(row.key)
      || seen.has(row.key) || typeof row.preview !== 'string' || row.preview.length > 180
      || typeof row.tooltip !== 'string' || row.tooltip.length > 720 || !Number.isFinite(row.position) || row.position! < 0) return [];
    seen.add(row.key);
    const identityKeys = Array.isArray(row.identityKeys) ? row.identityKeys.slice(0, 6).filter((key): key is string =>
      typeof key === 'string' && /^message:(?:id|turn|turn-key):.{1,220}$/.test(key)) : [];
    return [{ key: row.key, identityKeys, preview: row.preview, tooltip: row.tooltip, searchText: row.tooltip, position: row.position!, order: seen.size }];
  });
}

async function preferences() {
  const stored = await chrome.storage.local.get([NAVIGATION_BACKUP_SETTING, EPOCH]);
  const epoch = stored[EPOCH];
  return { enabled: stored[NAVIGATION_BACKUP_SETTING] === true,
    epoch: typeof epoch === 'number' && Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0 };
}
export async function getNavigationBackupEnabled(): Promise<boolean> { return (await preferences()).enabled; }
export async function setNavigationBackupEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [NAVIGATION_BACKUP_SETTING]: enabled });
}
export async function clearNavigationBackups(): Promise<void> {
  const { epoch } = await preferences();
  // Rotate the namespace so delayed writes cannot resurrect a cleared backup.
  await chrome.storage.local.set({ [NAVIGATION_BACKUP_SETTING]: false, [EPOCH]: epoch + 1 });
  const all = await chrome.storage.local.get(null);
  for (const key of Object.keys(all).filter((key) => key.startsWith(PREFIX))) await chrome.storage.local.remove(key);
}

// Opt-in only. No assistant bodies, full transcripts or account credentials are stored.
export function createNavigationBackup(window: Window, options: {
  entries(): readonly IndexedQuestion[];
  restore(entries: IndexedQuestion[]): void;
  error(): void;
}) {
  let active = true;
  let route: string | null = null;
  let generation = 0;
  let timer: number | undefined;
  let enabled = false;
  let epoch = 0;
  let queue = Promise.resolve();
  const available = typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
  async function load(): Promise<void> {
    const version = ++generation; const owner = route;
    if (!available) return;
    try {
      const preference = await preferences();
      if (!active || version !== generation) return;
      enabled = preference.enabled;
      epoch = preference.epoch;
      if (!enabled || !owner) return;
      const key = `${PREFIX}${preference.epoch}.${owner}`;
      const stored = await chrome.storage.local.get(key);
      if (active && version === generation && owner === route) options.restore(validateNavigationBackup(stored[key]));
    } catch { if (active && version === generation) options.error(); }
  }
  function flush(): void {
    window.clearTimeout(timer); timer = undefined;
    if (!active || !available || !enabled || !route || !validRoute(route)) return;
    const owner = route;
    const ownerEpoch = epoch;
    const entries = validateNavigationBackup({ version: 1, updated: Date.now(), entries: options.entries() });
    if (!entries.length) return;
    queue = queue.then(async () => {
      const pref = await preferences(); if (!pref.enabled || pref.epoch !== ownerEpoch) return;
      const key = `${PREFIX}${pref.epoch}.${owner}`;
      await chrome.storage.local.set({ [key]: { version: 1, updated: Date.now(), entries } });
      const current = await preferences();
      if (current.epoch !== pref.epoch) { await chrome.storage.local.remove(key); return; }
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter((item) => item.startsWith(`${PREFIX}${pref.epoch}.`))
        .sort((a, b) => Number((all[b] as RecordValue)?.updated ?? 0) - Number((all[a] as RecordValue)?.updated ?? 0)
          || Number(b === key) - Number(a === key));
      for (const stale of keys.slice(MAX_CONVERSATIONS)) await chrome.storage.local.remove(stale);
    }).catch(() => { if (active) options.error(); });
  }
  function schedule(): void {
    if (!active || !enabled) return;
    window.clearTimeout(timer); timer = window.setTimeout(flush, 400);
  }
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || (!changes[NAVIGATION_BACKUP_SETTING] && !changes[EPOCH])) return;
    window.clearTimeout(timer); timer = undefined; enabled = false;
    void load().then(schedule);
  };
  if (available) chrome.storage.onChanged.addListener(listener);
  return {
    activate(id: string | null): void { route = id; void load().then(schedule); },
    schedule,
    flush,
    settled: () => queue,
    dispose(): void { flush(); active = false; generation++; window.clearTimeout(timer); if (available) chrome.storage.onChanged.removeListener(listener); },
  };
}
