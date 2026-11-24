import type { FeatureId, Settings } from './settings.ts';

export type Cleanup = () => void;
export interface Feature {
  readonly id: FeatureId;
  enable(): Cleanup;
}

export function createFeatureController(features: readonly Feature[]) {
  const cleanups = new Map<FeatureId, Cleanup>();
  return {
    apply(settings: Settings): void {
      for (const feature of features) {
        if (settings[feature.id] && !cleanups.has(feature.id)) {
          cleanups.set(feature.id, feature.enable());
        } else if (!settings[feature.id]) {
          cleanups.get(feature.id)?.();
          cleanups.delete(feature.id);
        }
      }
    },
    dispose(): void {
      for (const cleanup of cleanups.values()) cleanup();
      cleanups.clear();
    },
  };
}
