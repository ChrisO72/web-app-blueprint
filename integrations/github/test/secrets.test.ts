import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { encryptSecret, decryptSecret, verifyWebhook, webhookUrl } from "../secrets.server";
import { KEY, TOKEN } from "./fixtures";

beforeEach(() => vi.stubEnv("CONTROL_ENCRYPTION_KEY", KEY));
afterEach(() => vi.unstubAllEnvs());
describe("GitHub secrets", () => {
  it("encrypts credentials with independent nonces and authenticates ciphertext", () => {
    const first = encryptSecret(TOKEN);
    expect(first).not.toContain(TOKEN);
    expect(first).not.toBe(encryptSecret(TOKEN));
    expect(decryptSecret(first)).toBe(TOKEN);
    const pieces = first.split(".");
    pieces[2] = Buffer.alloc(16).toString("base64");
    expect(() => decryptSecret(pieces.join("."))).toThrow("could not be decrypted");
    vi.stubEnv("CONTROL_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(() => decryptSecret(first)).toThrow("could not be decrypted");
  });
  it("rejects missing or incorrectly sized encryption keys", () => {
    vi.stubEnv("CONTROL_ENCRYPTION_KEY", "");
    expect(() => encryptSecret(TOKEN)).toThrow("32-byte key");
  });
  it("authenticates original bytes and rejects tampering and malformed signatures", () => {
    const body = Buffer.from('{"action":"opened"}');
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyWebhook(body, signature, "secret")).toBe(true);
    expect(verifyWebhook(Buffer.concat([body, Buffer.from(" ")]), signature, "secret")).toBe(false);
    expect(verifyWebhook(body, "sha256=short", "secret")).toBe(false);
    expect(verifyWebhook(body, null, "secret")).toBe(false);
  });
  it("derives the webhook endpoint from APP_URL", () => {
    vi.stubEnv("APP_URL", "https://control.example/");
    expect(webhookUrl()).toBe("https://control.example/webhooks/github");
    vi.stubEnv("APP_URL", "https://control.example/account?tab=profile");
    expect(webhookUrl()).toBe("https://control.example/webhooks/github");
  });
  it.each([
    "",
    "invalid",
    "http://control.example",
    "https://localhost:5173",
    "https://user:password@control.example",
  ])("rejects an APP_URL that cannot receive public HTTPS webhooks: %s", (url) => {
    vi.stubEnv("APP_URL", url);
    expect(() => webhookUrl()).toThrow("public HTTPS");
  });
});
