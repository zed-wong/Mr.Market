import { writable } from 'svelte/store';

export const mobileNavOpen = writable<boolean>(false);

export const openMobileNav = () => mobileNavOpen.set(true);
export const closeMobileNav = () => mobileNavOpen.set(false);
export const toggleMobileNav = () => mobileNavOpen.update((v) => !v);
