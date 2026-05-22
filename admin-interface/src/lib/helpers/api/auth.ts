import {
  ApiError,
  apiFetch,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from './client';
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

export interface AdminSession {
  authenticated: boolean;
  username?: string;
}

interface AuthTokenResponse {
  access_token: string;
  expires_in: number;
}

export const login = async (password: string): Promise<boolean> => {
  try {
    const result = await apiFetch<AuthTokenResponse>('/auth/login', {
      method: 'POST',
      json: { password },
    });
    setAccessToken(result.access_token);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return false;
    }
    throw err;
  }
  return true;
};

export const checkSession = async (): Promise<AdminSession | null> => {
  if (!getAccessToken()) {
    return null;
  }
  try {
    const res = await apiFetch<AdminSession>('/auth/session', {
      suppressSessionExpired: true,
    });
    return res ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    throw err;
  }
};

export const logout = async (): Promise<void> => {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return;
    }
    throw err;
  } finally {
    clearAccessToken();
  }
};

export const registerPasskey = async (): Promise<boolean> => {
  const options = await apiFetch('/auth/passkeys/register/options', {
    method: 'POST',
  });
  const credential = await startRegistration({ optionsJSON: options as never });
  await apiFetch('/auth/passkeys/register/verify', {
    method: 'POST',
    json: credential,
  });
  return true;
};

export interface PasskeyCredential {
  credentialId: string;
  counter: number;
  transports: string[];
  createdAt: string;
  updatedAt: string;
}

export const listPasskeys = async (): Promise<PasskeyCredential[]> => {
  const result = await apiFetch<PasskeyCredential[]>('/auth/passkeys');
  return Array.isArray(result) ? result : [];
};

export const deletePasskey = async (credentialId: string): Promise<void> => {
  await apiFetch(`/auth/passkeys/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
  });
};

export const loginWithPasskey = async (): Promise<boolean> => {
  try {
    const options = await apiFetch('/auth/passkeys/login/options', {
      method: 'POST',
      suppressSessionExpired: true,
    });
    const credential = await startAuthentication({ optionsJSON: options as never });
    const result = await apiFetch<AuthTokenResponse>('/auth/passkeys/login/verify', {
      method: 'POST',
      json: credential,
      suppressSessionExpired: true,
    });
    setAccessToken(result.access_token);
    return true;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return false;
    }
    throw err;
  }
};
