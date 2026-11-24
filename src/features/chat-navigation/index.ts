import type { Feature } from '../../shared/feature.ts';

export const chatNavigation: Feature = {
  id: 'chatNavigation',
  enable() {
    // V0.1 lifecycle placeholder; no conversation content is read or retained.
    return () => {};
  },
};
