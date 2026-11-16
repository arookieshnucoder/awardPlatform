import type { Idea } from '../services/ideaService'
import { ApiError } from './apiClient'

export function nominationGatewayError(error: unknown) {
  if (error instanceof ApiError && error.status === 405 && error.mediaType === 'text/html') {
    return 'Your nomination was blocked (HTTP 405). Go back to review your text or save a draft. If the problem persists, contact an administrator.'
  }
}

export function isTeamNomination(idea: Idea) {
  return Boolean(idea.teamId || idea.projectAttachments?.some((item) => item.type === 'nomination' && item.nominationType === 'team'))
}

export function occupiesNominationSlot(idea: Idea, hackathonId: string, team: boolean) {
  return !idea.superseded && idea.hackathonId === hackathonId && isTeamNomination(idea) === team
}

export function isNomineeDepartmentWarning(message: string) {
  return message === 'Nominee department is missing or ambiguous in the associate roster. Please contact an administrator.'
}

export function nominationState(idea: Pick<Idea, 'approvalStatus'>) {
  return idea.approvalStatus === 'approved' ? 'Approved'
    : idea.approvalStatus === 'rejected' ? 'Rejected — revise'
      : idea.approvalStatus === 'pending' ? 'In approval' : 'Submitted'
}
