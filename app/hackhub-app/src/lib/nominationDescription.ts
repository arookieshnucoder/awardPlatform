import { individualAnswerHeadings as nominationHeadings } from './nominationFormatting'

export function parseNominationDescription(description: string, nominationType: 'individual' | 'team' = 'individual') {
  const sections: Array<{ heading: string; body: string }> = []
  let heading = ''
  let lines: string[] = []
  for (const line of description.split(/\r?\n/)) {
    const label = line.trim().replace(/^\*\*|\*\*$/g, '')
    const index = /^Executive Summary(?: \(The Elevator Pitch\))?$/i.test(label) ? 0
      : label.toLowerCase() === nominationHeadings[1].toLowerCase() ? 1
      : /^How you demonstrate (?:Bosch|BD) China culture \(especially (?:in your|on you) applied category\)\s*\??$/i.test(label) ? 2
      : undefined
    // 团队历史提交使用不同的固定标题，仅在详情中规范显示，不改写保存的正文。
    const teamHeading = nominationType === 'team'
      ? /^Achievement Summary$/i.test(label) ? 'Achievement Summary'
        : /^Details of Your Team Achievement in 2026 and Business Impact$/i.test(label) ? 'Details of Your Team Achievement in 2026 and Business Impact'
        : /^How you demonstrate (?:Bosch|BD) China culture(?: \(especially (?:in your|on you) applied category\))?\s*\??$/i.test(label) ? 'How You Demonstrate BD China Culture'
        : ''
      : ''
    const individualHeading = index === undefined ? '' : nominationHeadings[index]
    if (teamHeading || individualHeading) {
      if (heading || lines.join('\n').trim()) sections.push({ heading, body: lines.join('\n').trim() })
      heading = teamHeading || individualHeading
      lines = []
    } else {
      lines.push(line)
    }
  }
  if (heading || lines.join('\n').trim()) sections.push({ heading, body: lines.join('\n').trim() })
  return sections
}
