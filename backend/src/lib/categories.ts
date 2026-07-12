// Central source of truth for all email categories used across the codebase.

export const CATEGORIES = [
  'order',
  'clothes',
  'shipping',
  'subscription',
  'travel',
  'food',
  'entertainment',
  'charity',
  'marketing',
  'refund',
  'other',
] as const

export type Category = (typeof CATEGORIES)[number]

/** O(1) membership set for the canonical categories. */
export const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORIES)

/**
 * Coerce an untrusted value to a known Category, defaulting to 'other'.
 * Use this on the extraction/persist path: the category originates from
 * attacker-influenceable email content (subject/snippet) routed through Claude,
 * so a prompt-injection could otherwise smuggle an arbitrary string into the
 * aggregation buckets. Trims + lowercases before matching.
 */
export function normalizeCategory(value: unknown): Category {
  const c = String(value ?? '').trim().toLowerCase()
  return (CATEGORY_SET.has(c) ? c : 'other') as Category
}

/** Categories that represent real financial spend (marketing is excluded). */
export const SPEND_CATEGORIES: Category[] = [
  'order',
  'clothes',
  'subscription',
  'travel',
  'food',
  'entertainment',
  'other',
]

export const CATEGORY_LABELS: Record<Category, string> = {
  order:         'Online Orders',
  clothes:       'Clothing',
  shipping:      'Shipping Updates',
  subscription:  'Subscriptions',
  travel:        'Travel',
  food:          'Food & Delivery',
  entertainment: 'Entertainment',
  charity:       'Donations',
  marketing:     'Marketing Email',
  refund:        'Refunds',
  other:         'Other',
}
