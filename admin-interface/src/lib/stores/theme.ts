import { writable } from 'svelte/store';

export const darkTheme = writable<boolean>(false);

export const toggleDarkTheme = () => {
  darkTheme.set(false);
};

export const toggleTheme = toggleDarkTheme;
