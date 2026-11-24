type Changes = Record<string, chrome.storage.StorageChange>;
type Listener = (changes: Changes, area: string) => void;

export function mockChromeStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const listeners = new Set<Listener>();
  const state = {
    writes: 0, removals: 0, failWrite: false,
    read: async (keys: string | string[] | null): Promise<Record<string, unknown>> => {
      if (keys === null) return { ...values };
      return Object.fromEntries((typeof keys === 'string' ? [keys] : keys)
        .filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]));
    },
  };
  const emit = (changes: Changes, area = 'local'): void => {
    for (const listener of listeners) listener(changes, area);
  };
  const local = {
    get: (keys: string | string[] | null) => state.read(keys),
    set: async (entries: Record<string, unknown>) => {
      if (state.failWrite) throw new Error('Storage unavailable');
      state.writes++;
      const changes: Changes = {};
      for (const [key, newValue] of Object.entries(entries)) {
        changes[key] = { oldValue: values[key], newValue };
        values[key] = newValue;
      }
      emit(changes);
    },
    remove: async (key: string) => {
      if (state.failWrite) throw new Error('Storage unavailable');
      state.removals++;
      const oldValue = values[key];
      delete values[key];
      emit({ [key]: { oldValue } });
    },
  };
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { storage: { local, onChanged: {
      addListener: (fn: Listener) => listeners.add(fn),
      removeListener: (fn: Listener) => listeners.delete(fn),
    } } },
  });
  return { values, listeners, state, local, emit };
}
