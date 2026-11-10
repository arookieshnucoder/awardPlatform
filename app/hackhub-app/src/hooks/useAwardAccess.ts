import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/apiClient'

/** Committee membership is campaign-specific; participant alone does not imply judge access. */
export function useAwardAccess() {
  const { user } = useAuthStore()
  const [assignment, setAssignment] = useState<{ userId: string; campaignIds: string[] } | null>(null)
  const canManage = user?.role === 'admin' || user?.role === 'manager'
  useEffect(() => {
    if (!user || canManage) return
    let active = true
    void api.get<string[]>('/api/v1/profiles/me/judge-assignments')
      .then((campaignIds) => { if (active) setAssignment({ userId: user.id, campaignIds }) })
      .catch(() => { if (active) setAssignment({ userId: user.id, campaignIds: [] }) })
    return () => { active = false }
  }, [user, canManage])
  const campaignIds = assignment?.userId === user?.id ? assignment?.campaignIds ?? [] : []
  return { loading: Boolean(user && !canManage && assignment?.userId !== user.id), canManage, canReview: canManage || campaignIds.length > 0, campaignIds }
}
