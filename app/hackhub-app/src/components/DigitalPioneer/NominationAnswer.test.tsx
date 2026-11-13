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
  expect(within(screen.getByRole('toolbar')).getAllByRole('button')).toHaveLength(6)
  const bold = document.createElement('b')
  bold.textContent = 'Saved formatting'
  editor.append(bold)
  fireEvent.input(editor)
  expect(onChange).toHaveBeenLastCalledWith('Saved formatting', [{ runs: [{ text: 'Saved formatting', bold: true }] }])
  fireEvent.blur(editor)
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
})

it('creates editable cells and restores a pasted table with formatting in the preview', () => {
  const onChange = vi.fn()
  render(<MantineProvider env="test">
    <NominationAnswerEditor label="Answer" value="" placeholder="Enter an answer" onChange={onChange} />
  </MantineProvider>)
  const editor = screen.getByRole('textbox', { name: 'Answer' })
  fireEvent.focus(editor)
  fireEvent.click(screen.getByRole('button', { name: 'Insert table' }))
  fireEvent.click(screen.getByRole('button', { name: 'Insert', exact: true }))
  expect(editor.querySelectorAll('td')).toHaveLength(4)

  const selection = document.getSelection()!
  selection.selectAllChildren(editor)
  fireEvent.select(editor)
  fireEvent.paste(editor, { clipboardData: { getData: (type: string) => type === 'text/html'
    ? '<table><tr><td><b>Impact</b></td><td><script>ignored()</script>40%</td></tr><tr><td>Time</td><td>3 days</td></tr></table>'
    : 'Impact\t40%\nTime\t3 days' } })
  const [text, format] = onChange.mock.lastCall!
  expect(text.trim()).toBe('Impact\t40%\nTime\t3 days')
  const { container } = render(<MantineProvider env="test"><NominationAnswerBody text={text} format={format} /></MantineProvider>)
  expect(container.querySelectorAll('td')).toHaveLength(4)
  expect(container.querySelector('td strong')).toHaveTextContent('Impact')
  expect(container.querySelector('script')).toBeNull()
})
