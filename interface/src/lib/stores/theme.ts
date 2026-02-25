import { getMixinContext } from "$lib/helpers/mixin/mixin"
import { derived, get, writable } from "svelte/store"
import { isDarkThemeName, toMainTheme, type ThemeName } from "$lib/theme/themes";

export const theme = writable<ThemeName>(toMainTheme(false))
export const darkTheme = derived(theme, ($theme) => isDarkThemeName($theme))
export const showSettingShortcut = writable(false)


export const detectSystemDark = () => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    theme.set(toMainTheme(true))
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    theme.set(toMainTheme(e.matches));
  });
  const mixinContext = getMixinContext()
  if (!mixinContext) {
    return
  }
  if ((mixinContext as any).appearance === 'dark') {
    theme.set(toMainTheme(true))
  }
}

export const toggleTheme = () => {
  theme.set(toMainTheme(!isDarkThemeName(get(theme))));
}
