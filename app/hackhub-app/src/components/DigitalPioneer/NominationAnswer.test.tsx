import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { NominationAnswerBody, NominationAnswerEditor } from './NominationAnswer'
import { answerText, readNominationAnswer } from '../../lib/nominationFormatting'

it('reads the three text marks and the two list types, and renders text safely', () => {
  const editor = document.createElement('div')
  editor.innerHTML = '<div><b>Bold</b> <i>italic</i> <u>underlined</u></div><ul><li>One bullet</li></ul><ol><li>First</li><li>&lt;Second&gt;</li></ol>'
  const format = readNominationAnswer(editor)
  expect(answerText(format)).toBe('Bold italic underlined\nOne bullet\nFirst\n<Second>')
  const { container } = render(<MantineProvider env="test"><NominationAnswerBody text="" format={format} /></MantineProvider>)
  expect(container.querySelector('strong')).toHaveTextContent('Bold')
  expect(container.querySelector('em')).toHaveTextContent('italic')
  expect(container.querySelector('u')).toHaveTextContent('underlined')
  expect(container.querySelector('ul li')).toHaveTextContent('One bullet')
  expect(container.querySelectorAll('ol li')).toHaveLength(2)
  expect(screen.getByText('<Second>')).toBeInTheDocument()
})

it('shows formatting controls only while working in the answer and keeps the selection content on input', () => {
  const onChange = vi.fn()
  render(<MantineProvider env="test">
    <NominationAnswerEditor label="Achievement Summary" value="" placeholder="Enter a summary" onChange={onChange} />
  </MantineProvider>)
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  const editor = screen.getByRole('textbox', { name: 'Achievement Summary' })
  fireEvent.focus(editor)
  expect(within(screen.getByRole('toolbar')).getAllByRole('button')).toHaveLength(5)
  const bold = document.createElement('b')
  bold.textContent = 'Saved formatting'
  editor.append(bold)
  fireEvent.input(editor)
  expect(onChange).toHaveBeenLastCalledWith('Saved formatting', [{ runs: [{ text: 'Saved formatting', bold: true }] }])
  fireEvent.blur(editor)
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
})
