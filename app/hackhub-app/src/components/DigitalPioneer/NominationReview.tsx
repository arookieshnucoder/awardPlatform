import { Button, Group, Modal, Text } from '@mantine/core'
import type { ReactNode } from 'react'

export function NominationReview({ opened, title, busy, canSubmit, onClose, onConfirm, children }: {
  opened: boolean
  title: string
  busy: boolean
  canSubmit: boolean
  onClose: () => void
  onConfirm: () => void
  children: ReactNode
}) {
  return <Modal opened={opened} onClose={() => { if (!busy) onClose() }} title={title}
    size="56rem" centered closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}
    className="dp-nomination-review" classNames={{ content: 'dp-light-surface' }}>
    {children}
    <Text className="dp-nomination-review-notice" mt="lg">
      Please confirm the information above. Your nomination will then be sent to your assigned HoD for review.
    </Text>
    <Group justify="flex-end" mt="md">
      <Button variant="light" disabled={busy} onClick={onClose}>Back to Edit</Button>
      <Button loading={busy} disabled={!canSubmit || busy} onClick={onConfirm}>Confirm and Submit</Button>
    </Group>
  </Modal>
}
