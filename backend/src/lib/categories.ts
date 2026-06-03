// Central source of truth for all email categories used across the codebase.

export const CATEGORIES = [
  'order',
  'clothes',
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
  subscription:  'Subscriptions',
  travel:        'Travel',
  food:          'Food & Delivery',
  entertainment: 'Entertainment',
  charity:       'Donations',
  marketing:     'Marketing Email',
  refund:        'Refunds',
  other:         'Other',
}
