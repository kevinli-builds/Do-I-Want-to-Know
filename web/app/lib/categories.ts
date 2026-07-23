// Shared category presentation: label, emoji, and chart colour.
export const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  order:         { label: 'Online Orders',  emoji: '📦', color: '#6c63ff' },
  clothes:       { label: 'Clothing',        emoji: '👕', color: '#d98c2b' },
  shipping:      { label: 'Shipping Updates', emoji: '🚚', color: '#5b8def' },
  subscription:  { label: 'Subscriptions',  emoji: '🔁', color: '#e0518a' },
  travel:        { label: 'Travel',          emoji: '✈️', color: '#1aa3b8' },
  food:          { label: 'Food & Delivery', emoji: '🍔', color: '#f0913a' },
  entertainment: { label: 'Entertainment',  emoji: '🎬', color: '#9b59d0' },
  charity:       { label: 'Donations',       emoji: '💝', color: '#2ca36b' },
  marketing:     { label: 'Marketing Email', emoji: '📣', color: '#c0334a' },
  refund:        { label: 'Refunds',          emoji: '↩️', color: '#0ea5e9' },
  other:         { label: 'Other',           emoji: '🧾', color: '#888899' },
}

// Ordered list of category keys (for pickers). Mirrors the backend CATEGORIES.
export const CATEGORY_KEYS = Object.keys(CATEGORY_META)

export function catLabel(cat: string): string {
  return CATEGORY_META[cat]?.label ?? cat.charAt(0).toUpperCase() + cat.slice(1)
}
export function catColor(cat: string): string {
  return CATEGORY_META[cat]?.color ?? '#888899'
}
export function catEmoji(cat: string): string {
  return CATEGORY_META[cat]?.emoji ?? '•'
}
