import { ActionIcon, Group, Input, Text, Title } from '@mantine/core'
import { IconBold, IconItalic, IconList, IconListNumbers, IconUnderline } from '@tabler/icons-react'
import { Fragment, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  answerText, individualAnswerHeadings, plainAnswer, readNominationAnswer, teamAnswerHeadings,
  type FormattedAnswers, type NominationAnswer, type NominationLine, type NominationRun,
} from '../../lib/nominationFormatting'

const marks = [['bold', 'strong'], ['italic', 'em'], ['underline', 'u']] as const
const tools = [
  ['bold', 'Bold', IconBold],
  ['italic', 'Italic', IconItalic],
  ['underline', 'Underline', IconUnderline],
  ['insertUnorderedList', 'Bullet list', IconList],
  ['insertOrderedList', 'Numbered list', IconListNumbers],
] as const

function groupLines(answer: NominationAnswer) {
  const groups: { list?: NominationLine['list']; lines: NominationLine[] }[] = []
  for (const line of answer) {
    const previous = groups.at(-1)
    if (line.list && previous?.list === line.list) previous.lines.push(line)
    else groups.push({ list: line.list, lines: [line] })
  }
  return groups
}

function fillEditor(editor: HTMLElement, answer: NominationAnswer) {
  const document = editor.ownerDocument
  const fragment = document.createDocumentFragment()
  for (const { list, lines } of groupLines(answer)) {
    const parent = list ? document.createElement(list === 'bullet' ? 'ul' : 'ol') : fragment
    for (const line of lines) {
      const block = document.createElement(list ? 'li' : 'div')
      for (const run of line.runs) {
        let node: Node = document.createTextNode(run.text)
        for (const [mark, tag] of marks) {
          if (!run[mark]) continue
          const element = document.createElement(tag)
          element.append(node)
          node = element
        }
        block.append(node)
      }
      if (!block.hasChildNodes()) block.append(document.createElement('br'))
      parent.append(block)
    }
    if (list) fragment.append(parent)
  }
  editor.replaceChildren(fragment)
}

interface AnswerEditorProps {
  label: ReactNode
  value: string
  format?: NominationAnswer
  onChange: (value: string, format?: NominationAnswer) => void
  placeholder: string
  minRows?: number
  maxLength?: number
  error?: string
  disabled?: boolean
}

export function NominationAnswerEditor({
  label, value, format, onChange, placeholder, minRows = 4, maxLength, error, disabled,
}: AnswerEditorProps) {
  const id = useId()
  const editor = useRef<HTMLDivElement>(null)
  const savedSelection = useRef<Range | null>(null)
  const rendered = useRef<{ value: string; format?: NominationAnswer }>(undefined)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    if (rendered.current?.value === value && rendered.current.format === format) return
    if (editor.current) fillEditor(editor.current, format ?? (value ? plainAnswer(value) : []))
    rendered.current = { value, format }
    savedSelection.current = null
  }, [value, format])

  function rememberSelection() {
    const selection = editor.current?.ownerDocument.getSelection()
    if (selection?.rangeCount && editor.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      savedSelection.current = selection.getRangeAt(0).cloneRange()
    }
  }

  function update() {
    if (!editor.current) return
    const answer = readNominationAnswer(editor.current)
    const nextValue = answerText(answer)
    if (maxLength !== undefined && nextValue.length > maxLength) {
      const previous = rendered.current
      fillEditor(editor.current, previous?.format ?? plainAnswer(previous?.value ?? ''))
      savedSelection.current = null
      const selection = editor.current.ownerDocument.getSelection()
      selection?.selectAllChildren(editor.current)
      selection?.collapseToEnd()
      return
    }
    const nextFormat = answer.some(({ list, runs }) => list || runs.some(({ bold, italic, underline }) => bold || italic || underline))
      ? answer : undefined
    rendered.current = { value: nextValue, format: nextFormat }
    onChange(nextValue, nextFormat)
    rememberSelection()
  }

  function formatSelection(command: typeof tools[number][0]) {
    const field = editor.current
    if (!field) return
    const selection = field.ownerDocument.getSelection()
    const range = savedSelection.current
    field.focus()
    if (range && field.contains(range.commonAncestorContainer)) {
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    field.ownerDocument.execCommand(command)
    update()
  }

  return <Input.Wrapper label={label} labelProps={{ id: `${id}-label`, onClick: () => { if (!disabled) editor.current?.focus() } }}
    required error={error} errorProps={{ id: `${id}-error` }} id={id}>
    <div onFocus={() => setFocused(true)} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
    }}>
      {focused && !disabled && <Group gap={2} className="dp-answer-toolbar" role="toolbar" aria-label="Text formatting">
        {tools.map(([command, name, Icon]) => <ActionIcon
          key={command} type="button" variant="subtle" color="gray" aria-label={name} title={name}
          onMouseDown={(event) => { rememberSelection(); event.preventDefault() }}
          onClick={() => formatSelection(command)}
        ><Icon size={18} /></ActionIcon>)}
      </Group>}
      <div ref={editor} id={id} role="textbox" aria-labelledby={`${id}-label`} aria-multiline="true"
        aria-required="true" aria-invalid={Boolean(error)} aria-disabled={disabled}
        aria-describedby={error ? `${id}-error` : undefined} aria-placeholder={placeholder}
        contentEditable={!disabled} tabIndex={disabled ? -1 : 0}
        className="dp-answer-editor mantine-Input-input" data-empty={!value && !format} data-placeholder={placeholder}
        style={{ minHeight: `${minRows * 1.55 + 1.2}em` }}
        onInput={update} onSelect={rememberSelection} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
        onPaste={(event) => {
          event.preventDefault()
          const clipboardText = event.clipboardData.getData('text/plain').replace(/\r\n/g, '\n')
          const selectedLength = event.currentTarget.ownerDocument.getSelection()?.toString().length ?? 0
          const text = maxLength === undefined
            ? clipboardText : clipboardText.slice(0, Math.max(0, maxLength - value.length + selectedLength))
          event.currentTarget.ownerDocument.execCommand('insertText', false, text)
        }}
        onDrop={(event) => event.preventDefault()}
      />
    </div>
  </Input.Wrapper>
}

function renderRun(run: NominationRun): ReactNode {
  let text: ReactNode = run.text
  for (const [mark, Tag] of marks) if (run[mark]) text = <Tag>{text}</Tag>
  return text
}

export function NominationAnswerBody({ text, format }: { text: string; format?: NominationAnswer }) {
  if (!format) return <Text className="dp-nomination-answer">{text}</Text>
  return <div className="dp-nomination-answer">
    {groupLines(format).map(({ list, lines }, index) => {
      const renderLine = ({ runs }: NominationLine) => runs.length
        ? runs.map((run, key) => <Fragment key={key}>{renderRun(run)}</Fragment>) : <br />
      if (!list) return <div key={index}>{renderLine(lines[0])}</div>
      const List = list === 'bullet' ? 'ul' : 'ol'
      return <List key={index}>{lines.map((line, key) => <li key={key}>{renderLine(line)}</li>)}</List>
    })}
  </div>
}

export function NominationAnswerDetails({ answers, team }: { answers: FormattedAnswers; team: boolean }) {
  const headings = team ? teamAnswerHeadings : individualAnswerHeadings
  return <>{answers.map((format, index) => <section key={headings[index]}>
    <Title order={4}>{headings[index]}</Title>
    <NominationAnswerBody text={answerText(format)} format={format} />
  </section>)}</>
}
