type JsonLike = Record<string, unknown>;

function formatPayload(payload: unknown): string {
  if (payload === undefined) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function logSystemSkip(suiteName: string, reason: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[system] Skipping ${suiteName}: ${reason}`);
}

export function createSystemTestLogger(suiteName: string) {
  const prefix = `[system] ${suiteName}`;

  const emit = (scope: string, message: string, payload?: unknown) => {
    const suffix = formatPayload(payload);

    // eslint-disable-next-line no-console
    console.log(
      suffix
        ? `${prefix} | ${scope} | ${message} | ${suffix}`
        : `${prefix} | ${scope} | ${message}`,
    );
  };

  return {
    suite(message: string, payload?: JsonLike): void {
      emit('suite', message, payload);
    },
    step(message: string, payload?: JsonLike): void {
      emit('step', message, payload);
    },
    check(message: string, payload?: JsonLike): void {
      emit('check', message, payload);
    },
    result(message: string, payload?: JsonLike): void {
      emit('result', message, payload);
    },
  };
}
