import type { Idea } from '../services/ideaService'

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
