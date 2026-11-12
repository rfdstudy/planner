import { useEffect, useMemo, useState } from 'react'
import { filterCommands } from '../../core/commands'
import { getWeekDays, isLocalDate, todayLocalDate } from '../../core/time'
import { useUiStore } from '../../state/ui'
import { exportBackup } from '../exportBackup'
import { exportCalendarIcs } from '../exportCalendar'
import styles from './CommandPalette.module.css'

/** Date la plus utile à proposer : le jour affiché ou aujourd'hui dans la semaine. */
function displayedDate(): string {
  const state = useUiStore.getState()

  if (state.viewMode === 'day') return state.selectedDate

  const days = getWeekDays(state.weekStart, state.weekStartsOn)
  const today = todayLocalDate()

  return days.includes(today) ? today : state.weekStart
}

interface CommandItem {
  id: string
  label: string
  hint?: string
  keywords?: readonly string[]
  run: () => void | Promise<void>
}

type PaletteMode = 'commands' | 'date'

/**
 * Palette de commandes (Ctrl+K). Elle est remontée à chaque ouverture pour
 * repartir d'une recherche vide. Elle ne modifie jamais les données : les
 * commandes de navigation passent par le store, l'export par les repositories.
 */
export function CommandPalette(): React.JSX.Element | null {
  const open = useUiStore((state) => state.paletteOpen)

  return open ? <PaletteSession /> : null
}

function PaletteSession(): React.JSX.Element {
  const closePalette = useUiStore((state) => state.closePalette)
  const showCalendar = useUiStore((state) => state.showCalendar)
  const goToDate = useUiStore((state) => state.goToDate)
  const setView = useUiStore((state) => state.setView)
  const openCategories = useUiStore((state) => state.openCategories)
  const openTypes = useUiStore((state) => state.openTypes)
  const openTemplates = useUiStore((state) => state.openTemplates)
  const openSettings = useUiStore((state) => state.openSettings)
  const requestCreation = useUiStore((state) => state.requestCreation)

  const [mode, setMode] = useState<PaletteMode>('commands')
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dateValue, setDateValue] = useState(displayedDate)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const commands = useMemo<CommandItem[]>(() => {
    const openCalendarView = (viewMode: 'day' | 'week'): void => {
      showCalendar()
      setView(viewMode)
      closePalette()
    }

    return [
      {
        id: 'new-task',
        label: 'Nouvelle tâche',
        hint: 'N',
        keywords: ['créer', 'ajouter', 'tâche'],
        run: () => {
          showCalendar()
          requestCreation('task')
          closePalette()
        }
      },
      {
        id: 'go-to-date',
        label: 'Aller à une date…',
        keywords: ['naviguer', 'calendrier', 'jour'],
        run: () => {
          setDateValue(displayedDate())
          setError(null)
          setMode('date')
        }
      },
      {
        id: 'view-day',
        label: 'Vue Jour',
        hint: '1',
        keywords: ['une journée', 'colonne'],
        run: () => openCalendarView('day')
      },
      {
        id: 'view-week',
        label: 'Vue Semaine',
        hint: '2',
        keywords: ['sept jours', 'calendrier'],
        run: () => openCalendarView('week')
      },
      {
        id: 'open-categories',
        label: 'Ouvrir Catégories',
        keywords: ['matières', 'projets', 'couleurs'],
        run: () => {
          openCategories()
          closePalette()
        }
      },
      {
        id: 'open-types',
        label: 'Ouvrir Types',
        keywords: ['types', 'éléments', 'comportement', 'couleurs'],
        run: () => {
          openTypes()
          closePalette()
        }
      },
      {
        id: 'open-templates',
        label: 'Ouvrir Semaine type',
        keywords: ['modèles', 'blocs fixes', 'récurrence'],
        run: () => {
          openTemplates()
          closePalette()
        }
      },
      {
        id: 'open-settings',
        label: 'Ouvrir Réglages',
        keywords: ['préférences', 'paramètres', 'sauvegarde', 'import', 'export'],
        run: () => {
          openSettings()
          closePalette()
        }
      },
      {
        id: 'export-backup',
        label: 'Exporter la sauvegarde',
        hint: 'JSON',
        keywords: ['export', 'sauvegarde', 'fichier'],
        run: async () => {
          setBusy(true)
          setError(null)

          try {
            await exportBackup()
            closePalette()
          } catch {
            setError('La sauvegarde n’a pas pu être enregistrée.')
          } finally {
            setBusy(false)
          }
        }
      },
      {
        id: 'export-calendar',
        label: 'Exporter le calendrier',
        hint: 'ICS',
        keywords: ['export', 'calendrier', 'icalendar', 'agenda'],
        run: async () => {
          setBusy(true)
          setError(null)

          try {
            await exportCalendarIcs()
            closePalette()
          } catch {
            setError('Le calendrier n’a pas pu être exporté.')
          } finally {
            setBusy(false)
          }
        }
      }
    ]
  }, [
    closePalette,
    openCategories,
    openSettings,
    openTemplates,
    openTypes,
    requestCreation,
    setView,
    showCalendar
  ])

  const filteredCommands = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      closePalette()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [closePalette])

  const selectedCommand = filteredCommands[selectedIndex] ?? filteredCommands[0] ?? null

  async function execute(command: CommandItem): Promise<void> {
    if (busy) return

    setError(null)

    try {
      await command.run()
    } catch {
      setError('La commande n’a pas pu aboutir.')
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((current) =>
        filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) =>
        filteredCommands.length === 0
          ? 0
          : (current - 1 + filteredCommands.length) % filteredCommands.length
      )
      return
    }

    if (event.key === 'Enter' && selectedCommand !== null) {
      event.preventDefault()
      void execute(selectedCommand)
    }
  }

  function handleDateSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    if (!isLocalDate(dateValue)) {
      setError('Choisissez une date valide.')
      return
    }

    goToDate(dateValue)
    closePalette()
  }

  return (
    <div
      className={styles.overlay}
      onPointerDown={(event) => {
        event.stopPropagation()

        if (event.target === event.currentTarget) closePalette()
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
      >
        {mode === 'commands' ? (
          <>
            <input
              className={styles.input}
              type="text"
              value={query}
              placeholder="Rechercher une commande…"
              aria-label="Rechercher une commande"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelectedIndex(0)
                setError(null)
              }}
              onKeyDown={handleInputKeyDown}
            />

            <div className={styles.results} role="listbox" aria-label="Commandes">
              {filteredCommands.length === 0 ? (
                <p className={styles.empty}>Aucune commande ne correspond.</p>
              ) : (
                filteredCommands.map((command, index) => (
                  <button
                    key={command.id}
                    type="button"
                    className={
                      index === selectedIndex
                        ? `${styles.option} ${styles.optionActive}`
                        : styles.option
                    }
                    role="option"
                    aria-selected={index === selectedIndex}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => void execute(command)}
                  >
                    <span className={styles.optionLabel}>{command.label}</span>
                    {command.hint !== undefined && (
                      <kbd className={styles.optionHint}>{command.hint}</kbd>
                    )}
                  </button>
                ))
              )}
            </div>

            {error !== null && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <div className={styles.footer}>
              <span>Entrée pour exécuter</span>
              <span>Échap pour fermer</span>
            </div>
          </>
        ) : (
          <form className={styles.dateForm} onSubmit={handleDateSubmit} noValidate>
            <label className={styles.dateLabel} htmlFor="palette-date">
              Aller à une date
            </label>
            <input
              id="palette-date"
              className={styles.dateInput}
              type="date"
              value={dateValue}
              aria-label="Date à afficher"
              autoFocus
              onChange={(event) => {
                setDateValue(event.target.value)
                setError(null)
              }}
            />

            {error !== null && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <div className={styles.dateActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => {
                  setMode('commands')
                  setError(null)
                }}
              >
                Retour
              </button>
              <button type="submit" className={styles.primaryButton}>
                Aller
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
