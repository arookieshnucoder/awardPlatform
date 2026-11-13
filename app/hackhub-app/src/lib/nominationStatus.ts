import type { Idea } from '../services/ideaService'

export function isNomineeDepartmentWarning(message: string) {
  return message === 'Nominee department is missing or ambiguous in the associate roster. Please contact an administrator.'
}

export function nominationState(idea: Pick<Idea, 'approvalStatus'>) {
  return idea.approvalStatus === 'approved' ? 'Approved'
    : idea.approvalStatus === 'rejected' ? 'Rejected — revise'
      : idea.approvalStatus === 'pending' ? 'In approval' : 'Submitted'
}
