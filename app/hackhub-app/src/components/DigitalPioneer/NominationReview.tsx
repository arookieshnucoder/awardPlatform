import { Alert, Button, Group, Modal, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { isNomineeDepartmentWarning } from '../../lib/nominationStatus'

export function NominationReview({ opened, title, busy, canSubmit, submissionError, onClose, onConfirm, children }: {
  opened: boolean
  title: string
  busy: boolean
  canSubmit: boolean
  submissionError?: string | null
  onClose: () => void
  onConfirm: () => void
  children: ReactNode
}) {
  const departmentWarning = submissionError && isNomineeDepartmentWarning(submissionError)
  return <Modal opened={opened} onClose={() => { if (!busy) onClose() }} title={title}
    size="56rem" centered closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}
    className="dp-nomination-review" classNames={{ content: 'dp-light-surface' }}>
    {children}
    {submissionError && <Alert color={departmentWarning ? 'blue' : 'red'} role="alert" mt="lg"
      styles={departmentWarning ? { message: { color: 'var(--mantine-color-blue-9)' } } : undefined}>
      {submissionError}
    </Alert>}
    <Text className="dp-nomination-review-notice" mt="lg">
      Please confirm the information above. Your nomination will then be sent to your assigned HoD for review.
    </Text>
    <Group justify="flex-end" mt="md">
      <Button variant="light" disabled={busy} onClick={onClose}>Back to Edit</Button>
      <Button loading={busy} disabled={!canSubmit || busy} onClick={onConfirm}>Confirm and Submit</Button>
    </Group>
  </Modal>
}
