export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type Color = (typeof COLORS)[number];
export type ColorMap = Record<string, Color>;
// Keep persisted preset IDs stable: the former orange slot now displays cyan.
export const COLOR_LABELS: Record<Color, string> = {
  red: 'Red', orange: 'Cyan', yellow: 'Yellow',
  green: 'Green', blue: 'Blue', purple: 'Purple',
};
export const COLOR_RGB: Record<Color, string> = {
  red: '239 51 64', orange: '6 182 212', yellow: '250 204 21',
  green: '22 163 74', blue: '37 99 235', purple: '147 51 234',
};
export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && COLORS.includes(value as Color);
}
