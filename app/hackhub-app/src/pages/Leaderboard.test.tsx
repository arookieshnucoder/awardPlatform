import { beforeEach, expect, it, vi } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { Leaderboard } from './Leaderboard'
import type { HackathonEvent } from '../contexts/RealtimeContext'

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
const mocks = vi.hoisted(() => ({
  user: { id: 'manager', role: 'admin' }, getAllScores: vi.fn(),
  getScoreSummary: vi.fn(), getProfile: vi.fn(), getCriteria: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), connected: true,
}))
vi.mock('../hooks/useRealtime', () => ({ useRealtime: () => ({
  isConnected: mocks.connected, subscribeToHackathonUpdates: mocks.subscribe,
}) }))
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user: mocks.user }) }))
vi.mock('../services/ideaService', () => ({ IdeaService: { getIdeas: async () => ({ content: [
  { id: 'value', title: 'Value nominee', category: 'Digital Transformation', tags: [] },
  { id: 'innovation', title: 'Innovation nominee', category: 'Innovation Breakthrough', tags: [] },
  { id: 'collaboration', title: 'Collaboration nominee', category: 'Collaboration to Win', tags: [] },
  { id: 'tie', title: 'Tied nominee', category: 'Customer Values', tags: [] },
  { id: 'unscored', title: 'Unscored nominee', category: 'Customer Values', tags: [] },
  { id: 'team', title: 'Team initiative', category: 'Collaboration to Win', tags: [],
    projectAttachments: [{ type: 'nomination', nominationType: 'team', name: 'Example Lead', nomineeOrgCode: 'BD/DEV-ONE' }] },
], totalPages: 1 }) } }))
vi.mock('../services/judgingService', () => ({ JudgingService: {
  getAllScores: mocks.getAllScores,
  getJudges: async () => [{ userId: 'judge-1', name: 'Completed Judge' }, { userId: 'judge-2', name: 'Partial Judge' }],
  getScoreSummary: mocks.getScoreSummary,
} }))
vi.mock('../services/profileService', () => ({ ProfileService: { getProfile: mocks.getProfile } }))
vi.mock('../services/votingService', () => ({ VotingService: { getCriteria: mocks.getCriteria } }))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = () => <MantineProvider env="test"><QueryClientProvider client={client}><MemoryRouter><Leaderboard hackathonId="award-1" /></MemoryRouter></QueryClientProvider></MantineProvider>
  const result = render(view())
  return { ...result, rerender: () => result.rerender(view()) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.connected = true
  mocks.subscribe.mockReturnValue(mocks.unsubscribe)
  mocks.user.role = 'admin'
  mocks.getScoreSummary.mockResolvedValue([
    { ideaId: 'value', ideaTitle: 'Value nominee', panelScore: 7.1, judgeCount: 1, voteCount: 20 },
    { ideaId: 'innovation', ideaTitle: 'Innovation nominee', panelScore: 9, judgeCount: 1, voteCount: 2 },
    { ideaId: 'collaboration', ideaTitle: 'Collaboration nominee', panelScore: 6, judgeCount: 1, voteCount: 4 },
    { ideaId: 'tie', ideaTitle: 'Tied nominee', panelScore: 7.1, judgeCount: 1, voteCount: 0 },
    { ideaId: 'unscored', ideaTitle: 'Unscored nominee', panelScore: 0, judgeCount: 0, voteCount: 100 },
    { ideaId: 'team', ideaTitle: 'Team initiative', panelScore: 4.2, judgeCount: 1, voteCount: 17 },
  ])
  mocks.getCriteria.mockResolvedValue([
    { id: 'behavior', name: 'Behavior Demonstration', weight: 70 },
    { id: 'impact', name: 'Business Impact', weight: 30 },
  ])
  mocks.getProfile.mockResolvedValue({ name: 'Example HoD' })
  mocks.getAllScores.mockResolvedValue([
    { ideaId: 'value', judgeId: 'judge-1', criterionId: 'behavior', score: 8, comment: 'Verified impact' },
    { ideaId: 'value', judgeId: 'judge-1', criterionId: 'impact', score: 5 },
    { ideaId: 'value', judgeId: 'judge-2', criterionId: 'behavior', score: 10 },
  ])
})

it('keeps each track separate with independent ranks, ties and unscored nominations', async () => {
  show()
  const values = await screen.findByRole('region', { name: 'Customer Values' })
  expect(screen.getByRole('button', { name: 'Team' })).toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Completed judges' })).not.toBeInTheDocument()
  expect(within(values).getAllByText('#1')).toHaveLength(2)
  expect(within(values).getByText('Value nominee')).toBeInTheDocument()
  expect(within(values).queryByText('Innovation nominee')).not.toBeInTheDocument()
  expect(within(values).getByText('—')).toBeInTheDocument()
  for (const [track, title] of [['Innovation Breakthrough', 'Innovation nominee'], ['Collaboration to Win', 'Collaboration nominee']]) {
    const region = screen.getByRole('region', { name: track })
    expect(within(region).getByText('#1')).toBeInTheDocument()
    expect(within(region).getByText(title)).toBeInTheDocument()
    expect(within(region).queryByText('Value nominee')).not.toBeInTheDocument()
  }
})

it('expands and collapses criterion scores from the total and keeps partial evaluations incomplete', async () => {
  const user = userEvent.setup()
  show()
  const row = (await screen.findByText('Value nominee')).closest('tr')!
  const total = within(row).getByRole('button', { name: '7.10' })
  expect(total).toHaveAttribute('aria-expanded', 'false')
  await user.click(total)
  const details = await screen.findByRole('region', { name: 'Committee ratings · Value nominee' })
  expect(within(details).getByText('Behavior Demonstration (70%)')).toBeInTheDocument()
  expect(within(details).getByText('Business Impact (30%)')).toBeInTheDocument()
  expect(within(details).getByText('8')).toBeInTheDocument()
  expect(within(details).getByText('5')).toBeInTheDocument()
  expect(within(details).getByText('7.10')).toBeInTheDocument()
  expect(within(details).getByText('Incomplete')).toBeInTheDocument()
  expect(within(details).getByText('Pending')).toBeInTheDocument()
  await user.click(total)
  expect(screen.queryByRole('region', { name: 'Committee ratings · Value nominee' })).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: 'Ratings' })).not.toBeInTheDocument()
})

it('shows detail loading errors without hiding the ranking', async () => {
  mocks.getAllScores.mockRejectedValue(new Error('Unavailable'))
  show()
  const row = (await screen.findByText('Value nominee')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '7.10' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to load individual ratings'))
  expect(screen.getByRole('region', { name: 'Innovation Breakthrough' })).toBeInTheDocument()
})

it('keeps rankings restricted to managers', () => {
  mocks.user.role = 'participant'
  show()
  expect(screen.getByText('Manager Access Required')).toBeInTheDocument()
  expect(screen.queryByText('Committee Ranking')).not.toBeInTheDocument()
  expect(mocks.subscribe).not.toHaveBeenCalled()
})

it('refreshes the average, rank and open details when another judge submits', async () => {
  const { unmount } = show()
  const row = (await screen.findByText('Value nominee')).closest('tr')!
  await userEvent.click(within(row).getByRole('button', { name: '7.10' }))
  const onUpdate = mocks.subscribe.mock.calls[0][1] as (event: HackathonEvent) => void
  expect(mocks.subscribe.mock.calls[0][0]).toBe('award-1')
  mocks.getScoreSummary.mockResolvedValue([
    { ideaId: 'value', ideaTitle: 'Value nominee', panelScore: 6.5, judgeCount: 2, voteCount: 20 },
    { ideaId: 'tie', ideaTitle: 'Tied nominee', panelScore: 7.1, judgeCount: 1, voteCount: 0 },
  ])
  mocks.getAllScores.mockResolvedValue([
    { ideaId: 'value', judgeId: 'judge-1', criterionId: 'behavior', score: 6 },
    { ideaId: 'value', judgeId: 'judge-1', criterionId: 'impact', score: 6 },
    { ideaId: 'value', judgeId: 'judge-2', criterionId: 'behavior', score: 7 },
    { ideaId: 'value', judgeId: 'judge-2', criterionId: 'impact', score: 7 },
  ])
  act(() => onUpdate({ event: 'JUDGE_SCORES_UPDATED', ideaId: 'value' }))
  await waitFor(() => expect(within(row).getByRole('button', { name: '6.50' })).toHaveAttribute('aria-expanded', 'true'))
  expect(within(row).getByText('#2')).toBeInTheDocument()
  expect(within(row).getByText('20')).toBeInTheDocument()
  const details = screen.getByRole('region', { name: 'Committee ratings · Value nominee' })
  await waitFor(() => expect(within(details).queryByText('Incomplete')).not.toBeInTheDocument())
  for (const [name, score] of [['Completed Judge', '6'], ['Partial Judge', '7']]) {
    const judgeRow = within(details).getByText(name).closest('tr')!
    expect(within(judgeRow).getAllByText(score)).toHaveLength(2)
    expect(within(judgeRow).getByText(`${score}.00`)).toBeInTheDocument()
  }
  mocks.getScoreSummary.mockResolvedValue([
    { ideaId: 'value', ideaTitle: 'Value nominee', panelScore: 7, judgeCount: 3, voteCount: 20 },
  ])
  act(() => onUpdate({ event: 'JUDGE_SCORES_UPDATED', ideaId: 'value' }))
  await waitFor(() => expect(within(row).getByRole('button', { name: '7.00' })).toBeInTheDocument())
  unmount()
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
})

it('resubscribes and retrieves missed scores after reconnecting', async () => {
  const { rerender } = show()
  await screen.findByText('Value nominee')
  mocks.connected = false
  rerender()
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  mocks.getScoreSummary.mockResolvedValue([
    { ideaId: 'value', ideaTitle: 'Value nominee', panelScore: 8, judgeCount: 2, voteCount: 20 },
  ])
  mocks.connected = true
  rerender()
  await screen.findByRole('button', { name: '8.00' })
  expect(mocks.subscribe).toHaveBeenCalledTimes(2)
})

it('does not fetch individual ratings until a row is expanded', async () => {
  show()
  const row = (await screen.findByText('Value nominee')).closest('tr')!
  expect(mocks.getAllScores).not.toHaveBeenCalled()
  await userEvent.click(within(row).getByRole('button', { name: '7.10' }))
  await waitFor(() => expect(mocks.getAllScores).toHaveBeenCalledTimes(1))
})

it('uses the Team rubric for expanded scores and resolves the HoD name and comments', async () => {
  mocks.getCriteria.mockResolvedValue([
    { id: 'one', name: 'DPA track criterion 1', weight: 40 },
    { id: 'two', name: 'DPA track criterion 2', weight: 30 },
    { id: 'three', name: 'DPA track criterion 3', weight: 30 },
  ])
  mocks.getAllScores.mockResolvedValue(
    [7, 4, 2].map((score, index) => ({
      ideaId: 'team', judgeId: 'hod-1', criterionId: ['one', 'two', 'three'][index], score,
      comment: 'Recommendation: Recommend\n\nJoint outcome',
    })),
  )
  const user = userEvent.setup()
  show()
  await screen.findByText('Collaboration nominee')
  await user.click(screen.getByRole('button', { name: 'Team' }))
  expect(screen.queryByText('Collaboration nominee')).not.toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Search nominees' }), 'Example Lead')
  const row = screen.getByText('Team initiative').closest('tr')!
  await user.click(within(row).getByRole('button', { name: '4.20' }))
  const details = within(await screen.findByRole('region', { name: 'Committee ratings · Team initiative' }))
  const memberRow = (await details.findByText('Example HoD')).closest('tr')!
  expect(details.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    'Committee / HoD member', 'Weighted total / 10', 'Cross-Functional Synergy (30%)',
    'Shared Goals & Decision Speed (35%)', 'Win-as-a-Team Culture (35%)', 'Comments',
  ])
  expect(within(memberRow).getByText('4.20')).toBeInTheDocument()
  expect(within(memberRow).getByText('Joint outcome')).toBeInTheDocument()
  expect(within(memberRow).queryByText(/Recommendation:/)).not.toBeInTheDocument()
})

it('exports the visible ranking and its current column headers', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ranking')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  try {
    show()
    await screen.findByText('Value nominee')
    await userEvent.click(screen.getByRole('button', { name: 'Team' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    const blob = create.mock.calls[0][0]
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    expect(csv.split('\n')).toEqual([
      '"Rank","Nomination","Category","Committee total / 10","Associate votes"',
      '"1","Team initiative","Collaboration to Win","4.20","17"',
    ])
  } finally {
    create.mockRestore()
    revoke.mockRestore()
    click.mockRestore()
  }
})

it('coalesces a burst of rating notifications into one refresh', async () => {
  show()
  await screen.findByText('Value nominee')
  const before = mocks.getScoreSummary.mock.calls.length
  const onUpdate = mocks.subscribe.mock.calls[0][1] as (event: HackathonEvent) => void
  act(() => {
    for (let i = 0; i < 5; i++) onUpdate({ event: 'JUDGE_SCORES_UPDATED', ideaId: 'value' })
  })
  await waitFor(() => expect(mocks.getScoreSummary).toHaveBeenCalledTimes(before + 1))
  expect(mocks.getAllScores).not.toHaveBeenCalled()
})
