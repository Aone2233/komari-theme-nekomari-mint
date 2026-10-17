export type ColorMode = "system" | "light" | "dark";
export const COLOR_MODE_KEY = "mint-color-mode";
export const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function colorMode(
  saved: string | null,
  legacy: string | null,
): ColorMode {
  if (saved === "system" || saved === "light" || saved === "dark") return saved;
  // Old versions wrote "false" even without user input, so it is not an opt-out.
  return legacy === "true" ? "dark" : "system";
}

export function readColorMode(): ColorMode {
  try {
    return colorMode(
      localStorage.getItem(COLOR_MODE_KEY),
      localStorage.getItem("mint-dark"),
    );
  } catch {
    return "system";
  }
}

export function resolvedColorMode(
  mode: ColorMode,
  systemDark: boolean,
): "light" | "dark" {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}
