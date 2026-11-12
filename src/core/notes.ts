/** Ligne de note sans case à cocher : texte libre, éventuellement vide. */
export interface NoteTextLine {
  type: 'text'
  text: string
}

/** Ligne de note avec case à cocher. */
export interface NoteTaskLine {
  type: 'task'
  checked: boolean
  text: string
}

export type NoteLine = NoteTextLine | NoteTaskLine

export interface NotesTaskProgress {
  checked: number
  total: number
}

/**
 * Une ligne de case au format Markdown : « - [ ] texte » ou « - [x] texte ».
 * L'indentation et l'astérisque sont acceptés à la lecture, mais l'écriture
 * produit toujours la forme normalisée avec un tiret.
 */
const TASK_LINE_PATTERN = /^[ \t]*[-*][ \t]+\[([ xX])\](?:[ \t](.*))?$/

/**
 * Lit les notes enregistrées en lignes structurées. Une note vide ne contient
 * aucune ligne ; les lignes de texte ordinaires sont conservées telles quelles,
 * y compris les lignes vides.
 */
export function parseNotes(markdown: string): NoteLine[] {
  if (markdown.length === 0) return []

  return markdown.split(/\r\n|\r|\n/).map((text) => {
    const match = TASK_LINE_PATTERN.exec(text)

    if (match === null) {
      return { type: 'text', text }
    }

    return {
      type: 'task',
      checked: match[1].toLowerCase() === 'x',
      text: match[2] ?? ''
    }
  })
}

/**
 * Réécrit les lignes au format Markdown stocké. C'est le seul format écrit
 * dans la base, l'export JSON et la description ICS.
 */
export function serializeNotes(lines: readonly NoteLine[]): string {
  return lines
    .map((line) => {
      if (line.type === 'text') return line.text

      const suffix = line.text.length > 0 ? ` ${line.text}` : ''
      return `- [${line.checked ? 'x' : ' '}]${suffix}`
    })
    .join('\n')
}

/** Compte les cases cochées et le total, pour le compteur à côté du libellé. */
export function notesTaskProgress(markdown: string): NotesTaskProgress {
  let checked = 0
  let total = 0

  for (const line of parseNotes(markdown)) {
    if (line.type !== 'task') continue

    total += 1

    if (line.checked) checked += 1
  }

  return { checked, total }
}
