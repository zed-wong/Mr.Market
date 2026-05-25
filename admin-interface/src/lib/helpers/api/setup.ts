import { apiFetch, setAccessToken } from './client';

export interface SetupStatus {
  initialized: boolean;
  seededAt: string | null;
  completedAt: string | null;
  completedSteps: Record<string, boolean>;
  seedRequired: boolean;
}

export interface SetupSeedStatus {
  seedRequired: boolean;
  checks: Record<string, number>;
}

export interface SetupConfigStatus {
  key: string;
  configured: boolean;
  secret: boolean;
  encrypted: boolean;
  updatedAt: string | null;
}

interface SetupTokenResponse {
  access_token: string;
  expires_in: number;
}

export const fetchSetupStatus = () =>
  apiFetch<SetupStatus>('/setup/status', { suppressSessionExpired: true });

export const setSetupPassword = async (password: string) => {
  const result = await apiFetch<SetupTokenResponse>('/setup/password', {
    method: 'POST',
    json: { password },
    suppressSessionExpired: true,
  });

  setAccessToken(result.access_token);

  return result;
};

export const fetchSetupSeedStatus = () =>
  apiFetch<SetupSeedStatus>('/setup/seed-status');

export const fetchSetupConfigStatus = () =>
  apiFetch<SetupConfigStatus[]>('/setup/env');

export const runSetupSeed = () =>
  apiFetch<{ ok: true; seededAt: string }>('/setup/seed', {
    method: 'POST',
  });

export const completeSetupStep = (step: string) =>
  apiFetch<{ ok: true; completedSteps: Record<string, boolean> }>(
    `/setup/steps/${encodeURIComponent(step)}`,
    { method: 'PATCH' },
  );

export const writeSetupEnv = (values: Record<string, string>) =>
  apiFetch<{ ok: true; keys: string[] }>('/setup/env', {
    method: 'POST',
    json: { values },
  });

export const completeSetup = () =>
  apiFetch<{ ok: true; completedAt: string }>('/setup/complete', {
    method: 'POST',
  });
