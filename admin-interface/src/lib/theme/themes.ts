export const ADMIN_LIGHT_THEME = 'admin-light' as const;
export const ADMIN_DARK_THEME = 'admin-dark' as const;

export type AdminThemeName = typeof ADMIN_LIGHT_THEME | typeof ADMIN_DARK_THEME;

export const isDarkAdminTheme = (themeName: AdminThemeName): boolean =>
  themeName === ADMIN_DARK_THEME;

export const toAdminTheme = (isDark: boolean): AdminThemeName =>
  isDark ? ADMIN_DARK_THEME : ADMIN_LIGHT_THEME;
