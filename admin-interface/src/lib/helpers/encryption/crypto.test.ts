import { expect, test, describe, vi, beforeEach } from "vitest";

describe("Crypto Helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("$app/environment", () => ({ browser: true }));
  });

  test("generateKeyPair should return valid keys", async () => {
    const { generateKeyPair } = await import("./crypto");
    const keys = await generateKeyPair();
    expect(keys.publicKey).toBeDefined();
    expect(keys.privateKey).toBeDefined();
    expect(typeof keys.publicKey).toBe("string");
    expect(typeof keys.privateKey).toBe("string");
    expect(keys.publicKey.length).toBeGreaterThan(0);
    expect(keys.privateKey.length).toBeGreaterThan(0);
  });

  test("encrypt should return encrypted string", async () => {
    // Generate a valid keypair first to test against real keys
    const { generateKeyPair, encrypt, decrypt } = await import("./crypto");
    const keys = await generateKeyPair();
    const publicKey = keys.publicKey;
    const message = "Hello, World!";

    const encrypted = await encrypt(message, publicKey);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(message);
    expect(typeof encrypted).toBe("string");

    // Verify decryption
    const decrypted = await decrypt(encrypted, keys.privateKey);
    expect(decrypted).toBe(message);
  });

  test("encryptSecret should be the same as encrypt", async () => {
    const { encrypt, encryptSecret } = await import("./crypto");
    expect(encryptSecret).toBe(encrypt);
  });

  test("encrypt should reject on server-only environment", async () => {
    vi.resetModules();
    vi.doMock("$app/environment", () => ({ browser: false }));
    const { encrypt } = await import("./crypto");

    await expect(encrypt("hello", "invalid-key")).rejects.toThrow(
      "libsodium is browser-only",
    );

    vi.doUnmock("$app/environment");
  });
});
