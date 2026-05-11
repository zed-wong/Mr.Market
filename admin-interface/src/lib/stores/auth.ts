import { writable } from 'svelte/store';

// Tracks whether the SPA has finished its startup session check.
export const checked = writable(false);

// Tracks whether the most recent login attempt was submitted.
export const submitted = writable(false);

// True when the current session is authenticated (cookie + session check passed).
export const correct = writable(false);

// True while a login request is in flight.
export const loginLoading = writable(false);

// When true, the global session-expired modal is shown.
export const showSessionExpired = writable(false);

// Search query for the users page (used by /users).
export const userSearch = writable('');
