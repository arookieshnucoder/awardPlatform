const votingStartsAt = Date.parse('2026-12-14T00:00:00+08:00')
const votingEndsAt = Date.parse('2026-12-26T00:00:00+08:00')

export function votingWindowStatus(role?: string, now = Date.now()) {
  if (role === 'admin') return 'open'
  if (now < votingStartsAt) return 'early'
  return now < votingEndsAt ? 'open' : 'closed'
}

export function nextVotingWindowChange(now: number): number | undefined {
  if (now < votingStartsAt) return votingStartsAt
  if (now < votingEndsAt) return votingEndsAt
  return undefined
}
