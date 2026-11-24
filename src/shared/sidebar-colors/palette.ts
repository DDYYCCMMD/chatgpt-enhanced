export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type Color = (typeof COLORS)[number];
export type ColorMap = Record<string, Color>;
export const COLOR_RGB: Record<Color, string> = {
  red: '225 75 83', orange: '224 132 39', yellow: '191 155 32',
  green: '43 157 108', blue: '64 133 219', purple: '154 101 214',
};
export function isColor(value: unknown): value is Color {
  return typeof value === 'string' && COLORS.includes(value as Color);
}
