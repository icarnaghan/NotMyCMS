export const DEFAULT_THEME: string;
export function listThemes(root?: string): string[];
export function resolveTheme(
  config: { theme?: string },
  env?: Record<string, string | undefined>,
  themes?: string[]
): string;
