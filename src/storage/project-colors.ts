import { isProjectColor } from '../features/project-colors/colors.ts';
import type { ProjectColor, ProjectColorMap } from '../features/project-colors/colors.ts';
import { isProjectId } from '../features/project-colors/detection.ts';

// Per-project keys form a logical map without cross-tab read/modify/write races.
export const PROJECT_COLOR_PREFIX = 'projectColors.v1.';

export function parseProjectColors(values: Record<string, unknown>): ProjectColorMap {
  const result: ProjectColorMap = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(PROJECT_COLOR_PREFIX)) continue;
    const id = key.slice(PROJECT_COLOR_PREFIX.length);
    if (isProjectId(id) && id === id.toLowerCase() && isProjectColor(value)) result[id] = value;
  }
  return result;
}

export async function saveProjectColor(id: string, color: ProjectColor | null): Promise<void> {
  if (!isProjectId(id) || id !== id.toLowerCase() || (color !== null && !isProjectColor(color))) {
    throw new Error('Invalid project color preference');
  }
  const key = `${PROJECT_COLOR_PREFIX}${id}`;
  const stored = await chrome.storage.local.get(key);
  if (color === null) {
    if (Object.hasOwn(stored, key)) await chrome.storage.local.remove(key);
  } else if (stored[key] !== color) {
    await chrome.storage.local.set({ [key]: color });
  }
}

export function observeProjectColors(
  onColors: (colors: ProjectColorMap) => void,
  onError: (error: unknown) => void,
): () => void {
  let active = true;
  let initialized = false;
  let colors: ProjectColorMap = {};
  const pending: Record<string, chrome.storage.StorageChange> = {};
  const apply = (changes: Record<string, chrome.storage.StorageChange>): boolean => {
    let changed = false;
    for (const [key, change] of Object.entries(changes)) {
      const id = key.slice(PROJECT_COLOR_PREFIX.length);
      if (!key.startsWith(PROJECT_COLOR_PREFIX) || !isProjectId(id) || id !== id.toLowerCase()) continue;
      if (isProjectColor(change.newValue)) colors[id] = change.newValue;
      else delete colors[id];
      changed = true;
    }
    return changed;
  };
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || !active) return;
    if (!initialized) Object.assign(pending, changes);
    else if (apply(changes)) onColors({ ...colors });
  };
  chrome.storage.onChanged.addListener(listener);
  void chrome.storage.local.get(null).then((values) => {
    if (!active) return;
    colors = parseProjectColors(values);
    apply(pending);
    initialized = true;
    onColors({ ...colors });
  }).catch((error: unknown) => { if (active) onError(error); });
  return () => {
    active = false;
    chrome.storage.onChanged.removeListener(listener);
  };
}
