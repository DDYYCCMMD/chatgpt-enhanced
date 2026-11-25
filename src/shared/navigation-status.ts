export type NavigationPhase = 'disabled' | 'waiting-conversation' | 'waiting-container' | 'empty' | 'measuring' | 'hidden' | 'visible' | 'collapsed';
export type NavigationHiddenReason = 'none' | 'narrow' | 'gutter' | 'height' | 'unknown-column';
export interface NavigationStatus {
  phase: NavigationPhase;
  questions: number;
  reason: NavigationHiddenReason;
  viewportWidth: number;
  gutter: number;
}

export function isNavigationStatus(value: unknown): value is NavigationStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<NavigationStatus>;
  return ['disabled', 'waiting-conversation', 'waiting-container', 'empty', 'measuring', 'hidden', 'visible', 'collapsed'].includes(status.phase ?? '')
    && ['none', 'narrow', 'gutter', 'height', 'unknown-column'].includes(status.reason ?? '')
    && [status.questions, status.viewportWidth, status.gutter].every((n) => Number.isInteger(n) && n! >= 0);
}
