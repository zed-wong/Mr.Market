const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

let allowedCorsOrigins = [...DEFAULT_CORS_ORIGINS];

export function configureCorsOrigins(
  originConfig: string | undefined,
  wildcardAllowed: boolean,
): string[] {
  const corsOrigins = (originConfig || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const hasWildcard = corsOrigins.includes('*');
  const sanitizedCorsOrigins =
    hasWildcard && !wildcardAllowed
      ? corsOrigins.filter((origin) => origin !== '*')
      : corsOrigins;

  allowedCorsOrigins =
    sanitizedCorsOrigins.length > 0
      ? sanitizedCorsOrigins
      : [...DEFAULT_CORS_ORIGINS];

  return [...allowedCorsOrigins];
}

export function getAllowedCorsOrigins(): string[] {
  return [...allowedCorsOrigins];
}

export function socketCorsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  if (!origin || allowedCorsOrigins.includes('*')) {
    callback(null, true);

    return;
  }

  callback(null, allowedCorsOrigins.includes(origin));
}
