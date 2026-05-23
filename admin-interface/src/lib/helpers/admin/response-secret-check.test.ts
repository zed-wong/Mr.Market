import { describe, expect, it, vi } from 'vitest';

import {
  inspectResponseBodyForSecrets,
  isIgnorableResponseBodyReadError,
} from './response-secret-check';

describe('response body secret inspection', () => {
  it('ignores legitimate unreadable response body errors', async () => {
    const assertNoSecrets = vi.fn();

    await expect(
      inspectResponseBodyForSecrets({
        readText: async () => {
          throw new Error('Protocol error (Network.getResponseBody): No resource with given identifier found');
        },
        assertNoSecrets,
        context: 'response body',
      }),
    ).resolves.toBeUndefined();

    expect(assertNoSecrets).not.toHaveBeenCalled();
  });

  it('propagates unexpected response text read failures', async () => {
    const readFailure = new Error('network inspector crashed');

    await expect(
      inspectResponseBodyForSecrets({
        readText: async () => {
          throw readFailure;
        },
        assertNoSecrets: vi.fn(),
        context: 'response body',
      }),
    ).rejects.toBe(readFailure);
  });

  it('propagates secret assertion failures after a readable body is inspected', async () => {
    const assertionFailure = new Error('response body must not expose bearer token');

    await expect(
      inspectResponseBodyForSecrets({
        readText: async () => '{"token":"secret"}',
        assertNoSecrets: () => {
          throw assertionFailure;
        },
        context: 'response body',
      }),
    ).rejects.toBe(assertionFailure);
  });

  it('classifies only known body-read errors as ignorable', () => {
    expect(isIgnorableResponseBodyReadError(new Error('Response body is unavailable for redirect responses'))).toBe(true);
    expect(isIgnorableResponseBodyReadError(new Error('assertion failed: leaked secret'))).toBe(false);
    expect(isIgnorableResponseBodyReadError('No resource with given identifier')).toBe(false);
  });
});
