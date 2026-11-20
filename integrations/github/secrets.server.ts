import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { readEnvironment } from "~/runtime/env.server";
import { githubEnvSchema } from "./config";

export class GitHubSetupError extends Error {}

function encryptionKey() {
  const { CONTROL_ENCRYPTION_KEY } = readEnvironment(githubEnvSchema);
  const key = Buffer.from(CONTROL_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32 || key.toString("base64") !== CONTROL_ENCRYPTION_KEY)
    throw new GitHubSetupError("Set CONTROL_ENCRYPTION_KEY to a base64-encoded 32-byte key.");
  return key;
}

export function webhookUrl() {
  const { GITHUB_WEBHOOK_ORIGIN, APP_URL } = readEnvironment(githubEnvSchema);
  const setting = GITHUB_WEBHOOK_ORIGIN ? "GITHUB_WEBHOOK_ORIGIN" : "APP_URL";
  let url: URL;
  try {
    url = new URL("/webhooks/github", GITHUB_WEBHOOK_ORIGIN ?? APP_URL);
  } catch {
    throw new GitHubSetupError(`Set ${setting} to a public HTTPS URL before connecting GitHub.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /^(localhost|127\.|\[?::1\]?$)/i.test(url.hostname) ||
    url.hostname.endsWith(".local")
  )
    throw new GitHubSetupError(`${setting} must be a public HTTPS URL to receive GitHub webhooks.`);
  return url.toString();
}

export function setupStatus() {
  try {
    encryptionKey();
    webhookUrl();
    return { ready: true, error: null };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof GitHubSetupError ? error.message : "GitHub configuration is invalid.",
    };
  }
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(value: string) {
  const [version, iv, tag, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra)
    throw new GitHubSetupError("The stored GitHub credential could not be decrypted.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new GitHubSetupError(
      "The stored GitHub credential could not be decrypted. Check CONTROL_ENCRYPTION_KEY.",
    );
  }
}

export function verifyWebhook(body: Buffer, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
