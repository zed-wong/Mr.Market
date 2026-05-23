export type ResponseBodySecretAssertion = (body: string, context: string) => void;

interface InspectResponseBodyOptions {
  readText: () => Promise<string>;
  assertNoSecrets: ResponseBodySecretAssertion;
  context: string;
}

const ignorableBodyReadPatterns = [
  /body is unavailable/i,
  /no resource with given identifier/i,
  /evicted from inspector cache/i,
  /could not load body/i,
  /failed to load response body/i,
  /not a text response/i,
  /non-?text/i,
];

export const isIgnorableResponseBodyReadError = (cause: unknown) => {
  if (!(cause instanceof Error)) {
    return false;
  }

  return ignorableBodyReadPatterns.some((pattern) => pattern.test(cause.message));
};

export const inspectResponseBodyForSecrets = async ({
  readText,
  assertNoSecrets,
  context,
}: InspectResponseBodyOptions) => {
  let body: string;

  try {
    body = await readText();
  } catch (cause) {
    if (isIgnorableResponseBodyReadError(cause)) {
      return;
    }

    throw cause;
  }

  assertNoSecrets(body, context);
};
