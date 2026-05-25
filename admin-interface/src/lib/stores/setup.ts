import { writable } from 'svelte/store';
import type { SetupStatus } from '$lib/helpers/api/setup';

export const setupStatus = writable<SetupStatus | null>(null);
