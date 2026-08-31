export function formatLastEventTs(ts: number): string {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  return date.toLocaleDateString()
}

/** Collapse whitespace and cap the string for a one-line message preview. */
export function previewText(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= 120) return collapsed
  return `${collapsed.slice(0, 120)}…`
}
