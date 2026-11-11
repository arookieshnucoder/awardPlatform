const votingStartsAt = Date.parse('2026-11-30T00:00:00+08:00')
const votingEndsAt = Date.parse('2026-12-12T00:00:00+08:00')
const votingComingSoon = 'The “Browse & Vote” section is coming soon'

type VotingEligibility = {
  data?: { canStartNomination: boolean }
  isError?: boolean
}

export function votingAccessNotice(role: string | undefined, eligibility: VotingEligibility): string | null {
  if (role === 'admin' || eligibility.data?.canStartNomination === true) return null
  if (eligibility.data?.canStartNomination === false) return votingComingSoon
  return eligibility.isError
    ? 'Unable to verify your voting access. Please refresh and try again.'
    : 'Checking your voting access. Please try again in a moment.'
}

export function votingEntryNotice(role: string | undefined, eligibility: VotingEligibility): string | null {
  const status = votingWindowStatus(role)
  if (status === 'early') return votingComingSoon

  const accessNotice = votingAccessNotice(role, eligibility)
  if (accessNotice) return accessNotice

  if (status === 'closed') return 'The voting period has ended.'
  return null
}

function votingWindowStatus(role?: string, now = Date.now()) {
  if (role === 'admin') return 'open'
  if (now < votingStartsAt) return 'early'
  return now < votingEndsAt ? 'open' : 'closed'
}
