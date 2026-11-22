import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { HackathonService, type Hackathon } from '../services/hackathonService'
import { JudgingService, type HackathonJudge } from '../services/judgingService'
import { api } from '../lib/apiClient'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render as renderView, screen, within, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AwardManagement } from './AwardManagement'

const render = (ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => {
  return renderView(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

Element.prototype.scrollIntoView = vi.fn()

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

const { user } = vi.hoisted(() => ({ user: { id: 'judge-1', role: 'participant' as 'participant' | 'admin' } }))
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user }) }))
vi.mock('../services/hackathonService', () => ({ HackathonService: { transitionStatus: vi.fn(), deleteHackathon: vi.fn().mockResolvedValue(undefined), getHackathons: vi.fn().mockResolvedValue({ content: [
  { id: 'award-1', title: 'Assigned award', startDate: '2026-10-19', endDate: '2026-11-30', status: 'running' },
  { id: 'award-2', title: 'Other award', startDate: '2026-10-19', endDate: '2026-11-30', status: 'running' },
] }) } }))
vi.mock('../services/judgingService', () => ({ JudgingService: { inviteJudge: vi.fn(), removeJudge: vi.fn().mockResolvedValue(undefined), getScoreSummary: vi.fn().mockResolvedValue([{ ideaId: 'value-1', ideaTitle: 'Value nominee', panelScore: 8, judgeCount: 1, voteCount: 3 }]), getJudges: vi.fn(async (id: string) => id === 'award-1' ? [{ id: 'assignment-1', userId: 'judge-1', name: 'Assigned Judge' }] : []) } }))
vi.mock('../lib/apiClient', () => ({ api: { get: vi.fn(async (path: string) => path.endsWith('/judge-assignments') ? ['award-1'] : { content: [] }) } }))
vi.mock('../components/VotingCriteriaManager', () => ({ VotingCriteriaManager: () => <div>Official evaluation criteria</div> }))

const show = (path: string, client?: QueryClient) => render(<MantineProvider env="test"><MemoryRouter initialEntries={[path]}><Routes><Route path="/awards" element={<AwardManagement />} /><Route path="/awards/:id" element={<AwardManagement />} /></Routes></MemoryRouter></MantineProvider>, client)

beforeEach(() => vi.clearAllMocks())

describe('AwardManagement', () => {

  it('shows committee associates only their assigned campaigns and no admin voting settings', async () => {
    show('/awards')
    expect(await screen.findByText('Assigned award')).toBeInTheDocument()
    expect(screen.queryByText('Other award')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Committee scoring' })).toHaveAttribute('href', '/hackathons/award-1/judge')
    expect(screen.queryByText(/Associate voting: 4 votes/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create award campaign' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete award' })).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/v1/profiles/me/judge-assignments')
    expect(JudgingService.getJudges).not.toHaveBeenCalled()
  })

  it('opens management from the award title without a separate settings button', async () => {
    user.role = 'admin'
    try {
      show('/awards')
      expect(await screen.findByRole('link', { name: 'Assigned award' })).toHaveAttribute('href', '/awards/award-1')
      expect(screen.queryByText('Campaign settings')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Other award' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete award' })).not.toBeInTheDocument()
      expect(screen.queryByText('Voting Results by Category')).not.toBeInTheDocument()
      expect(JudgingService.getJudges).not.toHaveBeenCalled()
      expect(api.get).not.toHaveBeenCalledWith('/api/v1/profiles/me/judge-assignments')
    } finally { user.role = 'participant' }
  })

  it('keeps award search usable without an accidental deletion entry point', async () => {
    user.role = 'admin'
    try {
      show('/awards')
      await screen.findByRole('link', { name: 'Assigned award' })
      const search = screen.getByRole('textbox', { name: 'Search awards' })
      await userEvent.type(search, 'Other')
      expect(screen.queryByRole('link', { name: 'Assigned award' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Other award' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete award' })).not.toBeInTheDocument()
      expect(HackathonService.deleteHackathon).not.toHaveBeenCalled()
      await userEvent.clear(search)
      expect(screen.getByRole('link', { name: 'Assigned award' })).toBeInTheDocument()
    } finally { user.role = 'participant' }
  })

  it('keeps committee assignment, rankings and department rules accessible to administrators', async () => {
    user.role = 'admin'
    try {
      show('/awards/award-1')
      expect(await screen.findByRole('heading', { name: 'Committee Members' })).toBeInTheDocument()
      expect(JudgingService.getJudges).toHaveBeenCalledExactlyOnceWith('award-1')
      expect(screen.queryByRole('link', { name: 'Edit campaign & dates' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Delete award' })).not.toBeInTheDocument()
      expect(screen.queryByText('Voting Results by Category')).not.toBeInTheDocument()
      expect(JudgingService.getScoreSummary).not.toHaveBeenCalled()
      expect(screen.getByRole('link', { name: 'Scores & rankings' })).toHaveAttribute('href', '/hackathons/award-1/leaderboard')
      expect(screen.getByText(/BD\/DPA-SRE3 → BD\/DPA/)).toBeInTheDocument()
      expect(screen.queryByText(/Maximum Team Size/)).not.toBeInTheDocument()
    } finally { user.role = 'participant' }
  })

  it('does not reveal campaigns when committee assignments cannot be loaded', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Unable to load assignments'))
    show('/awards')
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load assignments')
    expect(screen.queryByText('Assigned award')).not.toBeInTheDocument()
    expect(screen.queryByText('Other award')).not.toBeInTheDocument()
  })

})

it('loads committee candidates only when the associate selector opens', async () => {
  user.role = 'admin'
  try {
    show('/awards/award-1')
    const select = await screen.findByRole('textbox', { name: 'Assign an associate' })
    expect(api.get).not.toHaveBeenCalled()
    await userEvent.click(select)
    await waitFor(() => expect(api.get).toHaveBeenCalledExactlyOnceWith('/api/v1/admin/users?page=0&size=200&sort=name,asc'))
  } finally { user.role = 'participant' }
})


it('shows the award before a slow committee request completes', async () => {
  user.role = 'admin'
  let complete!: (judges: Awaited<ReturnType<typeof JudgingService.getJudges>>) => void
  vi.mocked(JudgingService.getJudges).mockReturnValueOnce(new Promise((resolve) => { complete = resolve }))
  try {
    show('/awards/award-1')
    expect(await screen.findByRole('heading', { name: 'Assigned award' })).toBeInTheDocument()
    expect(screen.getByText('Loading committee members…')).toBeInTheDocument()
    expect(screen.queryByText('No committee members assigned yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Assign an associate' })).toBeDisabled()
    await act(async () => complete([]))
    expect(await screen.findByText('No committee members assigned yet.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Assign an associate' })).toBeEnabled()
  } finally { user.role = 'participant' }
})

it('keeps the award visible when loading committee members fails', async () => {
  user.role = 'admin'
  vi.mocked(JudgingService.getJudges).mockRejectedValueOnce(new Error('Committee unavailable'))
  try {
    show('/awards/award-1')
    expect(await screen.findByText('Committee unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Assigned award' })).toBeInTheDocument()
    expect(screen.queryByText('No committee members assigned yet.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign committee member' })).toBeDisabled()
  } finally { user.role = 'participant' }
})

it('shows cached awards on return while refreshing newly created campaigns', async () => {
  user.role = 'admin'
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    const first = show('/awards', client)
    await screen.findByRole('link', { name: 'Assigned award' })
    first.unmount()
    let complete!: (page: Awaited<ReturnType<typeof HackathonService.getHackathons>>) => void
    vi.mocked(HackathonService.getHackathons).mockReturnValueOnce(new Promise((resolve) => { complete = resolve }))
    show('/awards', client)
    expect(screen.getByRole('link', { name: 'Assigned award' })).toBeInTheDocument()
    expect(screen.queryByText('Loading award campaigns…')).not.toBeInTheDocument()
    const cached = client.getQueryData<Hackathon[]>(['award-management-campaigns', user.id, user.role])!
    await act(async () => complete({ content: [...cached, { ...cached[0], id: 'award-3', title: 'New award' }], totalPages: 1 } as Awaited<ReturnType<typeof HackathonService.getHackathons>>))
    expect(await screen.findByRole('link', { name: 'New award' })).toBeInTheDocument()
  } finally { user.role = 'participant' }
})

it('updates the campaign cache after changing status', async () => {
  user.role = 'admin'
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    show('/awards/award-1', client)
    await screen.findByRole('heading', { name: 'Assigned award' })
    const key = ['award-management-campaigns', user.id, user.role]
    const campaign = client.getQueryData<Hackathon[]>(key)![0]
    vi.mocked(HackathonService.transitionStatus).mockResolvedValueOnce({ ...campaign, status: 'completed' })
    await userEvent.click(screen.getByRole('textbox', { name: 'Campaign status' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Completed' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Campaign status' })).toHaveValue('Completed'))
    expect(client.getQueryData<Hackathon[]>(key)![0].status).toBe('completed')
    expect(HackathonService.transitionStatus).toHaveBeenCalledExactlyOnceWith('award-1', 'completed')
  } finally { user.role = 'participant' }
})

it('does not reuse administrator campaigns after the user role changes', async () => {
  user.role = 'admin'
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    const first = show('/awards', client)
    await screen.findByRole('link', { name: 'Other award' })
    first.unmount()
    user.role = 'participant'
    show('/awards', client)
    expect(screen.queryByText('Other award')).not.toBeInTheDocument()
    await screen.findByText('Assigned award')
    expect(screen.queryByText('Other award')).not.toBeInTheDocument()
  } finally { user.role = 'participant' }
})


it('keeps committee assignment and removal reflected in the cache', async () => {
  user.role = 'admin'
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const added: HackathonJudge = { id: 'assignment-2', hackathonId: 'award-1', userId: 'judge-2', name: 'New Judge', email: 'judge@example.test', invitedAt: '2026-10-12' }
  vi.mocked(JudgingService.inviteJudge).mockResolvedValueOnce(added)
  try {
    show('/awards/award-1', client)
    await screen.findByText(/Assigned Judge/)
    vi.mocked(api.get).mockResolvedValueOnce({ content: [{ id: added.userId, name: added.name, email: added.email }] })
    await userEvent.click(screen.getByRole('textbox', { name: 'Assign an associate' }))
    await userEvent.click(await screen.findByRole('option', { name: 'New Judge (judge@example.test)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Assign committee member' }))
    const judge = await screen.findByText('New Judge · judge@example.test')
    const key = ['hackathon-judges', 'award-1', user.id, user.role]
    expect(client.getQueryData<HackathonJudge[]>(key)?.map((item) => item.userId)).toEqual(['judge-1', 'judge-2'])
    await userEvent.click(within(judge.parentElement!).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText('New Judge · judge@example.test')).not.toBeInTheDocument())
    expect(client.getQueryData<HackathonJudge[]>(key)?.map((item) => item.userId)).toEqual(['judge-1'])
    expect(JudgingService.removeJudge).toHaveBeenCalledExactlyOnceWith('award-1', 'judge-2')
  } finally { user.role = 'participant' }
})
