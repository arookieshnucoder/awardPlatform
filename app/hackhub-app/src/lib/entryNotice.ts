import type { MouseEvent } from 'react'
import { notifications } from '@mantine/notifications'
import { nominationEntryNotice } from '../config/nominationWindow'

export function showEntryNotice(event: MouseEvent<HTMLAnchorElement>, message: string | null) {
  if (!message) return
  event.preventDefault()
  notifications.show({ message, color: 'orange', position: 'bottom-right', autoClose: 4000, className: 'dp-status-toast' })
}

export function checkNominationEntry(event: MouseEvent<HTMLAnchorElement>) {
  showEntryNotice(event, nominationEntryNotice())
}
