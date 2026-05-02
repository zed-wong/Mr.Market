import { BadRequestException } from '@nestjs/common';

const UNSAFE_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function assertStrategyConfigOverridesSafe(
  configOverrides: Record<string, unknown> | undefined,
  reservedFields: ReadonlySet<string>,
): void {
  if (!configOverrides) {
    return;
  }

  for (const field of reservedFields) {
    if (Object.prototype.hasOwnProperty.call(configOverrides, field)) {
      throw new BadRequestException(
        `configOverrides cannot override system field: ${field}`,
      );
    }
  }

  assertNoUnsafeConfigKeys(configOverrides, 'configOverrides');
}

function assertNoUnsafeConfigKeys(value: unknown, path: string): void {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoUnsafeConfigKeys(item, `${path}[${index}]`),
    );

    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  if (!isPlainObject(value)) {
    throw new BadRequestException(
      `${path} must contain only plain JSON objects`,
    );
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (UNSAFE_CONFIG_KEYS.has(key)) {
      throw new BadRequestException(
        `configOverrides contains unsafe key: ${path}.${key}`,
      );
    }

    assertNoUnsafeConfigKeys(nestedValue, `${path}.${key}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
