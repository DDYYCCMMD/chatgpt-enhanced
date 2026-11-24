import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isProjectColor, PROJECT_COLORS } from '../src/features/project-colors/colors.ts';
import type { ProjectColor, ProjectColorMap } from '../src/features/project-colors/colors.ts';
import { observeProjectColors, parseProjectColors, PROJECT_COLOR_PREFIX as prefix, saveProjectColor } from '../src/storage/project-colors.ts';
import { mockChromeStorage } from './helpers/chrome-storage.ts';

const a = 'g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const b = 'g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('only the six preset color names and canonical project IDs are restored', () => {
  for (const color of PROJECT_COLORS) assert.equal(isProjectColor(color), true);
  for (const invalid of ['pink', 'RED', '#ff0000', '', 1, null, {}, '__proto__']) assert.equal(isProjectColor(invalid), false);
  assert.deepEqual(parseProjectColors({
    [`${prefix}${a}`]: 'red', [`${prefix}${b}`]: 'invalid',
    [`${prefix}Same name`]: 'blue', [`${prefix}${a.toUpperCase()}`]: 'blue',
    'settings.v1.projectColors': true, [`${prefix}__proto__`]: 'green',
  }), { [a]: 'red' });
});

test('per-project serialization, independent concurrent writes, and no redundant writes', async () => {
  const mock = mockChromeStorage();
  await Promise.all([saveProjectColor(a, 'red'), saveProjectColor(b, 'blue')]);
  assert.deepEqual(parseProjectColors(mock.values), { [a]: 'red', [b]: 'blue' });
  await saveProjectColor(a, 'red');
  assert.equal(mock.state.writes, 2);
  await saveProjectColor(a, null);
  assert.deepEqual(parseProjectColors(mock.values), { [b]: 'blue' });
  await saveProjectColor(a, null);
  assert.equal(mock.state.removals, 1);
  await assert.rejects(saveProjectColor('Same name', 'red'));
  await assert.rejects(saveProjectColor(a, 'pink' as ProjectColor));
});

test('observer restores data and responds to updates, reset, and invalid stored values', async () => {
  const mock = mockChromeStorage({ [`${prefix}${a}`]: 'green' });
  const snapshots: ProjectColorMap[] = [];
  const stop = observeProjectColors((colors) => snapshots.push(colors), (error) => { throw error; });
  await tick();
  assert.deepEqual(snapshots.at(-1), { [a]: 'green' });
  mock.emit({ [`${prefix}${a}`]: { newValue: 'red' } }, 'sync');
  assert.equal(snapshots.length, 1);
  await saveProjectColor(a, null);
  assert.deepEqual(snapshots.at(-1), {});
  await mock.local.set({ [`${prefix}${a}`]: 'blue' });
  assert.deepEqual(snapshots.at(-1), { [a]: 'blue' });
  await mock.local.set({ [`${prefix}${a}`]: 'pink' });
  assert.deepEqual(snapshots.at(-1), {});
  stop();
  assert.equal(mock.listeners.size, 0);
});

test('initialization merges newer events and teardown suppresses late reads', async () => {
  const mock = mockChromeStorage();
  let finish!: (data: Record<string, unknown>) => void;
  mock.state.read = () => new Promise((resolve) => { finish = resolve; });
  const snapshots: ProjectColorMap[] = [];
  const stop = observeProjectColors((colors) => snapshots.push(colors), (error) => { throw error; });
  mock.emit({ [`${prefix}${a}`]: { newValue: 'purple' } });
  mock.emit({ [`${prefix}${b}`]: { oldValue: 'red' } });
  finish({ [`${prefix}${a}`]: 'green', [`${prefix}${b}`]: 'red' });
  await tick();
  assert.deepEqual(snapshots, [{ [a]: 'purple' }]);
  stop();
  const dispose = observeProjectColors(() => assert.fail('Late callback'), (error) => { throw error; });
  dispose();
  finish({});
  await tick();
  assert.equal(mock.listeners.size, 0);
});

test('storage failures are reported rather than silently saving', async () => {
  const mock = mockChromeStorage();
  mock.state.failWrite = true;
  await assert.rejects(saveProjectColor(a, 'red'), /Storage unavailable/);
  mock.state.read = async () => { throw new Error('Read unavailable'); };
  let reported: unknown;
  const stop = observeProjectColors(() => assert.fail('Unexpected callback'), (error) => { reported = error; });
  await tick();
  assert.match(String(reported), /Read unavailable/);
  stop();
});
