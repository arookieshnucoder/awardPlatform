const nominationClosesAt = Date.parse('2026-11-28T23:59:00+08:00')
export const nominationResubmissionClosesAt = Date.parse('2026-11-30T18:00:00+08:00')
export const nominationResubmissionClosedMessage = 'Nomination resubmissions closed at 18:00 on November 30.'

export function nominationEntryNotice(): string | null {
  return Date.now() >= nominationClosesAt
    ? 'The Nomination Section is closed at 23 : 59, November 28.'
    : null
}
