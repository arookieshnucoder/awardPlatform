import { useEffect, useState, type ReactNode } from 'react'
import { LoadingOverlay } from '@mantine/core'
import { Navigate, useParams } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { useAuthStore } from '../store/authStore'

type Access = { canManage: boolean; canReview: boolean }

export function HackathonAccess({ children, permission = 'canManage' }: { children: ReactNode; permission?: keyof Access }) {
  const { id, hackathonId } = useParams()
  const campaignId = id ?? hackathonId
  const userId = useAuthStore((state) => state.user?.id)
  const requestKey = `${userId}:${campaignId}:${permission}`
  const [result, setResult] = useState<{ key: string; allowed: boolean } | null>(null)

  useEffect(() => {
    if (!userId || !campaignId) return
    let active = true
    void api.get<Access>(`/api/v1/hackathons/${campaignId}/access`)
      .then((access) => { if (active) setResult({ key: requestKey, allowed: access[permission] === true }) })
      .catch(() => { if (active) setResult({ key: requestKey, allowed: false }) })
    return () => { active = false }
  }, [userId, campaignId, permission, requestKey])

  if (!userId || !campaignId) return <Navigate to="/projects" replace />
  if (result?.key !== requestKey) return <LoadingOverlay visible />
  return result.allowed ? children : <Navigate to="/projects" replace />
}
