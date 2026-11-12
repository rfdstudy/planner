import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  WEEKDAY_CODES,
  buildWeeklyRrule,
  buildYearlyRrule,
  getRecurrenceKind,
  parseWeeklyDays,
  type WeekdayCode
} from '../../core/recurrence'
import { formatDurationMinutes, minutesToTime, parseLocalDate } from '../../core/time'
import type { Category, CategoryGroup, ItemType, Template } from '../../core/types'
import { repositories } from '../../db/repositories'
import { categoryColorStyle } from '../categoryColorStyle'
import { Icon } from '../components/Icon'
import {
  TemplateForm,
  type TemplateFormInitialValues,
  type TemplateFormValues
} from './TemplateForm'
import styles from './TemplatesScreen.module.css'

const WEEKDAY_LABELS: Readonly<Record<WeekdayCode, string>> = {
  MO: 'Lun',
  TU: 'Mar',
  WE: 'Mer',
  TH: 'Jeu',
  FR: 'Ven',
  SA: 'Sam',
  SU: 'Dim'
}

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

interface TemplatesOverview {
  templates: Template[]
  itemTypes: ItemType[]
  categories: Category[]
  categoryGroups: CategoryGroup[]
}

type TemplateEditorState = { mode: 'create' } | { mode: 'edit'; templateId: string }

function formatDate(value: string): string {
  return DATE_FORMAT.format(parseLocalDate(value))
}

function describeDays(days: readonly WeekdayCode[]): string {
  return days.map((day) => WEEKDAY_LABELS[day]).join(', ')
}

function describeValidity(template: Template): string {
  if (template.validUntil === null) {
    return `Depuis le ${formatDate(template.validFrom)}`
  }

  return `Du ${formatDate(template.validFrom)} au ${formatDate(template.validUntil)}`
}

function describeRecurrence(template: Template): string {
  if (getRecurrenceKind(template.rrule) === 'yearly') return 'Chaque année'

  const days = parseWeeklyDays(template.rrule)
  return days.length === 0 ? 'Règle personnalisée' : describeDays(days)
}

function initialValuesFrom(template: Template): TemplateFormInitialValues {
  return {
    typeId: template.typeId,
    title: template.title,
    categoryId: template.categoryId,
    recurrence: getRecurrenceKind(template.rrule) ?? 'weekly',
    days: parseWeeklyDays(template.rrule),
    startMin: template.startMin,
    durationMin: template.durationMin,
    validFrom: template.validFrom,
    validUntil: template.validUntil
  }
}

function sortTemplates(templates: readonly Template[]): Template[] {
  return [...templates].sort((a, b) => {
    const aDays = parseWeeklyDays(a.rrule)
    const bDays = parseWeeklyDays(b.rrule)
    const aYearly = getRecurrenceKind(a.rrule) === 'yearly'
    const bYearly = getRecurrenceKind(b.rrule) === 'yearly'
    const aFirst = aYearly ? 7 : aDays.length === 0 ? 7 : WEEKDAY_CODES.indexOf(aDays[0])
    const bFirst = bYearly ? 7 : bDays.length === 0 ? 7 : WEEKDAY_CODES.indexOf(bDays[0])

    return aFirst - bFirst || a.startMin - b.startMin || a.title.localeCompare(b.title, 'fr')
  })
}

/**
 * Écran de gestion de la semaine type. Aucun modèle n'est fourni par le code :
 * tout se crée, se modifie et se supprime ici.
 */
export function TemplatesScreen(): React.JSX.Element {
  const [overview, setOverview] = useState<TemplatesOverview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editor, setEditor] = useState<TemplateEditorState | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    const subscription = liveQuery(async () => ({
      templates: await repositories.templates.list(),
      itemTypes: await repositories.itemTypes.list(),
      categories: await repositories.categories.list(),
      categoryGroups: await repositories.categoryGroups.list()
    })).subscribe({
      next: (data) => {
        setOverview(data)
        setLoadError(null)
      },
      error: () => setLoadError('Impossible de lire les modèles de semaine type.')
    })

    return () => subscription.unsubscribe()
  }, [])

  const templates = sortTemplates(overview?.templates ?? [])
  const itemTypes = overview?.itemTypes ?? []
  const categories = overview?.categories ?? []
  const categoryGroups = overview?.categoryGroups ?? []
  const editedTemplate =
    editor?.mode === 'edit'
      ? (templates.find((template) => template.id === editor.templateId) ?? null)
      : null

  function openCreate(): void {
    setActionError(null)
    setPendingDeleteId(null)
    setDeleteBusy(false)
    setEditor({ mode: 'create' })
  }

  function openEdit(templateId: string): void {
    setActionError(null)
    setPendingDeleteId(null)
    setDeleteBusy(false)
    setEditor({ mode: 'edit', templateId })
  }

  async function handleSubmit(values: TemplateFormValues): Promise<void> {
    const input = {
      typeId: values.typeId,
      title: values.title,
      categoryId: values.categoryId,
      rrule: values.recurrence === 'yearly' ? buildYearlyRrule() : buildWeeklyRrule(values.days),
      startMin: values.startMin,
      durationMin: values.durationMin,
      validFrom: values.validFrom,
      validUntil: values.validUntil
    }

    if (editor?.mode === 'create') {
      await repositories.templates.create(input)
    } else if (editor?.mode === 'edit') {
      await repositories.templates.updateDetails(editor.templateId, input)
    }

    setEditor(null)
    setActionError(null)
  }

  async function confirmDelete(): Promise<void> {
    if (pendingDeleteId === null) return

    setDeleteBusy(true)
    setActionError(null)

    try {
      await repositories.recurrence.deleteTemplate(pendingDeleteId)
      setPendingDeleteId(null)
      setDeleteBusy(false)
    } catch {
      setDeleteBusy(false)
      setActionError('Le modèle n’a pas pu être supprimé.')
    }
  }

  if (overview === null) {
    return (
      <div className={styles.screen}>
        <div className={styles.container}>
          <p className={styles.loadingText}>{loadError ?? 'Chargement de la semaine type…'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Semaine type</h1>
            <p className={styles.subtitle}>
              Définissez une fois les blocs qui reviennent chaque semaine.
            </p>
          </div>
          {editor === null && (
            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Icon name="plus" size={15} />
              Nouveau modèle
            </button>
          )}
        </header>

        {(loadError ?? actionError) !== null && (
          <p className={styles.banner} role="alert">
            {loadError ?? actionError}
          </p>
        )}

        {editor !== null && (
          <section
            className={styles.editorCard}
            aria-label={editor.mode === 'create' ? 'Nouveau modèle' : 'Modifier le modèle'}
          >
            <h2 className={styles.sectionTitle}>
              {editor.mode === 'create' ? 'Nouveau modèle' : 'Modifier le modèle'}
            </h2>
            <TemplateForm
              key={editor.mode === 'create' ? 'new-template' : editor.templateId}
              mode={editor.mode}
              initial={editedTemplate === null ? undefined : initialValuesFrom(editedTemplate)}
              itemTypes={itemTypes}
              categories={categories}
              categoryGroups={categoryGroups}
              onSubmit={handleSubmit}
              onCancel={() => setEditor(null)}
            />
          </section>
        )}

        {templates.length === 0 ? (
          <p className={styles.emptyState}>
            Aucun modèle pour l’instant. Ajoutez vos cours, repas ou temps libres récurrents.
          </p>
        ) : (
          <div className={styles.list}>
            {templates.map((template) => {
              const type = itemTypes.find((candidate) => candidate.id === template.typeId) ?? null
              const category =
                template.categoryId === null
                  ? null
                  : (categories.find((candidate) => candidate.id === template.categoryId) ?? null)
              const endMin = Math.min(1440, template.startMin + template.durationMin)
              const deleting = pendingDeleteId === template.id
              const topLine = type?.placement === 'topLine'

              return (
                <article className={styles.card} key={template.id}>
                  <div className={styles.row}>
                    <div className={styles.main}>
                      <div className={styles.titleLine}>
                        <span className={styles.kindBadge}>{type?.name ?? 'Type inconnu'}</span>
                        {category !== null && type?.style === 'category' && (
                          <>
                            <span
                              className={styles.categoryDot}
                              style={categoryColorStyle(category.color)}
                              aria-hidden="true"
                            />
                            <span className={styles.categoryName}>{category.name}</span>
                          </>
                        )}
                        <span className={styles.templateTitle}>{template.title}</span>
                      </div>
                      <p className={styles.metaLine}>
                        <span>{describeRecurrence(template)}</span>
                        <span className={styles.metaSeparator}>·</span>
                        <span>
                          {topLine
                            ? 'Journée entière'
                            : `${minutesToTime(template.startMin)} – ${minutesToTime(endMin)}`}
                        </span>
                        <span className={styles.metaSeparator}>·</span>
                        <span>{formatDurationMinutes(template.durationMin)}</span>
                        <span className={styles.metaSeparator}>·</span>
                        <span>{describeValidity(template)}</span>
                      </p>
                    </div>

                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Modifier ${template.title}`}
                        title="Modifier"
                        onClick={() => openEdit(template.id)}
                      >
                        <Icon name="pencil" size={15} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Supprimer ${template.title}`}
                        title="Supprimer"
                        onClick={() => {
                          setActionError(null)
                          setEditor(null)
                          setDeleteBusy(false)
                          setPendingDeleteId(deleting ? null : template.id)
                        }}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>

                  {deleting && (
                    <div className={styles.confirmPanel}>
                      <p className={styles.confirmText}>
                        Supprimer le modèle « {template.title} » ? Toutes ses occurrences
                        disparaîtront de la grille.
                      </p>
                      <div className={styles.confirmActions}>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          disabled={deleteBusy}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={deleteBusy}
                          onClick={() => void confirmDelete()}
                        >
                          {deleteBusy ? 'Suppression…' : 'Supprimer'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
