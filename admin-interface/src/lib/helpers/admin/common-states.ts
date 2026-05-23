import { ApiError } from '$lib/helpers/api/client';

export type AdminCommonStateKind = 'loading' | 'empty' | 'error' | 'permission' | 'session';

export interface AdminErrorState {
  kind: Extract<AdminCommonStateKind, 'error' | 'permission' | 'session'>;
  title: string;
  message: string;
  actionLabel: string;
}

const fallbackMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback;

export const classifyAdminError = (
  cause: unknown,
  fallback = 'The admin request did not complete.',
): AdminErrorState => {
  if (cause instanceof ApiError) {
    if (cause.status === 401) {
      return {
        kind: 'session',
        title: 'session expired',
        message: 'Your administrator session is no longer valid. Sign in again before viewing privileged data.',
        actionLabel: 'sign in again',
      };
    }

    if (cause.status === 403) {
      return {
        kind: 'permission',
        title: 'permission denied',
        message: 'This administrator session does not have permission to access this data. Use an account with the required admin access or contact the system owner.',
        actionLabel: 'return to login',
      };
    }
  }

  const message = fallbackMessage(cause, fallback);
  const normalized = message.toLowerCase();

  if (
    normalized.includes('session expired') ||
    normalized.includes('token expired') ||
    normalized.includes('unauthorized') ||
    normalized.includes('status: 401')
  ) {
    return {
      kind: 'session',
      title: 'session expired',
      message: 'Your administrator session is no longer valid. Sign in again before viewing privileged data.',
      actionLabel: 'sign in again',
    };
  }

  if (
    normalized.includes('permission denied') ||
    normalized.includes('forbidden') ||
    normalized.includes('status: 403')
  ) {
    return {
      kind: 'permission',
      title: 'permission denied',
      message: 'This administrator session does not have permission to access this data. Use an account with the required admin access or contact the system owner.',
      actionLabel: 'return to login',
    };
  }

  return {
    kind: 'error',
    title: 'request failed',
    message,
    actionLabel: 'retry',
  };
};

export const messageFromError = (cause: unknown, fallback = 'Request failed') =>
  classifyAdminError(cause, fallback).message;
