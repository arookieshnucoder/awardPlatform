import type { ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const { auth, moduleLoaded, eligibility } = vi.hoisted(() => ({
  auth: { user: null as { id: string; role: string } | null, initialized: false, loading: true, initialize: vi.fn() },
  moduleLoaded: vi.fn(),
  eligibility: { data: undefined as { canStartNomination: boolean } | undefined, isPending: true },
}))
vi.mock('./store/authStore', () => ({ useAuthStore: () => auth }))
vi.mock('./pages/AwardManagement', () => {
  moduleLoaded()
  return { AwardManagement: () => <div>Award page content</div> }
})
vi.mock('./pages/Login', () => ({ Login: () => <div>Employee SSO sign-in</div> }))
vi.mock('./pages/LandingPage', () => ({ LandingPage: ({ children }: { children: ReactNode }) => children }))
vi.mock('./pages/DigitalPioneerOverview', () => ({ DigitalPioneerOverview: () => <div>CN Award overview</div> }))
vi.mock('./contexts/RealtimeContext', () => ({ RealtimeProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('./hooks/useAwardAccess', () => ({ useAwardAccess: () => ({ canReview: true, loading: false }) }))
vi.mock('./hooks/useNominationEligibility', () => ({ useNominationEligibility: () => eligibility }))
vi.mock('./lib/preloadShowcase', () => ({
  loadProjectShowcase: async () => ({ default: () => <div>Candidate list</div> }),
  preloadedProjectShowcase: undefined,
  preloadProjectShowcase: vi.fn(),
}))

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

it('downloads the award page during session restoration without displaying it before authentication', async () => {
  const view = () => <MantineProvider env="test"><MemoryRouter initialEntries={['/awards']}><App /></MemoryRouter></MantineProvider>
  const rendered = render(view())
  await waitFor(() => expect(moduleLoaded).toHaveBeenCalledOnce())
  expect(auth.initialize).toHaveBeenCalledOnce()
  expect(screen.queryByText('Award page content')).not.toBeInTheDocument()
  auth.user = { id: 'admin-1', role: 'admin' }
  auth.initialized = true
  auth.loading = false
  rendered.rerender(view())
  expect(screen.getByText('Award page content')).toBeInTheDocument()
})


beforeEach(() => {
  auth.user = null
  auth.initialized = false
  auth.loading = true
  auth.initialize.mockClear()
  eligibility.data = undefined
  eligibility.isPending = true
})

it.each(['/projects', '/projects/?view=voting-records'])('protects direct access to %s until the voting roster is confirmed', async (path) => {
  auth.user = { id: 'employee-1', role: 'participant' }
  auth.initialized = true
  auth.loading = false
  const view = () => <MantineProvider env="test"><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></MantineProvider>
  const rendered = render(view())
  expect(screen.queryByText('Candidate list')).not.toBeInTheDocument()

  eligibility.data = { canStartNomination: false }
  eligibility.isPending = false
  rendered.rerender(view())
  expect(screen.getByRole('alert')).toHaveTextContent('The “Browse & Vote” section is coming soon')
  expect(screen.queryByText('Candidate list')).not.toBeInTheDocument()

  eligibility.data = { canStartNomination: true }
  rendered.rerender(view())
  expect(await screen.findByText('Candidate list')).toBeInTheDocument()
})

it('lets an administrator open Browse & Vote independently of the roster check', async () => {
  auth.user = { id: 'admin-1', role: 'admin' }
  auth.initialized = true
  auth.loading = false
  render(<MantineProvider env="test"><MemoryRouter initialEntries={['/projects']}><App /></MemoryRouter></MantineProvider>)
  expect(await screen.findByText('Candidate list')).toBeInTheDocument()
})

it.each(['/', '/login'])('restores a recent visit to %s without displaying the sign-in page', async (path) => {
  const view = () => <MantineProvider env="test"><MemoryRouter initialEntries={[path]}><CurrentPath /><App /></MemoryRouter></MantineProvider>
  const rendered = render(view())
  expect(screen.queryByText('Employee SSO sign-in')).not.toBeInTheDocument()
  auth.user = { id: 'employee-1', role: 'participant' }
  auth.initialized = true
  auth.loading = false
  rendered.rerender(view())
  expect(await screen.findByText('CN Award overview')).toBeInTheDocument()
  expect(screen.getByLabelText('Current path')).toHaveTextContent(/^\/$/)
  expect(screen.queryByText('Employee SSO sign-in')).not.toBeInTheDocument()
})

it('shows employee sign-in when the initial session check finds no valid session', async () => {
  const view = () => <MantineProvider env="test"><MemoryRouter initialEntries={['/']}><App /></MemoryRouter></MantineProvider>
  const rendered = render(view())
  expect(screen.queryByText('Employee SSO sign-in')).not.toBeInTheDocument()
  auth.initialized = true
  auth.loading = false
  rendered.rerender(view())
  expect(await screen.findByText('Employee SSO sign-in')).toBeInTheDocument()
  expect(screen.queryByText('CN Award overview')).not.toBeInTheDocument()
})
