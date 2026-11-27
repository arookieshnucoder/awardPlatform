import { useEffect, useState } from 'react'
import { nominationResubmissionClosesAt } from '../config/nominationWindow'

export function useNominationResubmissionClosed(enabled: boolean) {
  const [, setElapsed] = useState(false)

  useEffect(() => {
    if (!enabled || Date.now() >= nominationResubmissionClosesAt) return

    let timer: number
    const checkDeadline = () => {
      const remaining = nominationResubmissionClosesAt - Date.now()
      if (remaining <= 0) {
        setElapsed(true)
      } else {
        timer = window.setTimeout(checkDeadline, Math.min(remaining, 2_147_483_647))
      }
    }
    checkDeadline()
    return () => window.clearTimeout(timer)
  }, [enabled])

  return enabled && Date.now() >= nominationResubmissionClosesAt
}
