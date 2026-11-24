import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { getSettings, observeSettings, setFeatureEnabled } from '../src/storage/settings.ts';
import type { Settings } from '../src/shared/settings.ts';

type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
let stored: Record<string, unknown>;
let listeners: Set<Listener>;
let read: () => Promise<Record<string, unknown>>;
let failWrite: boolean;

function emit(changes: Record<string, chrome.storage.StorageChange>, area = 'local'): void {
  for (const listener of listeners) listener(changes, area);
}

beforeEach(() => {
  stored = {};
  listeners = new Set();
  read = async () => ({ ...stored });
  failWrite = false;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      storage: {
        local: {
          get: () => read(),
          set: async (values: Record<string, unknown>) => {
            if (failWrite) throw new Error('Write failed');
            Object.assign(stored, values);
            emit(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])));
          },
        },
        onChanged: {
          addListener: (listener: Listener) => listeners.add(listener),
          removeListener: (listener: Listener) => listeners.delete(listener),
        },
      },
    },
  });
});

test('missing or malformed settings use safe boolean defaults', async () => {
  assert.deepEqual(await getSettings(), { chatColors: false, projectColors: false, chatNavigation: false });
  stored = { 'settings.v1.projectColors': 'true', 'settings.v1.chatNavigation': true };
  assert.deepEqual(await getSettings(), { chatColors: false, projectColors: false, chatNavigation: true });
});

test('independent concurrent toggle writes persist across reads', async () => {
  await Promise.all([setFeatureEnabled('projectColors', true), setFeatureEnabled('chatNavigation', true)]);
  assert.deepEqual(await getSettings(), { chatColors: false, projectColors: true, chatNavigation: true });
  await setFeatureEnabled('projectColors', false);
  assert.deepEqual(await getSettings(), { chatColors: false, projectColors: false, chatNavigation: true });
});

test('new Chat Colors toggle persists independently while old V0.2 values stay intact', async () => {
  stored = { 'settings.v1.projectColors': true, 'settings.v1.chatNavigation': false };
  await setFeatureEnabled('chatColors', true);
  assert.deepEqual(await getSettings(), { projectColors: true, chatColors: true, chatNavigation: false });
  await setFeatureEnabled('projectColors', false);
  assert.deepEqual(await getSettings(), { projectColors: false, chatColors: true, chatNavigation: false });
});

test('observers merge changes during the initial read and handle deletion', async () => {
  let resolveRead!: (value: Record<string, unknown>) => void;
  read = () => new Promise((resolve) => { resolveRead = resolve; });
  const snapshots: Settings[] = [];
  const stop = observeSettings((settings) => snapshots.push(settings), (error) => { throw error; });
  emit({ 'settings.v1.projectColors': { newValue: true } });
  resolveRead({ 'settings.v1.projectColors': false, 'settings.v1.chatNavigation': true });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(snapshots, [{ chatColors: false, projectColors: true, chatNavigation: true }]);
  emit({ 'settings.v1.projectColors': { newValue: false } }, 'sync');
  assert.equal(snapshots.length, 1);
  emit({ 'settings.v1.projectColors': { oldValue: true } });
  assert.deepEqual(snapshots.at(-1), { chatColors: false, projectColors: false, chatNavigation: true });
  stop();
  assert.equal(listeners.size, 0);
});

test('disposing during initialization suppresses late updates', async () => {
  let resolveRead!: (value: Record<string, unknown>) => void;
  read = () => new Promise((resolve) => { resolveRead = resolve; });
  const stop = observeSettings(() => assert.fail('Late update'), (error) => { throw error; });
  stop();
  resolveRead({});
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(listeners.size, 0);
});

test('storage failures reach callers and observers', async () => {
  failWrite = true;
  await assert.rejects(setFeatureEnabled('projectColors', true), /Write failed/);
  read = async () => { throw new Error('Read failed'); };
  let reported: unknown;
  const stop = observeSettings(() => assert.fail('Unexpected settings'), (error) => { reported = error; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.match(String(reported), /Read failed/);
  stop();
});
