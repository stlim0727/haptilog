const encode = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const decode = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function key(secret: string) {
  const raw = decode(secret);
  if (raw.length !== 32) throw new Error("NOT_CONFIGURED");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(value: unknown, secret: string, session: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(session) },
    await key(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}
export async function unseal(value: string, secret: string, session: string) {
  const [iv, encrypted] = value.split(".");
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decode(iv),
      additionalData: new TextEncoder().encode(session),
    },
    await key(secret),
    decode(encrypted),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function hash(value: string) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
