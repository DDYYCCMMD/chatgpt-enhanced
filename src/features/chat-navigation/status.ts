import type { NavigationStatus } from '../../shared/navigation-status.ts';

export const navigationStatuses = new WeakMap<Document, NavigationStatus>();

// Counts and geometry only. No message text, identifiers, search query or URL in diagnostics.
export function chatNavigationStatus(document: Document): NavigationStatus {
  return { ...(navigationStatuses.get(document) ?? {
    phase: 'disabled', questions: 0, reason: 'none', viewportWidth: 0, gutter: 0,
  }) };
}
