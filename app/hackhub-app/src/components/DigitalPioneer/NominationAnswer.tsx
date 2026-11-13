import { ActionIcon, Button, Group, Input, NumberInput, Text, Title } from '@mantine/core'
import { IconBold, IconItalic, IconList, IconListNumbers, IconTable, IconUnderline } from '@tabler/icons-react'
import { Fragment, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  answerText, individualAnswerHeadings, plainAnswer, readNominationAnswer, tableLimits, teamAnswerHeadings,
  type FormattedAnswers, type NominationAnswer, type NominationLine, type NominationRun, type NominationTable,
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
  const groups: ({ list?: NominationLine['list']; lines: NominationLine[] } | NominationTable)[] = []
  for (const line of answer) {
    if ('table' in line) {
      groups.push(line)
      continue
    }
    const previous = groups.at(-1)
    if (line.list && previous && 'lines' in previous && previous.list === line.list) previous.lines.push(line)
    else groups.push({ list: line.list, lines: [line] })
  }
  return groups
}

function answerNodes(document: Document, answer: NominationAnswer): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const group of groupLines(answer)) {
    if ('table' in group) {
      const table = document.createElement('table')
      const body = table.createTBody()
      for (const row of group.table) {
        const tr = body.insertRow()
        for (const cell of row) {
          const td = tr.insertCell()
          td.append(cell.length ? answerNodes(document, cell) : document.createElement('br'))
        }
      }
      fragment.append(table)
      continue
    }
    const { list, lines } = group
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
  return fragment
}

const fillEditor = (editor: HTMLElement, answer: NominationAnswer) =>
  editor.replaceChildren(answerNodes(editor.ownerDocument, answer))

function validTable(table: NominationTable['table']) {
  return table.length <= tableLimits.rows && table.every((row) => row.length <= tableLimits.columns)
}

function clipboardTable(html: string, text: string): NominationAnswer | undefined {
  if (html) {
    const template = document.createElement('template')
    template.innerHTML = html
    if (template.content.querySelector('table')) return readNominationAnswer(template.content)
  }
  const rows = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  if (!rows.some((row) => row.includes('\t'))) return undefined
  const table = rows.map((row) => row.split('\t').map(plainAnswer))
  const width = table.reduce((max, row) => Math.max(max, row.length), 0)
  if (table.length <= tableLimits.rows && width <= tableLimits.columns) {
    for (const row of table) while (row.length < width) row.push([])
  }
  return [{ table }]
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
  const [tableOpen, setTableOpen] = useState(false)
  const [rows, setRows] = useState<number | string>(2)
  const [columns, setColumns] = useState<number | string>(2)
  const [tableError, setTableError] = useState('')
  const validDimensions = typeof rows === 'number' && Number.isInteger(rows) && rows > 0 && rows <= tableLimits.rows
    && typeof columns === 'number' && Number.isInteger(columns) && columns > 0 && columns <= tableLimits.columns

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
    const nextFormat = answer.some((block) => 'table' in block || block.list
      || block.runs.some(({ bold, italic, underline }) => bold || italic || underline))
      ? answer : undefined
    rendered.current = { value: nextValue, format: nextFormat }
    onChange(nextValue, nextFormat)
    rememberSelection()
  }

  function focusSelection() {
    const field = editor.current
    if (!field) return undefined
    const selection = field.ownerDocument.getSelection()
    const range = savedSelection.current
    field.focus()
    if (range && field.contains(range.commonAncestorContainer)) {
      selection?.removeAllRanges()
      selection?.addRange(range)
    } else if (selection && (!selection.rangeCount || !field.contains(selection.getRangeAt(0).commonAncestorContainer))) {
      selection.selectAllChildren(field)
      selection.collapseToEnd()
    }
    return field
  }

  function formatSelection(command: typeof tools[number][0]) {
    const field = focusSelection()
    if (!field) return
    field.ownerDocument.execCommand(command)
    update()
  }

  function insertTableContent(blocks: NominationAnswer) {
    const field = focusSelection()
    const selection = field?.ownerDocument.getSelection()
    if (!field || !selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    const tables = [...readNominationAnswer(field), ...blocks].filter((block): block is NominationTable => 'table' in block)
    const cells = tables.reduce((count, { table }) => count + table.reduce((sum, row) => sum + row.length, 0), 0)
    if (tables.some(({ table }) => !validTable(table)) || cells > tableLimits.cellsPerAnswer) {
      setTableError('Each table can have up to 30 rows and 12 columns, with up to 1,200 cells per answer.')
      return
    }
    const start = range.startContainer
    const enclosingTable = (start instanceof Element ? start : start.parentElement)?.closest('table')
    if (enclosingTable && field.contains(enclosingTable)) {
      range.setStartAfter(enclosingTable)
      range.collapse(true)
    }
    if (maxLength !== undefined && value.length + answerText(blocks).length - range.toString().length + (value ? 2 : 1) > maxLength) {
      setTableError('This table exceeds the remaining character limit.')
      return
    }
    const fragment = answerNodes(field.ownerDocument, blocks)
    const firstCell = fragment.querySelector('td')
    const after = field.ownerDocument.createElement('div')
    after.append(field.ownerDocument.createElement('br'))
    fragment.append(after)
    range.deleteContents()
    range.insertNode(fragment)
    range.selectNodeContents(firstCell ?? after)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    setTableOpen(false)
    setTableError('')
    update()
  }

  return <Input.Wrapper label={label} labelProps={{ id: `${id}-label`, onClick: () => { if (!disabled) editor.current?.focus() } }}
    required error={error} errorProps={{ id: `${id}-error` }} id={id}>
    <div onFocus={() => setFocused(true)} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setFocused(false)
        setTableOpen(false)
      }
    }}>
      {focused && !disabled && <Group gap={2} className="dp-answer-toolbar" role="toolbar" aria-label="Text formatting">
        {tools.map(([command, name, Icon]) => <ActionIcon
          key={command} type="button" variant="subtle" color="gray" aria-label={name} title={name}
          onMouseDown={(event) => { rememberSelection(); event.preventDefault() }}
          onClick={() => formatSelection(command)}
        ><Icon size={18} /></ActionIcon>)}
        <ActionIcon type="button" variant="subtle" color="gray" aria-label="Insert table" title="Insert table"
          aria-expanded={tableOpen} onMouseDown={(event) => { rememberSelection(); event.preventDefault() }}
          onClick={() => { setTableError(''); setTableOpen(!tableOpen) }}><IconTable size={18} /></ActionIcon>
      </Group>}
      {tableOpen && !disabled && <Group gap="xs" align="end" mb="xs">
        <NumberInput label="Rows" value={rows} onChange={setRows} min={1} max={tableLimits.rows} allowDecimal={false} w={90} />
        <NumberInput label="Columns" value={columns} onChange={setColumns} min={1} max={tableLimits.columns} allowDecimal={false} w={90} />
        <Button type="button" variant="white" disabled={!validDimensions} onClick={() => {
          if (typeof rows !== 'number' || typeof columns !== 'number') return
          insertTableContent([{ table: Array.from({ length: rows }, () => Array.from({ length: columns }, () => [])) }])
        }}>Insert</Button>
      </Group>}
      {tableError && <Text size="sm" role="alert">{tableError}</Text>}
      <div ref={editor} id={id} role="textbox" aria-labelledby={`${id}-label`} aria-multiline="true"
        aria-required="true" aria-invalid={Boolean(error)} aria-disabled={disabled}
        aria-describedby={error ? `${id}-error` : undefined} aria-placeholder={placeholder}
        contentEditable={!disabled} tabIndex={disabled ? -1 : 0}
        className="dp-answer-editor mantine-Input-input" data-empty={!value && !format} data-placeholder={placeholder}
        style={{ minHeight: `${minRows * 1.55 + 1.2}em` }}
        onInput={() => { setTableError(''); update() }} onSelect={rememberSelection} onKeyUp={rememberSelection} onMouseUp={rememberSelection}
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return
          const selection = event.currentTarget.ownerDocument.getSelection()
          const anchor = selection?.anchorNode
          const cell = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('td')
          const table = cell?.closest('table')
          if (!cell || !table || !event.currentTarget.contains(table) || !selection) return
          const cells = Array.from(table.querySelectorAll('td'))
          const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)]
          if (!next) return
          event.preventDefault()
          selection.selectAllChildren(next)
          selection.collapseToStart()
          rememberSelection()
        }}
        onPaste={(event) => {
          event.preventDefault()
          const clipboardText = event.clipboardData.getData('text/plain').replace(/\r\n/g, '\n')
          const table = clipboardTable(event.clipboardData.getData('text/html'), clipboardText)
          if (table?.some((block) => 'table' in block)) {
            rememberSelection()
            insertTableContent(table)
            return
          }
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
    {groupLines(format).map((group, index) => {
      if ('table' in group) return <div key={index} className="dp-answer-table-scroll"><table><tbody>
        {group.table.map((row, rowIndex) => <tr key={rowIndex}>
          {row.map((cell, columnIndex) => <td key={columnIndex}>
            {cell.length ? <NominationAnswerBody text="" format={cell} /> : null}
          </td>)}
        </tr>)}
      </tbody></table></div>
      const { list, lines } = group
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
