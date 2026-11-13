import { writeFile } from 'node:fs/promises'
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool'

const output = process.argv[1]
const chunks = []
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) chunks.push(chunk)
const employees = JSON.parse(chunks.join(''))

const workbook = Workbook.create()
const sheet = workbook.worksheets.add('Sheet1')
const lastRow = employees.length + 1
sheet.getRange(`A1:C${lastRow}`).values = [
  ['Pers.No.', 'Organizational Unit', 'Personnel Number'],
  ...employees,
]
sheet.getRange(`A2:A${lastRow}`).setNumberFormat('@')
sheet.getRange(`A1:A${lastRow}`).format.columnWidth = 14
sheet.getRange(`B1:B${lastRow}`).format.columnWidth = 25
sheet.getRange(`C1:C${lastRow}`).format.columnWidth = 46
sheet.getRange('A1:C1').format = {
  fill: '#16365C',
  font: { bold: true, color: '#FFFFFF' },
  rowHeight: 22,
}
sheet.freezePanes.freezeRows(1)

if (process.env.BD_NAMELIST_PREVIEW) {
  const preview = await workbook.render({ sheetName: 'Sheet1', range: 'A1:C13', scale: 1.3 })
  await writeFile(process.env.BD_NAMELIST_PREVIEW, new Uint8Array(await preview.arrayBuffer()))
}
const file = await SpreadsheetFile.exportXlsx(workbook)
await file.save(output)
