import { writable } from 'svelte/store';

export const darkTheme = writable<boolean>(false);

const THEME_STORAGE_KEY = 'admin-theme';

export const initTheme = () => {
  if (typeof localStorage === 'undefined') return;
  darkTheme.set(localStorage.getItem(THEME_STORAGE_KEY) === 'admin-dark');
};

export const setDarkTheme = (enabled: boolean) => {
  darkTheme.set(enabled);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, enabled ? 'admin-dark' : 'admin-light');
  }
};

export const toggleDarkTheme = (current: boolean) => {
  setDarkTheme(!current);
};

export const toggleTheme = toggleDarkTheme;
