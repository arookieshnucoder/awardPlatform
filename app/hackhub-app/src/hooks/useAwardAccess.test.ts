import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAwardAccess } from './useAwardAccess'

const { state, getAssignments } = vi.hoisted(() => ({
  state: { user: null as { id: string; role: string } | null },
  getAssignments: vi.fn(),
}))
vi.mock('../store/authStore', () => ({ useAuthStore: () => state }))
vi.mock('../lib/apiClient', () => ({ api: { get: getAssignments } }))
beforeEach(() => {
  vi.clearAllMocks()
  state.user = null
  getAssignments.mockResolvedValue([])
})
describe('award review access', () => {
  it('does not request protected data for visitors', () => {
    const { result } = renderHook(useAwardAccess)
    expect(result.current.canReview).toBe(false)
    expect(getAssignments).not.toHaveBeenCalled()
  })
  it('does not grant committee access to an ordinary participant', async () => {
    state.user = { id: 'ordinary', role: 'participant' }
    const { result } = renderHook(useAwardAccess)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.canReview).toBe(false)
  })
  it('grants assigned judges access only to their campaigns and clears it on account change', async () => {
    state.user = { id: 'judge', role: 'participant' }
    getAssignments.mockResolvedValueOnce(['assigned'])
    const { result, rerender } = renderHook(useAwardAccess)
    await waitFor(() => expect(result.current.canReview).toBe(true))
    expect(result.current.campaignIds).toEqual(['assigned'])
    expect(result.current.canManage).toBe(false)
    state.user = { id: 'ordinary', role: 'participant' }
    rerender()
    expect(result.current.canReview).toBe(false)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.campaignIds).toEqual([])
  })
  it('keeps administrators able to manage and review', () => {
    state.user = { id: 'admin', role: 'admin' }
    const { result } = renderHook(useAwardAccess)
    expect(result.current).toMatchObject({ canManage: true, canReview: true, loading: false })
  })
})
