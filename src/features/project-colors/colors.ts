export const PROJECT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export type ProjectColorMap = Record<string, ProjectColor>;

export function isProjectColor(value: unknown): value is ProjectColor {
  return typeof value === 'string' && PROJECT_COLORS.includes(value as ProjectColor);
}
