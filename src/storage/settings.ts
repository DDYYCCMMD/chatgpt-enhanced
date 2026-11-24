import { DEFAULT_SETTINGS, FEATURE_IDS } from '../shared/settings.ts';
import type { FeatureId, Settings } from '../shared/settings.ts';

// Versioned, separate keys prevent independent toggles from overwriting each other.
const keyFor = (id: FeatureId): string => `settings.v1.${id}`;

function readSetting(id: FeatureId, value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[id];
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(FEATURE_IDS.map(keyFor));
  return Object.fromEntries(
    FEATURE_IDS.map((id) => [id, readSetting(id, stored[keyFor(id)])]),
  ) as Settings;
}

export async function setFeatureEnabled(id: FeatureId, enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [keyFor(id)]: enabled });
}

// Subscribe before reading; changes received during initialization win over the snapshot.
export function observeSettings(
  onSettings: (settings: Settings) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let initialized = false;
  let current: Settings = { ...DEFAULT_SETTINGS };
  const pending: Partial<Settings> = {};
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local') return;
    let changed = false;
    for (const id of FEATURE_IDS) {
      const change = changes[keyFor(id)];
      if (!change) continue;
      const value = readSetting(id, change.newValue);
      current[id] = value;
      if (!initialized) pending[id] = value;
      changed = true;
    }
    if (initialized && changed) onSettings({ ...current });
  };
  chrome.storage.onChanged.addListener(listener);
  void getSettings().then((settings) => {
    if (!active) return;
    current = { ...settings, ...pending };
    initialized = true;
    onSettings({ ...current });
  }).catch((error: unknown) => {
    if (active) onError(error);
  });
  return () => {
    active = false;
    chrome.storage.onChanged.removeListener(listener);
  };
}
