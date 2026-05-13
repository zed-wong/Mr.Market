export const WEB3_LIGHT_THEME = 'web3-light' as const;
export const WEB3_DARK_THEME = 'web3-dark' as const;

export type Web3ThemeName = typeof WEB3_LIGHT_THEME | typeof WEB3_DARK_THEME;

export const isDarkWeb3Theme = (themeName: Web3ThemeName): boolean =>
  themeName === WEB3_DARK_THEME;

export const toWeb3Theme = (isDark: boolean): Web3ThemeName =>
  isDark ? WEB3_DARK_THEME : WEB3_LIGHT_THEME;