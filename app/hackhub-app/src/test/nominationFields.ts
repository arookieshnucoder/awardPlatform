import { fireEvent } from '@testing-library/react'

export function setNominationField(field: HTMLElement, value: string) {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    fireEvent.change(field, { target: { value } })
  } else {
    field.textContent = value
    fireEvent.input(field)
  }
}

export function nominationFieldValue(field: HTMLElement) {
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.value : field.textContent
}
