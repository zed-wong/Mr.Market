import { get } from 'svelte/store';
import { showSessionExpired } from '$lib/stores/auth';
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error }) => {
  console.error('[web3-interface] client error:', error);
  return {
    message: 'Something went wrong',
  };
};