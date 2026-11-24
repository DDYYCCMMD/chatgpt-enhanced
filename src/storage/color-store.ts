import { isColor } from '../shared/sidebar-colors/palette.ts';
import type { Color, ColorMap } from '../shared/sidebar-colors/palette.ts';

export function createColorStore(prefix: string, isId: (id: string) => boolean) {
  function parse(values: Record<string, unknown>): ColorMap {
    const result: ColorMap = {};
    for (const [key, value] of Object.entries(values)) {
      if (!key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (isId(id) && id === id.toLowerCase() && isColor(value)) result[id] = value;
    }
    return result;
  }

  async function save(id: string, color: Color | null): Promise<void> {
    if (!isId(id) || id !== id.toLowerCase() || (color !== null && !isColor(color))) {
      throw new Error('Invalid sidebar color preference');
    }
    const key = `${prefix}${id}`;
    const stored = await chrome.storage.local.get(key);
    if (color === null) {
      if (Object.hasOwn(stored, key)) await chrome.storage.local.remove(key);
    } else if (stored[key] !== color) {
      await chrome.storage.local.set({ [key]: color });
    }
  }

  function observe(
    onColors: (colors: ColorMap) => void,
    onError: (error: unknown) => void,
  ): () => void {
    let active = true;
    let initialized = false;
    let colors: ColorMap = {};
    const pending: Record<string, chrome.storage.StorageChange> = {};
    const apply = (changes: Record<string, chrome.storage.StorageChange>): boolean => {
      let changed = false;
      for (const [key, change] of Object.entries(changes)) {
        const id = key.slice(prefix.length);
        if (!key.startsWith(prefix) || !isId(id) || id !== id.toLowerCase()) continue;
        if (isColor(change.newValue)) colors[id] = change.newValue;
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
      colors = parse(values);
      apply(pending);
      initialized = true;
      onColors({ ...colors });
    }).catch((error: unknown) => { if (active) onError(error); });
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  return { parse, save, observe };
}

export type ColorStore = ReturnType<typeof createColorStore>;
