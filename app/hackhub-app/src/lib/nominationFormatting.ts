type Mark = 'bold' | 'italic' | 'underline'

export type NominationRun = { text: string } & Partial<Record<Mark, true>>
export interface NominationLine {
  runs: NominationRun[]
  list?: 'bullet' | 'number'
}
export type NominationTable = { table: NominationLine[][][] }
export type NominationBlock = NominationLine | NominationTable
export type NominationAnswer = NominationBlock[]
export const tableLimits = { rows: 30, columns: 12, cellsPerAnswer: 1200 } as const
export type AnswerIndex = 0 | 1 | 2
export type FormattedAnswers = [NominationAnswer, NominationAnswer, NominationAnswer]
export type AnswerFormats = Partial<Record<AnswerIndex, NominationAnswer>>

export const individualAnswerHeadings = [
  'Executive Summary (the Elevator Pitch)',
  'Details of Your Core Achievement in 2026 and Business Impact (Including Financial Figures)',
  'How You Demonstrate BD China Culture (Especially in Your Applied Category)',
] as const

export const teamAnswerHeadings = [
  'Achievement Summary',
  'Details of Your Team Achievement in 2026 and Business Impact',
  individualAnswerHeadings[2],
] as const

const lineText = (line: NominationLine) => line.runs.map((run) => run.text).join('')

export const answerText = (answer: NominationAnswer) => answer.map((block) => 'table' in block
  ? block.table.map((row) => row.map((cell) => cell.map(lineText).join('\n')).join('\t')).join('\n')
  : lineText(block)).join('\n')

export const plainAnswer = (text: string): NominationLine[] =>
  text.split(/\r?\n/).map((line) => ({ runs: line ? [{ text: line }] : [] }))

export function formattedAnswers(texts: [string, string, string], formats?: AnswerFormats): FormattedAnswers | undefined {
  if (!formats?.[0] && !formats?.[1] && !formats?.[2]) return undefined
  return [formats[0] ?? plainAnswer(texts[0]), formats[1] ?? plainAnswer(texts[1]), formats[2] ?? plainAnswer(texts[2])]
}

export function readNominationAnswer(editor: ParentNode, allowTables = true): NominationAnswer {
  const lines: NominationAnswer = []
  let line: NominationLine | undefined
  const addLine = (list?: NominationLine['list']) => {
    line = list ? { runs: [], list } : { runs: [] }
    lines.push(line)
    return line
  }
  function visit(node: Node, marks: Omit<NominationRun, 'text'>, list?: NominationLine['list']) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent ?? '').replace(/\u00a0/g, ' ').split(/\r?\n/)
      parts.forEach((text, index) => {
        if (index) addLine(list)
        if (text) {
          const runs = (line ?? addLine(list)).runs
          const previous = runs.at(-1)
          if (previous && previous.bold === marks.bold && previous.italic === marks.italic && previous.underline === marks.underline)
            previous.text += text
          else runs.push({ text, ...marks })
        }
      })
      return
    }
    if (!(node instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(node.tagName)) return
    if (node instanceof HTMLTableElement && allowTables) {
      const table: NominationTable['table'] = []
      for (const [index, row] of Array.from(node.rows).entries()) {
        const cells = table[index] ??= []
        let column = 0
        for (const cell of Array.from(row.cells)) {
          while (cells[column]) column++
          const endColumn = column + Math.min(cell.colSpan, tableLimits.columns + 1)
          const endRow = Math.min(index + (cell.rowSpan || node.rows.length), node.rows.length, tableLimits.rows + 1)
          for (let r = index; r < endRow; r++) {
            const target = table[r] ??= []
            for (let c = column; c < endColumn; c++) target[c] = []
          }
          cells[column] = readNominationAnswer(cell, false).filter((block): block is NominationLine => 'runs' in block)
          column = endColumn
          if (column > tableLimits.columns) break
        }
        if (index >= tableLimits.rows) break
      }
      const width = Math.max(0, ...table.map((row) => row.length))
      if (width) {
        for (const row of table) for (let column = 0; column < width; column++) row[column] ??= []
        lines.push({ table })
      }
      line = undefined
      return
    }
    if (node.tagName === 'BR') {
      if (node.parentNode?.childNodes.length !== 1) {
        if (!line) addLine(list)
        addLine(list)
      }
      return
    }
    if (node.tagName === 'UL' || node.tagName === 'OL') {
      line = undefined
      node.childNodes.forEach((child) => visit(child, marks, node.tagName === 'UL' ? 'bullet' : 'number'))
      return
    }
    const block = ['DIV', 'P', 'LI'].includes(node.tagName)
    if (block) addLine(list)
    const nextMarks = { ...marks }
    if (['B', 'STRONG'].includes(node.tagName) || node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) nextMarks.bold = true
    if (['I', 'EM'].includes(node.tagName) || node.style.fontStyle === 'italic') nextMarks.italic = true
    if (node.tagName === 'U' || node.style.textDecoration.includes('underline')) nextMarks.underline = true
    node.childNodes.forEach((child) => visit(child, nextMarks, list))
    if (block) line = undefined
  }
  editor.childNodes.forEach((child) => visit(child, {}))
  return lines
}
