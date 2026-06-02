import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// Encrypts secrets (OAuth access/refresh tokens) at rest with AES-256-GCM.
//
// Rollout is backward-compatible:
//   - If TOKEN_ENCRYPTION_KEY is unset, encrypt is a no-op and decrypt returns
//     the value as-is — nothing breaks, encryption is simply off.
//   - decrypt() recognizes our "enc:v1:" prefix; anything without it is treated
//     as legacy plaintext and returned unchanged. So existing rows keep working
//     and become encrypted the next time they're written (refresh / reconnect).

const PREFIX = 'enc:v1:'

function key32(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) return null
  // Accept any-length secret; derive a stable 32-byte key.
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plain: string): string {
  const key = key32()
  if (!key || plain == null) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(value: string): string {
  if (value == null || !value.startsWith(PREFIX)) return value // legacy plaintext
  const key = key32()
  if (!key) {
    // Key was removed after data was encrypted — we can't recover it. Surface a
    // clear error rather than handing back ciphertext that would fail upstream.
    throw new Error('TOKEN_ENCRYPTION_KEY is required to decrypt stored tokens')
  }
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
