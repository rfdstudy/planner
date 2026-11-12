import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import { Fragment, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { filterCommands, type PaletteCommand } from '../../core/commands'
import { parseNotes, type NoteLine } from '../../core/notes'
import { editorContentToNotes, notesToEditorContent } from './notesContent'
import styles from './NotesEditor.module.css'

interface NotesEditorProps {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

interface SlashContext {
  /** Position absolue avant le paragraphe courant. */
  blockStart: number
  query: string
  left: number
  top: number
}

const SLASH_COMMANDS: readonly PaletteCommand[] = [
  {
    id: 'case',
    label: 'Case à cocher',
    hint: '/case',
    keywords: ['case', 'coche', 'tache', 'checkbox']
  }
]

const SLASH_MENU_WIDTH = 196
const SLASH_MENU_HEIGHT = 48
const SLASH_MENU_MARGIN = 8

const NOTES_EXTENSIONS = [
  StarterKit.configure({
    blockquote: false,
    bold: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    link: false,
    listItem: false,
    orderedList: false,
    strike: false,
    trailingNode: false,
    underline: false
  }),
  TaskList,
  TaskItem.configure({
    nested: false,
    a11y: {
      checkboxLabel: (_node, checked) => (checked ? 'Décocher la case' : 'Cocher la case')
    }
  })
]

/**
 * Éditeur de notes. TipTap fournit le contenteditable, l'historique, le collage
 * et la saisie des accents ; le format stocké reste du Markdown.
 */
export function NotesEditor({
  value,
  disabled = false,
  onChange
}: NotesEditorProps): React.JSX.Element {
  const [menu, setMenu] = useState<SlashContext | null>(null)
  const dismissedBlockStartRef = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    extensions: NOTES_EXTENSIONS,
    content: notesToEditorContent(value),
    editable: !disabled,
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        class: styles.prose,
        role: 'textbox',
        'aria-label': 'Notes',
        'aria-multiline': 'true',
        spellcheck: 'true'
      },
      handlePaste: handleNotesPaste
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(editorContentToNotes(current.getJSON()))
      refreshSlashMenu(current)
    },
    onSelectionUpdate: ({ editor: current }) => {
      refreshSlashMenu(current)
    },
    onBlur: () => {
      setMenu(null)
    }
  })

  useEffect(() => {
    if (editor === null) return

    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (editor === null) return

    const current = editorContentToNotes(editor.getJSON())

    if (current === value) return

    editor.commands.setContent(notesToEditorContent(value), { emitUpdate: false })
  }, [editor, value])

  useEffect(() => {
    if (menu === null) return

    const close = (): void => setMenu(null)

    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)

    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  function refreshSlashMenu(current: Editor): void {
    const context = readSlashContext(current)

    if (context === null) {
      dismissedBlockStartRef.current = null
      setMenu(null)
      return
    }

    if (dismissedBlockStartRef.current === context.blockStart) {
      setMenu(null)
      return
    }

    setMenu((previous) =>
      previous !== null &&
      previous.blockStart === context.blockStart &&
      previous.query === context.query &&
      previous.left === context.left &&
      previous.top === context.top
        ? previous
        : context
    )
  }

  function currentSlashContext(current: Editor): SlashContext | null {
    const context = readSlashContext(current)

    if (context === null || dismissedBlockStartRef.current === context.blockStart) return null

    return context
  }

  function dismissSlashMenu(): void {
    if (editor !== null) {
      const context = readSlashContext(editor)

      if (context !== null) dismissedBlockStartRef.current = context.blockStart
    }

    setMenu(null)
  }

  function handleKeyDownCapture(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (editor === null) return

    const slash = currentSlashContext(editor)

    if (slash !== null) {
      const matches = filterCommands(SLASH_COMMANDS, slash.query)

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismissSlashMenu()
        return
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && matches.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        applySlashCommand(editor)
        return
      }

      if ((event.key === 'Enter' || event.key === 'Tab') && matches.length === 0) {
        setMenu(null)
      }
    }

    const { selection } = editor.state

    if (!selection.empty) return

    const { $from } = selection

    if ($from.depth < 2 || $from.node(-1).type.name !== 'taskItem') return

    if (event.key === 'Backspace' && $from.parentOffset === 0) {
      event.preventDefault()
      event.stopPropagation()
      editor.commands.liftListItem('taskItem')
      return
    }

    if (event.key === 'Enter' && $from.parent.content.size === 0) {
      event.preventDefault()
      event.stopPropagation()
      editor.commands.liftListItem('taskItem')
    }
  }

  function applySlashCommand(current: Editor): void {
    const { state } = current
    const { selection } = state
    const { $from } = selection

    if (!selection.empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph') return

    const taskListType = state.schema.nodes.taskList
    const taskItemType = state.schema.nodes.taskItem
    const paragraphType = state.schema.nodes.paragraph

    if (taskListType === undefined || taskItemType === undefined || paragraphType === undefined) {
      return
    }

    const text = $from.parent.textContent
    const afterCommand = text.slice($from.parentOffset).replace(/^\s+/, '')
    const paragraph = paragraphType.create(
      null,
      afterCommand.length > 0 ? state.schema.text(afterCommand) : undefined
    )
    const taskItem = taskItemType.create({ checked: false }, paragraph)
    const taskList = taskListType.create(null, taskItem)
    const from = $from.before()
    const to = $from.after()
    const transaction = state.tr.replaceWith(from, to, taskList)
    const caret = Math.min(from + 3 + afterCommand.length, transaction.doc.content.size)

    transaction.setSelection(TextSelection.create(transaction.doc, caret))
    dismissedBlockStartRef.current = null
    setMenu(null)
    current.view.dispatch(transaction)
    current.view.focus()
  }

  const commands = menu === null ? [] : filterCommands(SLASH_COMMANDS, menu.query)

  return (
    <div
      className={disabled ? `${styles.shell} ${styles.disabled}` : styles.shell}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {value.length === 0 && (
        <span className={styles.placeholder} aria-hidden="true">
          Notes
        </span>
      )}

      <EditorContent editor={editor} />

      {menu !== null && (
        <div
          className={styles.slashMenu}
          style={{ left: `${menu.left}px`, top: `${menu.top}px` }}
          role="listbox"
          aria-label="Commandes de notes"
        >
          {commands.length === 0 ? (
            <span className={styles.slashEmpty} role="presentation">
              Aucune commande
            </span>
          ) : (
            commands.map((command) => (
              <button
                key={command.id}
                type="button"
                className={styles.slashOption}
                role="option"
                aria-selected="true"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (editor === null) return

                  if (readSlashContext(editor) !== null) applySlashCommand(editor)
                }}
              >
                <span>{command.label}</span>
                {command.hint !== undefined && (
                  <span className={styles.slashHint}>{command.hint}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Repère « / » au début d'un paragraphe et la commande en cours de frappe.
 * Le texte situé après le curseur est conservé : il servira de texte à la case.
 */
function readSlashContext(current: Editor): SlashContext | null {
  const { selection } = current.state

  if (!selection.empty) return null

  const { $from } = selection

  if ($from.depth !== 1 || $from.parent.type.name !== 'paragraph') return null

  const text = $from.parent.textContent
  const offset = $from.parentOffset

  if (offset < 1 || !text.startsWith('/')) return null

  const query = text.slice(1, offset)

  if (!/^\p{L}*$/u.test(query)) return null

  const blockStart = $from.before()
  const coordinates = current.view.coordsAtPos(blockStart + 1)
  const below = coordinates.bottom + 4
  const left = Math.min(
    Math.max(SLASH_MENU_MARGIN, coordinates.left),
    Math.max(SLASH_MENU_MARGIN, window.innerWidth - SLASH_MENU_WIDTH - SLASH_MENU_MARGIN)
  )
  const top =
    below + SLASH_MENU_HEIGHT <= window.innerHeight - SLASH_MENU_MARGIN
      ? below
      : Math.max(SLASH_MENU_MARGIN, coordinates.top - SLASH_MENU_HEIGHT - 4)

  return { blockStart, query, left, top }
}

function noteNodesFromLines(schema: Schema, lines: readonly NoteLine[]): ProseMirrorNode[] {
  const paragraphType = schema.nodes.paragraph
  const taskItemType = schema.nodes.taskItem
  const taskListType = schema.nodes.taskList

  if (paragraphType === undefined || taskItemType === undefined || taskListType === undefined) {
    return []
  }

  const nodes: ProseMirrorNode[] = []
  let taskItems: ProseMirrorNode[] = []

  function flushTaskItems(): void {
    if (taskItems.length === 0) return

    nodes.push(taskListType.create(null, taskItems))
    taskItems = []
  }

  for (const line of lines) {
    if (line.type === 'task') {
      const paragraph = paragraphType.create(
        null,
        line.text.length > 0 ? schema.text(line.text) : undefined
      )
      taskItems.push(taskItemType.create({ checked: line.checked }, paragraph))
      continue
    }

    flushTaskItems()
    nodes.push(
      paragraphType.create(null, line.text.length > 0 ? schema.text(line.text) : undefined)
    )
  }

  flushTaskItems()

  return nodes
}

/**
 * Collage de notes contenant des cases Markdown. Le collage ordinaire reste
 * celui de ProseMirror ; seul le cas d'un paragraphe vide est intercepté pour
 * pouvoir recréer des cases plutôt que coller leurs marqueurs en texte brut.
 */
function handleNotesPaste(view: EditorView, event: ClipboardEvent): boolean {
  const text = event.clipboardData?.getData('text/plain')

  if (text === undefined || text.length === 0) return false

  const lines = parseNotes(text)

  if (!lines.some((line) => line.type === 'task')) return false

  const { state } = view
  const { selection } = state
  const { $from } = selection

  if (
    !selection.empty ||
    $from.depth !== 1 ||
    $from.parent.type.name !== 'paragraph' ||
    $from.parent.content.size > 0
  ) {
    return false
  }

  const nodes = noteNodesFromLines(state.schema, lines)

  if (nodes.length === 0) return false

  const from = $from.before()
  const to = $from.after()
  const transaction = state.tr.replaceWith(from, to, Fragment.fromArray(nodes))
  const end = from + nodes.reduce((total, node) => total + node.nodeSize, 0)

  transaction.setSelection(TextSelection.near(transaction.doc.resolve(Math.max(0, end - 1))))
  view.dispatch(transaction)
  view.focus()
  event.preventDefault()

  return true
}
