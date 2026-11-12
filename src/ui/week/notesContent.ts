import type { JSONContent } from '@tiptap/core'
import { parseNotes, serializeNotes, type NoteLine } from '../../core/notes'

interface NotesNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: NotesNode[]
}

function nodeText(node: NotesNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'

  return (node.content ?? []).map(nodeText).join('')
}

function editorNodesToLines(content: readonly NotesNode[]): NoteLine[] {
  const lines: NoteLine[] = []

  for (const node of content) {
    if (node.type === 'taskList') {
      for (const item of node.content ?? []) {
        if (item.type !== 'taskItem') {
          lines.push({ type: 'text', text: nodeText(item) })
          continue
        }

        const paragraphs = (item.content ?? []).filter((child) => child.type === 'paragraph')
        const [first, ...rest] = paragraphs

        lines.push({
          type: 'task',
          checked: item.attrs?.checked === true,
          text: first === undefined ? nodeText(item) : nodeText(first)
        })

        // Une case ne peut contenir qu'une ligne dans le stockage Markdown.
        // Les paragraphes supplémentaires éventuels restent du texte libre.
        for (const paragraph of rest) {
          lines.push({ type: 'text', text: nodeText(paragraph) })
        }
      }

      continue
    }

    lines.push({ type: 'text', text: nodeText(node) })
  }

  return lines
}

/** Convertit les notes stockées en document TipTap, sans migration. */
export function notesToEditorContent(markdown: string): JSONContent {
  const content: JSONContent[] = []
  let taskItems: JSONContent[] = []

  function flushTaskItems(): void {
    if (taskItems.length === 0) return

    content.push({ type: 'taskList', content: taskItems })
    taskItems = []
  }

  for (const line of parseNotes(markdown)) {
    if (line.type === 'task') {
      taskItems.push({
        type: 'taskItem',
        attrs: { checked: line.checked },
        content: [
          {
            type: 'paragraph',
            content: line.text.length > 0 ? [{ type: 'text', text: line.text }] : []
          }
        ]
      })
      continue
    }

    flushTaskItems()
    content.push({
      type: 'paragraph',
      content: line.text.length > 0 ? [{ type: 'text', text: line.text }] : []
    })
  }

  flushTaskItems()

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }]
  }
}

/** Relit le document TipTap et le réécrit au format Markdown stocké. */
export function editorContentToNotes(content: JSONContent | null | undefined): string {
  return serializeNotes(editorNodesToLines(content?.content ?? []))
}
