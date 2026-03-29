type JsonLike = Record<string, unknown>;
type JestStateReader = {
  expect?: {
    getState?: () => {
      currentTestName?: string;
    };
  };
};

function formatPayload(payload: unknown): string {
  if (payload === undefined) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function readCurrentTestName(): string {
  try {
    const state = (global as JestStateReader).expect?.getState?.();
    const currentTestName = state?.currentTestName;

    return typeof currentTestName === 'string' ? currentTestName : '';
  } catch {
    return '';
  }
}

export function logSystemSkip(suiteName: string, reason: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[system] Skipping ${suiteName}: ${reason}`);
}

export function createSystemTestLogger(suiteName: string) {
  const prefix = `[system] ${suiteName}`;
  let stepIndex = 0;

  const emit = (
    scope: string,
    message: string,
    payload?: unknown,
    options?: { countAsStep?: boolean },
  ) => {
    if (options?.countAsStep) {
      stepIndex += 1;
    }

    const suffix = formatPayload(payload);
    const currentTestName = readCurrentTestName();
    const testLabel = currentTestName
      ? ` | test=${currentTestName}`
      : ' | test=(suite)';
    const stepLabel = options?.countAsStep ? ` | step=${stepIndex}` : '';
    const header = `${prefix}${testLabel}${stepLabel} | ${scope} | ${message}`;

    // eslint-disable-next-line no-console
    console.log(suffix ? `${header} | ${suffix}` : header);
  };

  return {
    suite(message: string, payload?: JsonLike): void {
      emit('suite', message, payload);
    },
    step(message: string, payload?: JsonLike): void {
      emit('step', message, payload, { countAsStep: true });
    },
    check(message: string, payload?: JsonLike): void {
      emit('check', message, payload);
    },
    result(message: string, payload?: JsonLike): void {
      emit('result', message, payload);
    },
  };
}
