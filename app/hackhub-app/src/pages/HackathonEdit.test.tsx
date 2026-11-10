import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HackathonEdit } from './HackathonEdit'

const { user, emptyCampaigns, getCampaign, updateCampaign, transitionStatus } = vi.hoisted(() => ({
  updateCampaign: vi.fn().mockResolvedValue(undefined),
  transitionStatus: vi.fn().mockResolvedValue({ id: 'award-1', status: 'open' }),
  user: { id: 'admin-1', role: 'admin' },
  emptyCampaigns: [],
  getCampaign: vi.fn().mockResolvedValue({ id: 'award-1', title: '2026 Digital Pioneer Award', description: 'Annual award', startDate: '2026-10-19T00:00:00Z', endDate: '2026-11-30T00:00:00Z', maxTeamSize: 4, allowedParticipants: 500, status: 'draft', tags: [], prizes: [], createdBy: 'admin-1' }),
}))
Element.prototype.scrollIntoView = vi.fn()
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ user }) }))
vi.mock('../store/hackathonStore', () => ({ useHackathonStore: () => ({ hackathons: emptyCampaigns, updateHackathon: updateCampaign }) }))
vi.mock('../services/hackathonService', () => ({ HackathonService: { getHackathon: getCampaign, transitionStatus } }))

describe('Campaign edit direct entry', () => {
  it('loads an award from the API when the shared campaign store is empty', async () => {
    render(<MantineProvider env="test"><MemoryRouter initialEntries={['/hackathons/award-1/edit']}><Routes><Route path="/hackathons/:id/edit" element={<HackathonEdit />} /></Routes></MemoryRouter></MantineProvider>)
    expect(await screen.findByDisplayValue('2026 Digital Pioneer Award')).toBeInTheDocument()
    expect(getCampaign).toHaveBeenCalledWith('award-1')
  })
  it('persists edited details and rules, and saves a selected valid status transition', async () => {
    const actor = userEvent.setup()
    render(<MantineProvider env="test"><MemoryRouter initialEntries={['/hackathons/award-1/edit']}><Routes><Route path="/hackathons/:id/edit" element={<HackathonEdit />} /><Route path="/awards/:id" element={<div>Management destination</div>} /></Routes></MemoryRouter></MantineProvider>)
    const title = await screen.findByDisplayValue('2026 Digital Pioneer Award')
    await actor.clear(title)
    await actor.type(title, 'Updated annual award')
    await actor.type(screen.getByRole('textbox', { name: 'Rules' }), 'Updated award rules')
    await actor.click(screen.getByRole('textbox', { name: 'Campaign status' }))
    expect(screen.queryByRole('option', { name: 'Completed' })).not.toBeInTheDocument()
    await actor.click(screen.getByRole('option', { name: 'Open' }))
    await actor.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledWith('award-1', expect.objectContaining({ title: 'Updated annual award', rules: 'Updated award rules' })))
    expect(transitionStatus).toHaveBeenCalledWith('award-1', 'open')
    expect(await screen.findByText('Management destination')).toBeInTheDocument()
  })

})
