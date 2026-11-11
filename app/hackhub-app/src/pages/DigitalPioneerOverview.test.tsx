import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { LanguageProvider } from '../contexts/LanguageContext'
import { DigitalPioneerOverview } from './DigitalPioneerOverview'

const auth = vi.hoisted(() => ({ role: 'participant' }))
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user: { role: auth.role } }) }))

beforeEach(() => { sessionStorage.clear(); auth.role = 'participant' })
afterEach(() => vi.restoreAllMocks())

describe('DigitalPioneerOverview', () => {
  it.each([
    ['participant', '2026-12-13T23:59:59+08:00', 'Voting is not open yet.'],
    ['participant', '2026-12-26T00:00:00+08:00', 'The voting period has ended.'],
    ['participant', '2026-12-25T23:59:59+08:00', null],
    ['admin', '2026-11-11T00:00:00+08:00', null],
  ])('checks the voting window before navigating for %s at %s', (role, time, message) => {
    auth.role = role
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(time))
    const notify = vi.spyOn(notifications, 'show').mockReturnValue('voting-window-test')
    render(<MemoryRouter><MantineProvider env="test"><LanguageProvider><Routes>
      <Route path="/" element={<DigitalPioneerOverview />} />
      <Route path="/projects" element={<p>Voting page</p>} />
    </Routes></LanguageProvider></MantineProvider></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Browse & Vote' }))
    if (message) {
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message }))
      expect(screen.queryByText('Voting page')).not.toBeInTheDocument()
    } else {
      expect(screen.getByText('Voting page')).toBeInTheDocument()
      expect(notify).not.toHaveBeenCalled()
    }
  })

  it('introduces the individual award and all three categories', () => {
    render(
      <MemoryRouter>
        <MantineProvider>
          <LanguageProvider>
            <DigitalPioneerOverview />
          </LanguageProvider>
        </MantineProvider>
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /Digital\s*Pioneer/ })).toBeInTheDocument()
    expect(screen.getAllByText('客户价值').length).toBeGreaterThan(0)
    expect(screen.getAllByText('创新破局').length).toBeGreaterThan(0)
    expect(screen.getAllByText('协作共赢').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Start a Nomination' }).length).toBeGreaterThan(0)
    for (const period of ['Nov.16-28', 'Nov.30-Dec.11', 'Dec.14-25', 'Jan.']) {
      expect(screen.getByText(period)).toBeInTheDocument()
    }
  })

  it('switches the exact Individual/Team criteria and carries the type to nomination', () => {
    render(<MemoryRouter><MantineProvider><LanguageProvider><DigitalPioneerOverview /></LanguageProvider></MantineProvider></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Individual', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const switchBar = screen.getByRole('button', { name: 'Team', exact: true }).parentElement!
    expect(within(switchBar).getAllByRole('button').map((button) => button.textContent)).toEqual(['Team', 'Individual'])
    expect(screen.getByText('Growing Together with Customers (30%)')).toBeVisible()
    expect(screen.getByText('Innovation Mindset (30%)')).toBeVisible()
    expect(screen.getByText('Breaking Down Silos (30%)')).toBeVisible()
    expect(screen.queryByText('Cross-Functional Synergy (30%)')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Team', exact: true }))
    expect(screen.getByText('Customer Partnership & Growth (30%)')).toBeVisible()
    expect(screen.getByText('Level of Innovation (30%)')).toBeVisible()
    expect(screen.getByText('Cross-Functional Synergy (30%)')).toBeVisible()
    expect(screen.getByText('Shared Goals & Decision Speed (35%)')).toBeVisible()
    expect(screen.getByText('Win-as-a-Team Culture (35%)')).toBeVisible()
    expect(screen.queryByText('Breaking Down Silos (30%)')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a Nomination' })).toHaveAttribute('href', '/nominate?type=team')
    expect(sessionStorage.getItem('award-nomination-type')).toBe('team')
    fireEvent.click(screen.getByRole('button', { name: 'Individual', exact: true }))
    expect(screen.getByText('Promoting Joint Success (35%)')).toBeVisible()
    expect(screen.queryByText('Win-as-a-Team Culture (35%)')).not.toBeInTheDocument()
  })
})
