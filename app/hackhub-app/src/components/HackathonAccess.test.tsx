import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HackathonAccess } from './HackathonAccess'

const { get, loadData, state } = vi.hoisted(() => ({
  get: vi.fn(), loadData: vi.fn(), state: { user: { id: 'manager' } },
}))
vi.mock('../lib/apiClient', () => ({ api: { get } }))
vi.mock('../store/authStore', () => ({ useAuthStore: (select: (s: typeof state) => unknown) => select(state) }))

function ProtectedPage() {
  useEffect(() => { loadData() }, [])
  return <div>Protected editor</div>
}

function renderPage(permission: 'canManage' | 'canReview' = 'canManage') {
  return render(<MantineProvider env="test"><MemoryRouter initialEntries={['/hackathons/campaign/edit']}><Routes>
    <Route path="/hackathons/:id/edit" element={<HackathonAccess permission={permission}><ProtectedPage /></HackathonAccess>} />
    <Route path="/projects" element={<div>Projects</div>} />
  </Routes></MemoryRouter></MantineProvider>)
}

beforeEach(() => { vi.clearAllMocks(); state.user = { id: 'manager' } })

describe('resource access before page mounting', () => {
  it('does not mount or load business data while permission is pending, then allows an authorized editor', async () => {
    let resolve!: (access: { canManage: boolean }) => void
    get.mockImplementation(() => new Promise((done) => { resolve = done }))
    renderPage()
    expect(loadData).not.toHaveBeenCalled()
    expect(screen.queryByText('Protected editor')).not.toBeInTheDocument()
    await act(async () => resolve({ canManage: true }))
    expect(await screen.findByText('Protected editor')).toBeInTheDocument()
    expect(loadData).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/api/v1/hackathons/campaign/access')
  })

  it.each(['denied', 'error'])('never loads business data when permission is %s', async (reason) => {
    if (reason === 'error') get.mockRejectedValue(new Error('Unavailable'))
    else get.mockResolvedValue({ canManage: false })
    renderPage()
    expect(await screen.findByText('Projects')).toBeInTheDocument()
    expect(loadData).not.toHaveBeenCalled()
  })

  it('uses the campaign review decision independently of management access', async () => {
    get.mockResolvedValue({ canManage: false, canReview: true })
    renderPage('canReview')
    expect(await screen.findByText('Protected editor')).toBeInTheDocument()
  })

  it('does not reuse permission after switching accounts', async () => {
    get.mockResolvedValueOnce({ canManage: true }).mockImplementation(() => new Promise(() => {}))
    const view = renderPage()
    await screen.findByText('Protected editor')
    state.user = { id: 'other-manager' }
    view.rerender(<MantineProvider env="test"><MemoryRouter><Routes>
      <Route path="/hackathons/:id/edit" element={<HackathonAccess><ProtectedPage /></HackathonAccess>} />
    </Routes></MemoryRouter></MantineProvider>)
    expect(screen.queryByText('Protected editor')).not.toBeInTheDocument()
    expect(loadData).toHaveBeenCalledTimes(1)
  })
})
