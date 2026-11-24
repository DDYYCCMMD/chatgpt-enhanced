export const FEATURE_IDS = ['projectColors', 'chatColors', 'chatNavigation'] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type Settings = Record<FeatureId, boolean>;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  projectColors: false,
  chatColors: false,
  chatNavigation: false,
});

export const FEATURE_LABELS: Record<FeatureId, string> = {
  projectColors: 'Project Colors',
  chatColors: 'Chat Colors',
  chatNavigation: 'Chat Navigation',
};
