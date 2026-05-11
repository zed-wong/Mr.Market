import { writable } from 'svelte/store';

const STORAGE_KEY = 'admin-dark-theme';

const readInitial = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
};

export const darkTheme = writable<boolean>(readInitial());

if (typeof window !== 'undefined') {
  darkTheme.subscribe((isDark) => {
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? '1' : '0');
    } catch {
      // localStorage may be unavailable; ignore.
    }
  });
}

export const toggleDarkTheme = () =>
  darkTheme.update((value) => !value);

export const toggleTheme = toggleDarkTheme;
