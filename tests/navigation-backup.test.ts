import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNavigationBackup, NAVIGATION_BACKUP_SETTING, clearNavigationBackups, setNavigationBackupEnabled, validateNavigationBackup } from '../src/storage/navigation-backup.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';
import { navigationDom, FIRST_CONVERSATION, SECOND_CONVERSATION } from './helpers/navigation-dom.ts';
import type { IndexedQuestion } from '../src/features/chat-navigation/types.ts';

const row: IndexedQuestion = { key: 'message:id:unique', preview: 'Preview', tooltip: 'Longer preview', searchText: 'NOT PERSISTED FULL TEXT', order: 1, position: 1200 };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('backups are opt-in, restore bounded summaries per conversation, and never store full search text', async (t) => {
  const s = navigationDom(); const storage = mockChromeStorage();
  const restored: IndexedQuestion[][] = [];
  const backup = createNavigationBackup(s.window, { entries: () => [row], restore: (rows) => restored.push(rows), error: () => assert.fail('Storage failed') });
  t.after(() => { backup.dispose(); s.dom.window.close(); });
  backup.activate(FIRST_CONVERSATION); await tick(); backup.flush(); await backup.settled();
  assert.equal(storage.state.writes, 0);
  await setNavigationBackupEnabled(true); await tick(); backup.flush(); await backup.settled();
  const key = Object.keys(storage.values).find((key) => key.startsWith('navigation.backup.v1.'))!;
  assert(key.endsWith(FIRST_CONVERSATION));
  assert.equal(JSON.stringify(storage.values[key]).includes('NOT PERSISTED FULL TEXT'), false);
  backup.activate(SECOND_CONVERSATION); await tick();
  assert.deepEqual(restored.at(-1), []);
  backup.activate(FIRST_CONVERSATION); await tick();
  assert.equal(restored.at(-1)![0]!.key, row.key);
  assert.equal(restored.at(-1)![0]!.searchText, row.tooltip);
});

test('clear rotates the backup namespace so an in-flight save cannot resurrect cleared records', async (t) => {
  const s = navigationDom(); const storage = mockChromeStorage({ [NAVIGATION_BACKUP_SETTING]: true, 'projectColors.v1.keep': 'red' });
  let release!: () => void; let entered!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const original = storage.local.set;
  storage.local.set = async (entries) => {
    if (Object.keys(entries).some((key) => key.startsWith('navigation.backup.v1.'))) { entered(); await blocked; }
    await original(entries);
  };
  const backup = createNavigationBackup(s.window, { entries: () => [row], restore: () => {}, error: () => assert.fail('Storage failed') });
  t.after(() => { release(); backup.dispose(); s.dom.window.close(); });
  backup.activate(FIRST_CONVERSATION); await tick(); backup.flush(); await started;
  await clearNavigationBackups(); release(); await backup.settled();
  assert.equal(Object.keys(storage.values).some((key) => key.startsWith('navigation.backup.v1.')), false);
  assert.equal(storage.values['projectColors.v1.keep'], 'red');
  assert.equal(storage.values[NAVIGATION_BACKUP_SETTING], false);
});

test('backup validation rejects ambiguous keys, malformed positions and excessive previews', () => {
  const entries = validateNavigationBackup({version: 1, updated: 1, entries: [row, row,
    {...row, key:'dom:1'}, {...row, key:'message:test:conversation-turn-0'},
    {...row, key:'message:id:other', position:Infinity}, {...row, key:'message:id:long', tooltip:'x'.repeat(721)}]});
  assert.equal(entries.length, 1);
  assert.deepEqual(validateNavigationBackup({ version: 999, updated: 1, entries: [row] }), []);
  assert.equal(validateNavigationBackup({version: 1, updated: 1, entries: Array.from({length: 350}, (_, i) => ({...row, key:`message:id:${i}`}))}).length, 300);
});

test('backup eviction bounds the number of conversations while keeping the newest save', async (t) => {
  const s = navigationDom(); const storage = mockChromeStorage({ [NAVIGATION_BACKUP_SETTING]: true });
  const backup = createNavigationBackup(s.window, { entries: () => [row], restore: () => {}, error: () => assert.fail('Storage failed') });
  t.after(() => { backup.dispose(); s.dom.window.close(); });
  for (let i = 0; i < 10; i++) { backup.activate(`conversation-${i}`); await tick(); backup.flush(); await backup.settled(); }
  const keys = Object.keys(storage.values).filter((key) => key.startsWith('navigation.backup.v1.'));
  assert.equal(keys.length, 8);
  assert(keys.some((key) => key.endsWith('conversation-9')));
});
