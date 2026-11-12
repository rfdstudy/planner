import { Fragment, useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { moveOrderedId } from '../../core/categories'
import { ITEM_TYPE_PLACEMENTS, ITEM_TYPE_STYLES } from '../../core/itemTypes'
import type { ItemType } from '../../core/types'
import { repositories } from '../../db/repositories'
import type { ItemTypeUsage } from '../../db/repositories/itemTypes'
import { Icon, type IconName } from '../components/Icon'
import { TypeForm, type TypeFormValues } from './TypeForm'
import styles from './TypesScreen.module.css'

type TypeEditorState = { mode: 'create' } | { mode: 'edit'; typeId: string }

interface TypeDeletionState {
  type: ItemType
  usage: ItemTypeUsage | null
  replacementId: string
  busy: boolean
}

function styleLabel(style: ItemType['style']): string {
  return ITEM_TYPE_STYLES.find((option) => option.value === style)?.label ?? style
}

function placementLabel(placement: ItemType['placement']): string {
  return ITEM_TYPE_PLACEMENTS.find((option) => option.value === placement)?.label ?? placement
}

function describeUsage(usage: ItemTypeUsage): string {
  const parts: string[] = []

  if (usage.items > 0) {
    parts.push(`${usage.items} élément${usage.items > 1 ? 's' : ''}`)
  }

  if (usage.templates > 0) {
    parts.push(`${usage.templates} modèle${usage.templates > 1 ? 's' : ''} de semaine type`)
  }

  if (usage.overrides > 0) {
    parts.push(`${usage.overrides} exception${usage.overrides > 1 ? 's' : ''}`)
  }

  if (parts.length <= 1) return parts[0] ?? ''

  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

/**
 * Écran de gestion des types d'éléments. Tout est une donnée : les cinq types
 * de départ sont créés par migration puis peuvent être modifiés, archivés ou
 * supprimés comme n'importe quel autre type.
 */
export function TypesScreen(): React.JSX.Element {
  const [types, setTypes] = useState<ItemType[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editor, setEditor] = useState<TypeEditorState | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<TypeDeletionState | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)

  useEffect(() => {
    const subscription = liveQuery(() => repositories.itemTypes.list()).subscribe({
      next: (data) => {
        setTypes(data)
        setLoadError(null)
      },
      error: () => setLoadError('Impossible de lire les types d’éléments.')
    })

    return () => subscription.unsubscribe()
  }, [])

  const allTypes = types ?? []
  const activeTypes = allTypes
    .filter((type) => type.archivedAt === null)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr'))
  const archivedTypes = allTypes
    .filter((type) => type.archivedAt !== null)
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))

  function resetPanels(): void {
    setPendingDeletion(null)
  }

  function openCreate(): void {
    setActionError(null)
    resetPanels()
    setEditor({ mode: 'create' })
  }

  function openEdit(type: ItemType): void {
    setActionError(null)
    resetPanels()
    setEditor({ mode: 'edit', typeId: type.id })
  }

  async function handleSubmit(values: TypeFormValues): Promise<void> {
    if (editor === null) return

    if (editor.mode === 'create') {
      await repositories.itemTypes.create(values)
    } else {
      await repositories.itemTypes.updateDetails(editor.typeId, values)
    }

    setEditor(null)
    setActionError(null)
  }

  async function moveType(typeId: string, direction: 'up' | 'down'): Promise<void> {
    const orderedIds = activeTypes.map((type) => type.id)
    const reordered = moveOrderedId(orderedIds, typeId, direction)

    if (reordered.every((id, index) => id === orderedIds[index])) return

    setActionError(null)

    try {
      await repositories.itemTypes.reorder(reordered)
    } catch {
      setActionError('Le réordonnancement des types a échoué.')
    }
  }

  async function archiveType(type: ItemType): Promise<void> {
    setActionError(null)
    setPendingDeletion((current) => (current?.type.id === type.id ? null : current))

    try {
      await repositories.itemTypes.archive(type.id)
    } catch {
      setActionError('Le type n’a pas pu être archivé.')
    }
  }

  async function restoreType(type: ItemType): Promise<void> {
    setActionError(null)
    setPendingDeletion((current) => (current?.type.id === type.id ? null : current))

    try {
      await repositories.itemTypes.restore(type.id)
    } catch {
      setActionError('Le type n’a pas pu être restauré.')
    }
  }

  async function requestDelete(type: ItemType): Promise<void> {
    setActionError(null)
    setEditor(null)
    setPendingDeletion({ type, usage: null, replacementId: '', busy: false })

    try {
      const usage = await repositories.itemTypes.getUsage(type.id)
      setPendingDeletion((current) =>
        current?.type.id === type.id ? { ...current, usage } : current
      )
    } catch {
      setPendingDeletion((current) => (current?.type.id === type.id ? null : current))
      setActionError('Les utilisations de ce type n’ont pas pu être vérifiées.')
    }
  }

  async function confirmDelete(): Promise<void> {
    if (pendingDeletion === null || pendingDeletion.usage === null) return

    const replacementId =
      pendingDeletion.replacementId === '' ? null : pendingDeletion.replacementId

    if (pendingDeletion.usage.total > 0 && replacementId === null) {
      setActionError('Choisissez le type qui remplace ses éléments.')
      return
    }

    setPendingDeletion({ ...pendingDeletion, busy: true })
    setActionError(null)

    try {
      await repositories.itemTypes.deleteWithReassignment(pendingDeletion.type.id, replacementId)
      setPendingDeletion(null)
    } catch {
      setPendingDeletion({ ...pendingDeletion, busy: false })
      setActionError('Le type n’a pas pu être supprimé.')
    }
  }

  function renderDeletionPanel(type: ItemType): React.JSX.Element | null {
    if (pendingDeletion === null || pendingDeletion.type.id !== type.id) return null

    const usage = pendingDeletion.usage
    const replacements = activeTypes.filter((candidate) => candidate.id !== type.id)
    const requiresReplacement = usage !== null && usage.total > 0

    return (
      <div className={styles.confirmPanel}>
        {usage === null ? (
          <p className={styles.confirmText}>Vérification des utilisations…</p>
        ) : usage.total === 0 ? (
          <p className={styles.confirmText}>Supprimer « {type.name} » ?</p>
        ) : (
          <>
            <p className={styles.confirmText}>
              « {type.name} » est utilisé par {describeUsage(usage)}. Choisissez le type qui
              remplace ses éléments :
            </p>
            {replacements.length === 0 ? (
              <p className={styles.confirmText}>
                Créez ou restaurez d’abord un autre type pour pouvoir réaffecter ces éléments.
              </p>
            ) : (
              <select
                className={styles.confirmSelect}
                value={pendingDeletion.replacementId}
                aria-label="Type de remplacement"
                disabled={pendingDeletion.busy}
                onChange={(event) =>
                  setPendingDeletion((current) =>
                    current === null ? current : { ...current, replacementId: event.target.value }
                  )
                }
              >
                <option value="">Choisir un type…</option>
                {replacements.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => setPendingDeletion(null)}
            disabled={pendingDeletion.busy || usage === null}
          >
            Annuler
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void confirmDelete()}
            disabled={
              pendingDeletion.busy ||
              usage === null ||
              (requiresReplacement && pendingDeletion.replacementId === '')
            }
          >
            {pendingDeletion.busy ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    )
  }

  if (types === null) {
    return (
      <div className={styles.screen}>
        <div className={styles.container}>
          <p className={styles.loadingText}>{loadError ?? 'Chargement des types…'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Types</h1>
            <p className={styles.subtitle}>
              Définissez le rendu et le comportement de chaque type d’élément.
            </p>
          </div>
          {editor === null && (
            <button type="button" className={styles.primaryButton} onClick={openCreate}>
              <Icon name="plus" size={15} />
              Nouveau type
            </button>
          )}
        </header>

        {(loadError ?? actionError) !== null && (
          <p className={styles.banner} role="alert">
            {loadError ?? actionError}
          </p>
        )}

        {editor?.mode === 'create' && (
          <section className={styles.editorCard} aria-label="Nouveau type">
            <h2 className={styles.sectionTitle}>Nouveau type</h2>
            <TypeForm
              key="new-type"
              mode="create"
              onSubmit={handleSubmit}
              onCancel={() => setEditor(null)}
            />
          </section>
        )}

        {activeTypes.length === 0 ? (
          <p className={styles.emptyState}>
            Aucun type actif. Créez un type pour pouvoir ajouter des éléments.
          </p>
        ) : (
          <section className={styles.groupCard}>
            {activeTypes.map((type, index) => (
              <Fragment key={type.id}>
                {editor?.mode === 'edit' && editor.typeId === type.id ? (
                  <div className={styles.inlineEditor}>
                    <TypeForm
                      key={type.id}
                      mode="edit"
                      initial={{
                        name: type.name,
                        style: type.style,
                        color: type.color,
                        isTask: type.isTask,
                        countdown: type.countdown,
                        placement: type.placement
                      }}
                      onSubmit={handleSubmit}
                      onCancel={() => setEditor(null)}
                    />
                  </div>
                ) : (
                  <div className={styles.typeRow}>
                    <span
                      className={
                        type.color === null
                          ? `${styles.swatch} ${styles.swatchEmpty}`
                          : styles.swatch
                      }
                      style={
                        type.color === null
                          ? undefined
                          : ({ '--type-color': type.color } as React.CSSProperties)
                      }
                      aria-hidden="true"
                    />
                    <div className={styles.main}>
                      <span className={styles.typeName}>{type.name}</span>
                      <span className={styles.details}>
                        {styleLabel(type.style)}
                        <span className={styles.separator}>·</span>
                        {placementLabel(type.placement)}
                        {type.isTask && (
                          <>
                            <span className={styles.separator}>·</span>
                            Tâche
                          </>
                        )}
                        {type.countdown && (
                          <>
                            <span className={styles.separator}>·</span>
                            Compte à rebours
                          </>
                        )}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      <IconButton
                        label="Monter le type"
                        icon="arrowUp"
                        disabled={index === 0}
                        onClick={() => void moveType(type.id, 'up')}
                      />
                      <IconButton
                        label="Descendre le type"
                        icon="arrowDown"
                        disabled={index === activeTypes.length - 1}
                        onClick={() => void moveType(type.id, 'down')}
                      />
                      <IconButton
                        label="Modifier le type"
                        icon="pencil"
                        onClick={() => openEdit(type)}
                      />
                      <IconButton
                        label="Archiver le type"
                        icon="archive"
                        onClick={() => void archiveType(type)}
                      />
                      <IconButton
                        label="Supprimer le type"
                        icon="trash"
                        onClick={() => void requestDelete(type)}
                      />
                    </div>
                  </div>
                )}
                {renderDeletionPanel(type)}
              </Fragment>
            ))}
          </section>
        )}

        {archivedTypes.length > 0 && (
          <section className={styles.archivedSection}>
            <button
              type="button"
              className={styles.archivedToggle}
              aria-expanded={archivedOpen}
              onClick={() => setArchivedOpen((current) => !current)}
            >
              <Icon name={archivedOpen ? 'chevronDown' : 'chevronRight'} size={14} />
              Archivés
              <span className={styles.archivedCount}>{archivedTypes.length}</span>
            </button>

            {archivedOpen && (
              <div className={styles.groupCard}>
                {archivedTypes.map((type) => (
                  <Fragment key={type.id}>
                    <div className={`${styles.typeRow} ${styles.typeRowMuted}`}>
                      <span
                        className={
                          type.color === null
                            ? `${styles.swatch} ${styles.swatchEmpty}`
                            : styles.swatch
                        }
                        style={
                          type.color === null
                            ? undefined
                            : ({ '--type-color': type.color } as React.CSSProperties)
                        }
                        aria-hidden="true"
                      />
                      <div className={styles.main}>
                        <span className={styles.typeName}>{type.name}</span>
                        <span className={styles.details}>
                          {styleLabel(type.style)}
                          <span className={styles.separator}>·</span>
                          {placementLabel(type.placement)}
                        </span>
                      </div>
                      <div className={styles.rowActions}>
                        <IconButton
                          label="Désarchiver le type"
                          icon="restore"
                          onClick={() => void restoreType(type)}
                        />
                        <IconButton
                          label="Supprimer le type"
                          icon="trash"
                          onClick={() => void requestDelete(type)}
                        />
                      </div>
                    </div>
                    {renderDeletionPanel(type)}
                  </Fragment>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

interface IconButtonProps {
  label: string
  icon: IconName
  disabled?: boolean
  onClick: () => void
}

function IconButton({
  label,
  icon,
  disabled = false,
  onClick
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={15} />
    </button>
  )
}
