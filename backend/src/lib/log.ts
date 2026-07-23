// PII-safe error logging. We deliberately never dump full error objects or
// request bodies — those can carry user ids, Gmail addresses, email metadata, or
// raw DB row data (a Prisma validation error, for example, echoes the offending
// row). Log only the error name + a truncated message.
export function logError(tag: string, err: unknown): void {
  const e = err as { name?: string; message?: string }
  const name = typeof e?.name === 'string' ? e.name : 'Error'
  const msg = typeof e?.message === 'string' ? e.message : String(err)
  console.error(tag, `${name}: ${msg.slice(0, 200)}`)
}
