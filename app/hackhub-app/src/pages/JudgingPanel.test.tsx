import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { JudgingPanel } from './JudgingPanel'
import { IdeaService } from '../services/ideaService'

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))

const mocks = vi.hoisted(() => ({
  user: { id: 'judge-1', role: 'participant' }, hod: false,
  getCriteria: vi.fn(), applyAwardTemplate: vi.fn(),
  getJudges: vi.fn(), getMyScores: vi.fn(), getEligibleNominations: vi.fn(), submitEvaluation: vi.fn(), notify: vi.fn(),
}))
vi.mock('../hooks/useNominationEligibility', () => ({useNominationEligibility: () => ({data:{canReview:mocks.hod}, isLoading:false})}))
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user: mocks.user }) }))
vi.mock('@mantine/notifications', () => ({ notifications: { show: mocks.notify } }))
vi.mock('../services/judgingService', () => ({ JudgingService: mocks }))
vi.mock('../services/votingService', () => ({ VotingService: { getCriteria: mocks.getCriteria, applyAwardTemplate: mocks.applyAwardTemplate } }))
vi.mock('../services/ideaService', () => ({ IdeaService: { getIdeas: vi.fn(async () => ({ content: [
  { id: 'case-1', title: 'Customer value case', description: 'Executive Summary\nMeasured impact', category: 'Customer Values', tags: [], status: 'submitted',
    projectAttachments: [{ type: 'nomination', name: 'Example nominee', nomineeOrgCode: 'BD/DEV-ONE' },
      { type: 'document', name: 'Evidence.pdf', url: '/storage/report.pdf' }] },
  { id: 'case-2', title: 'Other case', description: 'Example innovation', category: 'Innovation Breakthrough', tags: [], status: 'submitted' },
  { id: 'case-3', title: 'Team value case', description: 'Achievement Summary\nTeam results', category: 'Customer Values', tags: [], status: 'submitted',
    projectAttachments: [{ type: 'nomination', nominationType: 'team', name: 'Example team', nomineeOrgCode: 'BD/OPS-ONE' }] },
  { id: 'case-4', title: 'Other team case', description: 'Example collaboration', category: 'Collaboration to Win', tags: [], status: 'submitted',
    projectAttachments: [{ type: 'nomination', nominationType: 'team', name: 'Other team', nomineeOrgCode: 'BD/OTHER-ONE' }] },
], totalPages: 1 })) } }))

function show(location = '/hackathons/award-1/judge?type=individual') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter initialEntries={[location]}><Routes>
    <Route path="/hackathons/:hackathonId/judge" element={<JudgingPanel />} />
  </Routes></MemoryRouter></QueryClientProvider></MantineProvider>)
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.hod = false
  mocks.getCriteria.mockResolvedValue([{ id: 'behavior', name: 'DPA track criterion 1', weight: 40 }, { id: 'impact', name: 'DPA track criterion 2', weight: 30 }, { id: 'growth', name: 'DPA track criterion 3', weight: 30 }])
  mocks.user.role = 'participant'
  mocks.getJudges.mockResolvedValue([{ userId: 'judge-1' }])
  mocks.getMyScores.mockResolvedValue([])
  mocks.getEligibleNominations.mockResolvedValue(['case-1', 'case-2', 'case-3'])
  mocks.submitEvaluation.mockResolvedValue([])
})

it('submits all three dropdown scores and collapses the saved rating until reopened', async () => {
  const user = userEvent.setup()
  mocks.submitEvaluation.mockResolvedValue(
    [['behavior', 8], ['impact', 5], ['growth', 9]].map(([criterionId, score]) => ({
      id: 'saved-' + criterionId, ideaId: 'case-1', judgeId: 'judge-1', criterionId, score, comment: 'Verified outcome',
    })),
  )
  show()
  const track = within(await screen.findByRole('region', { name: 'Customer Values' }))
  const submit = track.getByRole('button', { name: 'Submit rating' })
  expect(screen.queryByText('Official weighting')).not.toBeInTheDocument()
  expect(track.queryByText('Recommendation')).not.toBeInTheDocument()
  expect(track.queryByRole('progressbar')).not.toBeInTheDocument()
  expect(track.getByRole('heading', { name: /Executive Summary/ })).toBeInTheDocument()
  const details = track.getByRole('region', { name: 'Nomination details' })
  expect(within(details).getByRole('heading', { name: 'Customer value case' })).toBeInTheDocument()
  expect(details).toHaveAttribute('tabindex', '0')
  expect(details.textContent?.indexOf('Evidence.pdf')).toBeGreaterThanOrEqual(0)
  expect(details.textContent?.indexOf('Evidence.pdf')).toBeLessThan(details.textContent?.indexOf('Nominee:') ?? 0)
  const info = track.getByRole('button', { name: 'About Customer Impact' })
  expect(info).toHaveAccessibleDescription(/Delivered measurable value/)
  await user.click(info)
  expect(screen.getByRole('dialog')).toHaveTextContent('Delivered measurable value')
  await user.click(info)
  const impact = track.getByRole('combobox', { name: /Customer Impact score/ })
  expect(within(impact).getAllByRole('option').slice(1).map((option) => option.textContent)).toEqual(Array.from({ length: 10 }, (_, index) => String(index + 1)))
  expect(submit).toBeDisabled()
  await user.selectOptions(impact, '8')
  expect(submit).toBeDisabled()
  await user.selectOptions(track.getByRole('combobox', { name: /Deep Customer Insight score/ }), '5')
  await user.selectOptions(track.getByRole('combobox', { name: /Growing Together with Customers score/ }), '9')
  expect(track.getByText('7.40')).toBeInTheDocument()
  expect(submit).toBeEnabled()
  await user.type(track.getByRole('textbox', { name: 'Comments, if any' }), 'Verified outcome')
  await user.click(submit)
  await waitFor(() => expect(mocks.submitEvaluation).toHaveBeenCalledWith('award-1', {
    ideaId: 'case-1', scores: [{ criterionId: 'behavior', score: 8 }, { criterionId: 'impact', score: 5 }, { criterionId: 'growth', score: 9 }],
    comment: 'Verified outcome',
  }))
  const expand = await track.findByRole('button', { name: 'Expand rating for Customer value case' })
  expect(track.getByText('7.40 / 10')).toBeInTheDocument()
  expect(track.queryByRole('combobox')).not.toBeInTheDocument()
  await user.click(expand)
  expect(track.queryByText('7.40 / 10')).not.toBeInTheDocument()
  expect(track.getByRole('combobox', { name: /Customer Impact score/ })).toHaveValue('8')
  expect(track.getByRole('textbox', { name: 'Comments, if any' })).toHaveValue('Verified outcome')
  expect(track.queryByRole('button', { name: 'Delete rating' })).not.toBeInTheDocument()
  expect(track.getByRole('button', { name: 'Update rating' })).toBeEnabled()
  await user.click(track.getByRole('button', { name: 'Collapse rating for Customer value case' }))
  expect(track.getByRole('button', { name: 'Expand rating for Customer value case' })).toBeInTheDocument()
  expect(track.queryByRole('combobox')).not.toBeInTheDocument()
  expect(IdeaService.getIdeas).toHaveBeenCalledTimes(1)
  expect(mocks.getMyScores).toHaveBeenCalledTimes(1)
})

it('switches between Team and Individual nominations and resets the department filter', async () => {
  const actor = userEvent.setup()
  show('/hackathons/award-1/judge')
  const group = within(await screen.findByRole('group', { name: 'Scoring nomination type' }))
  expect(group.getAllByRole('button').map((button) => button.textContent)).toEqual(['Team', 'Individual'])
  expect(group.getByRole('button', { name: 'Team' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Team value case')).toBeInTheDocument()
  expect(screen.queryByText('Customer value case')).not.toBeInTheDocument()
  const department = screen.getByRole('textbox', { name: 'Filter by department' })
  await actor.click(department)
  await actor.click(await screen.findByRole('option', { name: 'BD/OPS' }))
  await actor.click(group.getByRole('button', { name: 'Individual' }))
  expect(department).toHaveValue('')
  expect(screen.getByText('Customer value case')).toBeInTheDocument()
  expect(screen.getByText('Other case')).toBeInTheDocument()
  expect(screen.queryByText('Team value case')).not.toBeInTheDocument()
})

it('leaves partial historical evaluations incomplete and restores the saved value', async () => {
  mocks.getMyScores.mockResolvedValue([{ id: 'old-score', ideaId: 'case-1', judgeId: 'judge-1', criterionId: 'behavior', score: 8, comment: 'Recommendation: Recommend' }])
  show()
  expect(await screen.findByRole('combobox', { name: /Customer Impact score/ })).toHaveValue('8')
  expect(screen.getByRole('combobox', { name: /Deep Customer Insight score/ })).toHaveValue('')
  expect(screen.queryByRole('button', { name: /Expand rating/ })).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Customer Values' })).getByRole('button', { name: 'Submit rating' })).toBeDisabled()
})

it('lets an unassigned manager review the form without submitting scores', async () => {
  mocks.user.role = 'admin'
  mocks.getJudges.mockResolvedValue([])
  mocks.getEligibleNominations.mockResolvedValue([])
  show()
  expect(await screen.findByRole('combobox', { name: /Customer Impact score/ })).toBeDisabled()
  expect(within(screen.getByRole('region', { name: 'Customer Values' })).getByRole('button', { name: 'Submit rating' })).toBeDisabled()
  expect(mocks.getMyScores).not.toHaveBeenCalled()
})

it('shows only eligible Individual and Team nominations to a roster HoD', async () => {
  mocks.hod = true
  mocks.getJudges.mockResolvedValue([])
  mocks.getEligibleNominations.mockResolvedValue(['case-1', 'case-3'])
  show()
  expect(await screen.findByRole('combobox', { name: 'Customer Impact score' })).toBeEnabled()
  expect(screen.queryByRole('heading', { name: 'Other case' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Team', exact: true }))
  expect(screen.getByRole('heading', { name: 'Team value case' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Other team case' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('textbox', { name: 'Filter by department' }))
  expect(await screen.findByRole('option', { name: 'BD/OPS' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'BD/OTHER' })).not.toBeInTheDocument()
  expect(mocks.getEligibleNominations).toHaveBeenCalledWith('award-1')
})

it('shows an empty state instead of unrelated nominations when the HoD has no scoring assignments', async () => {
  mocks.hod = true
  mocks.getJudges.mockResolvedValue([])
  mocks.getEligibleNominations.mockResolvedValue([])
  show()
  expect(await screen.findByText('No nominations are assigned to you for scoring.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Score the Evidence' })).not.toBeInTheDocument()
})

it('keeps saved values editable on submission failure and preserves legacy comments', async () => {
  mocks.getMyScores.mockResolvedValue(
    ['behavior', 'impact', 'growth'].map((criterionId) => ({
      id: criterionId, ideaId: 'case-1', judgeId: 'judge-1', criterionId, score: 8,
      comment: 'Recommendation: Recommend\n\nLegacy comment',
    })),
  )
  mocks.submitEvaluation.mockRejectedValue(new Error('Unavailable'))
  show()
  const track = within(await screen.findByRole('region', { name: 'Customer Values' }))
  await userEvent.click(await track.findByRole('button', { name: 'Expand rating for Customer value case' }))
  expect(track.getByRole('textbox', { name: 'Comments, if any' })).toHaveValue('Legacy comment')
  await userEvent.selectOptions(track.getByRole('combobox', { name: /Customer Impact score/ }), '10')
  await userEvent.click(track.getByRole('button', { name: 'Update rating' }))
  await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rating not recorded' })))
  expect(track.getByRole('combobox', { name: /Customer Impact score/ })).toHaveValue('10')
  expect(track.getByRole('button', { name: 'Collapse rating for Customer value case' })).toHaveAttribute('aria-expanded', 'true')
})

it('filters committee nominations using the shared category, search and department controls', async () => {
  const actor = userEvent.setup()
  show()
  const search = await screen.findByRole('textbox', { name: 'Search nominees' })
  await actor.type(search, 'example nominee')
  expect(screen.getByText('Customer value case')).toBeInTheDocument()
  expect(screen.queryByText('Other case')).not.toBeInTheDocument()
  await actor.clear(search)
  await actor.click(screen.getByRole('textbox', { name: 'Filter by department' }))
  await actor.click(await screen.findByRole('option', { name: 'BD/DEV' }))
  expect(screen.queryByText('Other case')).not.toBeInTheDocument()
  const categories = within(screen.getByRole('group', { name: 'Filter by award category' }))
  await actor.click(categories.getByRole('button', { name: /Innovation Breakthrough/ }))
  expect(screen.queryByRole('region', { name: 'Customer Values' })).not.toBeInTheDocument()
})

it('repairs an unscored invalid rubric from the blocked scoring screen', async () => {
  mocks.user.role = 'admin'
  mocks.getCriteria.mockResolvedValue([{ id: 'old', name: '111111', weight: 100 }])
  mocks.applyAwardTemplate.mockResolvedValue([{ id: 'behavior', name: 'DPA track criterion 1', weight: 40 }, { id: 'impact', name: 'DPA track criterion 2', weight: 30 }, { id: 'growth', name: 'DPA track criterion 3', weight: 30 }])
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Apply 2026 DPA template' }))
  expect(mocks.applyAwardTemplate).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm official criteria' }))
  await waitFor(() => expect(mocks.applyAwardTemplate).toHaveBeenCalledWith('award-1'))
  expect((await screen.findAllByText('Score the Evidence'))[0]).toBeInTheDocument()
  expect(screen.queryByText('Check setup')).not.toBeInTheDocument()
})

it('keeps the invalid setup visible when existing scores prevent replacement', async () => {
  mocks.user.role = 'admin'
  mocks.getCriteria.mockResolvedValue([{ id: 'old', name: 'Custom', weight: 100 }])
  mocks.applyAwardTemplate.mockRejectedValue(new Error('Existing scores must be reviewed before replacing evaluation criteria.'))
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Apply 2026 DPA template' }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirm official criteria' }))
  await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({color:'red'})))
  expect(screen.queryByText('Score the Evidence')).not.toBeInTheDocument()
})

it('allows a verified roster HoD to score without a committee assignment', async () => { mocks.hod = true; mocks.getJudges.mockResolvedValue([]); show(); expect(await screen.findByRole('combobox', {name:/Customer Impact score/})).toBeEnabled(); expect(mocks.getMyScores).toHaveBeenCalled(); })
