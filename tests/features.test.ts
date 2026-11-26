import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFeatureController } from '../src/shared/feature.ts';

test('features enable independently, avoid duplicate setup, and clean up on disable/dispose', () => {
  const events: string[] = [];
  const controller = createFeatureController([
    { id: 'projectColors', enable: () => { events.push('colors:start'); return () => { events.push('colors:stop'); }; } },
    { id: 'chatNavigation', enable: () => { events.push('navigation:start'); return () => { events.push('navigation:stop'); }; } },
  ]);
  controller.apply({ chatColors: false, projectColors: true, codexCloudColors: false, chatNavigation: false });
  controller.apply({ chatColors: false, projectColors: true, codexCloudColors: false, chatNavigation: false });
  controller.apply({ chatColors: false, projectColors: true, codexCloudColors: false, chatNavigation: true });
  controller.apply({ chatColors: false, projectColors: false, codexCloudColors: false, chatNavigation: true });
  assert.deepEqual(events, ['colors:start', 'navigation:start', 'colors:stop']);
  controller.dispose();
  controller.dispose();
  assert.deepEqual(events, ['colors:start', 'navigation:start', 'colors:stop', 'navigation:stop']);
});
