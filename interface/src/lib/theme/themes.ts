export const MAIN_LIGHT_THEME = "main-light" as const;
export const MAIN_DARK_THEME = "main-dark" as const;
export const ADMIN_LIGHT_THEME = "admin-light" as const;
export const ADMIN_DARK_THEME = "admin-dark" as const;

export type ThemeName =
  | typeof MAIN_LIGHT_THEME
  | typeof MAIN_DARK_THEME
  | typeof ADMIN_LIGHT_THEME
  | typeof ADMIN_DARK_THEME;

export const APP_THEMES = {
  main: {
    light: MAIN_LIGHT_THEME,
    dark: MAIN_DARK_THEME,
  },
  admin: {
    light: ADMIN_LIGHT_THEME,
    dark: ADMIN_DARK_THEME,
  },
} as const;

export const APP_TYPOGRAPHY = {
  fontBody:
    "inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
  fontMono: "'Fira Mono', monospace",
  display: "'Bebas Neue', sans-serif",
} as const;

export const isDarkThemeName = (themeName: ThemeName): boolean =>
  themeName === MAIN_DARK_THEME || themeName === ADMIN_DARK_THEME;

export const toMainTheme = (isDark: boolean): ThemeName =>
  isDark ? MAIN_DARK_THEME : MAIN_LIGHT_THEME;

export const toAdminTheme = (isDark: boolean): ThemeName =>
  isDark ? ADMIN_DARK_THEME : ADMIN_LIGHT_THEME;
