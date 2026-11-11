import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { LandingPage } from './LandingPage'

const state = vi.hoisted(() => ({ user: null as null | { id: string; name: string; email?: string; role: string }, judge: false, onVotingRoster: true }))
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user: state.user, logout: vi.fn() }) }))
vi.mock('../hooks/useAwardAccess', () => ({ useAwardAccess: () => ({ canReview: state.user?.role === 'admin' || state.judge, canManage: state.user?.role === 'admin' }) }))
vi.mock('../hooks/useTechBackground', () => ({ useTechBackground: vi.fn() }))
vi.mock('../hooks/useNominationEligibility', () => ({ useNominationEligibility: () => ({ data: { canSubmit: true, canReview: false, canStartNomination: state.onVotingRoster } }) }))

const renderPage = (path = '/') => render(<MantineProvider env="test"><MemoryRouter initialEntries={[path]}><LandingPage><p>Original overview content</p></LandingPage></MemoryRouter></MantineProvider>)

beforeEach(() => {
  state.user = null
  state.judge = false
  state.onVotingRoster = true
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-30T00:00:00+08:00'))
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('LandingPage', () => {
  it.each(['Main navigation', 'Mobile navigation'])('blocks a roster outsider at the %s entry during voting', (navigation) => {
    state.user = { id: 'outsider', name: 'Associate', role: 'participant' }
    state.onVotingRoster = false
    const notify = vi.spyOn(notifications, 'show').mockReturnValue('voting-access-test')
    function CurrentPage() { return <p>Page {useLocation().pathname}</p> }
    render(<MantineProvider env="test"><MemoryRouter><LandingPage><CurrentPage /></LandingPage></MemoryRouter></MantineProvider>)
    if (navigation === 'Mobile navigation') fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    fireEvent.click(within(screen.getByRole('navigation', { name: navigation })).getByRole('link', { name: 'Browse & Vote' }))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'The “Browse & Vote” section is coming soon' }))
    expect(screen.getByText('Page /')).toBeInTheDocument()
  })

  it.each([
    ['participant', '2026-11-29T15:59:59.999Z', 'The “Browse & Vote” section is coming soon'],
    ['participant', '2026-11-29T16:00:00Z', null],
    ['manager', '2026-12-11T15:59:59.999Z', null],
    ['manager', '2026-12-11T16:00:00Z', 'The voting period has ended.'],
    ['admin', '2026-11-11T00:00:00Z', null],
    ['admin', '2026-12-26T00:00:00Z', null],
  ])('shows the voting link for %s at %s and checks access on click', (role, time, message) => {
    state.user = { id: 'u1', name: 'Associate', role }
    vi.mocked(Date.now).mockReturnValue(Date.parse(time))
    const notify = vi.spyOn(notifications, 'show').mockReturnValue('voting-window-test')
    function CurrentPage() { return <p>Page {useLocation().pathname}</p> }
    render(<MantineProvider env="test"><MemoryRouter><LandingPage><CurrentPage /></LandingPage></MemoryRouter></MantineProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    for (const navigation of ['Main navigation', 'Mobile navigation']) {
      const menu = within(screen.getByRole('navigation', { name: navigation }))
      expect(menu.getByRole('link', { name: 'Browse & Vote' })).toBeInTheDocument()
      expect(menu.getByRole('link', { name: 'Nomination' })).toBeInTheDocument()
    }
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Browse & Vote' }))
    if (message) {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message }))
      expect(screen.getByText('Page /')).toBeInTheDocument()
    } else {
      expect(notify).not.toHaveBeenCalled()
      expect(screen.getByText('Page /projects')).toBeInTheDocument()
    }
  })

  it('opens all three sections without a login gate and embeds overview below the hero', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/#overview')
    expect(screen.getByRole('link', { name: 'Nomination' })).toHaveAttribute('href', '/nominate?type=individual')
    expect(screen.getByRole('link', { name: 'Browse & Vote' })).toHaveAttribute('href', '/projects')
    expect(screen.getByRole('link', { name: /Get Started/ })).toHaveAttribute('href', '/#overview')
    fireEvent.click(screen.getByRole('link', { name: /Get Started/ }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
    expect(screen.getByText('Original overview content').closest('main')).toHaveAttribute('id', 'overview')
    expect(screen.queryByRole('link', { name: /Sign in/ })).not.toBeInTheDocument()
  })

  it('marks the selected module and hides the home hero on module routes', () => {
    renderPage('/projects')
    expect(screen.getByRole('link', { name: 'Browse & Vote' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('heading', { name: '2026 BDCN Digital Pioneer Award' })).not.toBeInTheDocument()
  })

  it('uses the full sign-in email for the account display without changing the profile name', () => {
    state.user = { id: 'u1', name: 'Lynette', email: 'Lynette.LI@cn.bosch.com', role: 'participant' }
    renderPage('/projects')
    expect(screen.getByRole('button', { name: 'Lynette.LI@cn.bosch.com' })).toHaveTextContent('Lynette.LI@cn.bosch.com')
    expect(screen.queryByText('Lynette', { exact: true })).not.toBeInTheDocument()
    expect(state.user.name).toBe('Lynette')
  })

  it.each([
    ['manager', false, false], ['participant', false, false], ['participant', true, true], ['admin', false, true],
  ])('shows review access for role %s with assignment %s', async (role, judge, visible) => {
    state.user = { id: 'u1', name: 'Associate', role }
    state.judge = judge
    renderPage()
    expect(screen.queryByRole('button', { name: /Switch to Chinese|切换到英文/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Associate' }))
    expect(await screen.findByRole('menuitem', { name: 'My voting records' })).toHaveAttribute('href', '/projects?view=voting-records')
    await waitFor(() => expect(Boolean(screen.queryByRole('menuitem', { name: /Award management|Committee scoring/ }))).toBe(visible))
    await waitFor(() => expect(Boolean(screen.queryByRole('menuitem', { name: 'Manage Users' }))).toBe(role === 'admin'))
    expect(Boolean(screen.queryByRole('menuitem', { name: 'Manage nominees' }))).toBe(role === 'admin')
    if (role === 'admin') expect(screen.getByRole('menuitem', { name: 'Manage nominees' })).toHaveAttribute('href', '/admin/nominees')
  })

  it('retains the reference background with immediate poster and loaded video', () => {
    const { container } = renderPage()
    const video = container.querySelector('video')!
    expect(video).toHaveAttribute('poster', '/media/tech-blue-poster.jpg')
    expect(video.querySelector('source')).toHaveAttribute('src', '/media/tech-blue-loop.mp4')
    fireEvent.loadedData(video)
    expect(video).toHaveClass('is-ready')
    expect(container.querySelector('.award-landing__program-mark')).not.toBeInTheDocument()
  })

  it('opens and closes mobile navigation', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
  })
})
