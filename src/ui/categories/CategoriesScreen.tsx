import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { liveQuery } from 'dexie'
import { moveOrderedId, normalizeCategoryName, sortByOrder } from '../../core/categories'
import type { Category, CategoryGroup } from '../../core/types'
import { repositories } from '../../db/repositories'
import type { CategoryUsage } from '../../db/repositories/categories'
import { categoryColorStyle } from '../categoryColorStyle'
import { Icon, type IconName } from '../components/Icon'
import { CategoryForm, type CategoryFormValues } from './CategoryForm'
import styles from './CategoriesScreen.module.css'

interface CategoriesOverview {
  groups: CategoryGroup[]
  categories: Category[]
}

type CategoryEditorState =
  { mode: 'create'; groupId: string | null } | { mode: 'edit'; categoryId: string }

type GroupEditorState = { mode: 'create' } | { mode: 'rename'; groupId: string }

interface CategoryDeletionState {
  category: Category
  usage: CategoryUsage | null
  replacementId: string
  busy: boolean
}

interface CategorySection {
  key: string
  name: string
  group: CategoryGroup | null
  categories: Category[]
}

export function CategoriesScreen(): React.JSX.Element {
  const [overview, setOverview] = useState<CategoriesOverview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState | null>(null)
  const [groupEditor, setGroupEditor] = useState<GroupEditorState | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<CategoryDeletionState | null>(null)
  const [pendingGroupDeletionId, setPendingGroupDeletionId] = useState<string | null>(null)
  const [groupDeletionBusy, setGroupDeletionBusy] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)

  useEffect(() => {
    const subscription = liveQuery(async () => ({
      groups: sortByOrder(await repositories.categoryGroups.list()),
      categories: await repositories.categories.list()
    })).subscribe({
      next: (data) => {
        setOverview(data)
        setLoadError(null)
      },
      error: () => setLoadError('Impossible de lire les catégories.')
    })

    return () => subscription.unsubscribe()
  }, [])

  const groups = sortByOrder(overview?.groups ?? [])
  const groupIds = new Set(groups.map((group) => group.id))
  const activeCategories = (overview?.categories ?? []).filter(
    (category) => category.archivedAt === null
  )
  const archivedCategories = (overview?.categories ?? [])
    .filter((category) => category.archivedAt !== null)
    .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))

  const sections: CategorySection[] = groups.map((group) => ({
    key: group.id,
    name: group.name,
    group,
    categories: activeCategories
      .filter((category) => category.groupId === group.id)
      .sort((a, b) => a.order - b.order)
  }))

  const ungroupedCategories = activeCategories
    .filter((category) => category.groupId === null || !groupIds.has(category.groupId))
    .sort((a, b) => a.order - b.order)

  if (ungroupedCategories.length > 0) {
    sections.push({
      key: 'ungrouped',
      name: 'Sans groupe',
      group: null,
      categories: ungroupedCategories
    })
  }

  function resetInlinePanels(): void {
    setGroupEditor(null)
    setPendingDeletion(null)
    setPendingGroupDeletionId(null)
    setGroupDeletionBusy(false)
  }

  function openCreateCategory(): void {
    setActionError(null)
    resetInlinePanels()
    setCategoryEditor({ mode: 'create', groupId: groups[0]?.id ?? null })
  }

  function openEditCategory(category: Category): void {
    setActionError(null)
    resetInlinePanels()
    setCategoryEditor({ mode: 'edit', categoryId: category.id })
  }

  function openCreateGroup(): void {
    setActionError(null)
    resetInlinePanels()
    setCategoryEditor(null)
    setGroupEditor({ mode: 'create' })
  }

  function openRenameGroup(group: CategoryGroup): void {
    setActionError(null)
    resetInlinePanels()
    setCategoryEditor(null)
    setGroupEditor({ mode: 'rename', groupId: group.id })
  }

  async function handleCategorySubmit(values: CategoryFormValues): Promise<void> {
    if (categoryEditor === null) return

    if (categoryEditor.mode === 'create') {
      await repositories.categories.create(values)
    } else {
      await repositories.categories.updateDetails(categoryEditor.categoryId, values)
    }

    setCategoryEditor(null)
  }

  async function handleGroupNameSubmit(name: string): Promise<void> {
    if (groupEditor === null) return

    if (groupEditor.mode === 'create') {
      await repositories.categoryGroups.create({ name })
    } else {
      await repositories.categoryGroups.update(groupEditor.groupId, { name })
    }

    setGroupEditor(null)
  }

  async function moveCategory(
    categoryId: string,
    sectionCategories: readonly Category[],
    direction: 'up' | 'down'
  ): Promise<void> {
    const orderedIds = sectionCategories.map((category) => category.id)
    const reordered = moveOrderedId(orderedIds, categoryId, direction)

    if (reordered.every((id, index) => id === orderedIds[index])) return

    setActionError(null)

    try {
      await repositories.categories.reorder(reordered)
    } catch {
      setActionError('Le réordonnancement des catégories a échoué.')
    }
  }

  async function moveGroup(groupId: string, direction: 'up' | 'down'): Promise<void> {
    const orderedIds = groups.map((group) => group.id)
    const reordered = moveOrderedId(orderedIds, groupId, direction)

    if (reordered.every((id, index) => id === orderedIds[index])) return

    setActionError(null)

    try {
      await repositories.categoryGroups.reorder(reordered)
    } catch {
      setActionError('Le réordonnancement des groupes a échoué.')
    }
  }

  async function archiveCategory(category: Category): Promise<void> {
    setActionError(null)
    setPendingDeletion((current) => (current?.category.id === category.id ? null : current))

    try {
      await repositories.categories.archive(category.id)
    } catch {
      setActionError('La catégorie n’a pas pu être archivée.')
    }
  }

  async function restoreCategory(category: Category): Promise<void> {
    setActionError(null)
    setPendingDeletion((current) => (current?.category.id === category.id ? null : current))

    try {
      await repositories.categories.restore(category.id)
    } catch {
      setActionError('La catégorie n’a pas pu être restaurée.')
    }
  }

  async function requestDeleteCategory(category: Category): Promise<void> {
    setActionError(null)
    setCategoryEditor(null)
    setGroupEditor(null)
    setPendingGroupDeletionId(null)
    setGroupDeletionBusy(false)
    setPendingDeletion({ category, usage: null, replacementId: '', busy: false })

    try {
      const usage = await repositories.categories.getUsage(category.id)
      setPendingDeletion((current) =>
        current?.category.id === category.id ? { ...current, usage } : current
      )
    } catch {
      setPendingDeletion((current) => (current?.category.id === category.id ? null : current))
      setActionError('Les utilisations de cette catégorie n’ont pas pu être vérifiées.')
    }
  }

  async function confirmDeleteCategory(): Promise<void> {
    if (pendingDeletion === null || pendingDeletion.usage === null) return

    const replacementId =
      pendingDeletion.replacementId === '' ? null : pendingDeletion.replacementId

    setPendingDeletion({ ...pendingDeletion, busy: true })
    setActionError(null)

    try {
      await repositories.categories.deleteWithReassignment(
        pendingDeletion.category.id,
        replacementId
      )
      setPendingDeletion(null)
    } catch {
      setPendingDeletion({ ...pendingDeletion, busy: false })
      setActionError('La catégorie n’a pas pu être supprimée.')
    }
  }

  function requestDeleteGroup(group: CategoryGroup): void {
    setActionError(null)
    setCategoryEditor(null)
    setGroupEditor(null)
    setPendingDeletion(null)
    setPendingGroupDeletionId(group.id)
    setGroupDeletionBusy(false)
  }

  async function confirmDeleteGroup(): Promise<void> {
    if (pendingGroupDeletionId === null) return

    setGroupDeletionBusy(true)
    setActionError(null)

    try {
      await repositories.categoryGroups.deleteWithCategoryUnassignment(pendingGroupDeletionId)
      setPendingGroupDeletionId(null)
      setGroupDeletionBusy(false)
    } catch {
      setGroupDeletionBusy(false)
      setActionError('Le groupe n’a pas pu être supprimé.')
    }
  }

  function renderDeletionPanel(category: Category): React.JSX.Element | null {
    if (pendingDeletion === null || pendingDeletion.category.id !== category.id) return null

    const usage = pendingDeletion.usage
    const replacementGroups = groups
      .map((group) => ({
        group,
        categories: activeCategories
          .filter((candidate) => candidate.id !== category.id && candidate.groupId === group.id)
          .sort((a, b) => a.order - b.order)
      }))
      .filter((entry) => entry.categories.length > 0)
    const ungroupedOptions = activeCategories
      .filter(
        (candidate) =>
          candidate.id !== category.id &&
          (candidate.groupId === null || !groupIds.has(candidate.groupId))
      )
      .sort((a, b) => a.order - b.order)

    return (
      <div className={styles.confirmPanel}>
        {usage === null ? (
          <p className={styles.confirmText}>Vérification des utilisations…</p>
        ) : usage.total === 0 ? (
          <p className={styles.confirmText}>Supprimer « {category.name} » ?</p>
        ) : (
          <>
            <p className={styles.confirmText}>
              « {category.name} » est utilisée par {describeUsage(usage)}. Choisissez ce qui la
              remplace :
            </p>
            <select
              className={styles.confirmSelect}
              value={pendingDeletion.replacementId}
              aria-label="Catégorie de remplacement"
              disabled={pendingDeletion.busy}
              onChange={(event) =>
                setPendingDeletion((current) =>
                  current === null ? current : { ...current, replacementId: event.target.value }
                )
              }
            >
              <option value="">Aucune catégorie</option>
              {replacementGroups.map(({ group, categories }) => (
                <optgroup key={group.id} label={group.name}>
                  {categories.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              {ungroupedOptions.length > 0 && (
                <optgroup label="Sans groupe">
                  {ungroupedOptions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
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
            onClick={() => void confirmDeleteCategory()}
            disabled={pendingDeletion.busy || usage === null}
          >
            {pendingDeletion.busy ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    )
  }

  if (overview === null) {
    return (
      <div className={styles.screen}>
        <div className={styles.container}>
          <p className={styles.loadingText}>{loadError ?? 'Chargement des catégories…'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.title}>Catégories</h1>
            <p className={styles.subtitle}>Organisez vos tâches par matière ou par projet.</p>
          </div>
          {categoryEditor === null && (
            <button type="button" className={styles.primaryButton} onClick={openCreateCategory}>
              <Icon name="plus" size={15} />
              Nouvelle catégorie
            </button>
          )}
        </header>

        {(loadError ?? actionError) !== null && (
          <p className={styles.banner} role="alert">
            {loadError ?? actionError}
          </p>
        )}

        {categoryEditor?.mode === 'create' && (
          <section className={styles.editorCard} aria-label="Nouvelle catégorie">
            <h2 className={styles.sectionTitle}>Nouvelle catégorie</h2>
            <CategoryForm
              key="new-category"
              mode="create"
              initialGroupId={categoryEditor.groupId}
              groups={groups}
              onSubmit={handleCategorySubmit}
              onCancel={() => setCategoryEditor(null)}
            />
          </section>
        )}

        <div className={styles.sections}>
          {sections.map((section) => {
            const group = section.group
            const groupIndex =
              group === null ? -1 : groups.findIndex((item) => item.id === group.id)
            const renamingGroup =
              group !== null && groupEditor?.mode === 'rename' && groupEditor.groupId === group.id

            return (
              <section className={styles.groupCard} key={section.key}>
                <div className={styles.groupHeader}>
                  {renamingGroup && group !== null ? (
                    <GroupNameForm
                      key={group.id}
                      initialName={group.name}
                      submitLabel="Enregistrer"
                      onSubmit={handleGroupNameSubmit}
                      onCancel={() => setGroupEditor(null)}
                    />
                  ) : (
                    <>
                      <h2 className={styles.groupName}>{section.name}</h2>
                      {group !== null && (
                        <div className={styles.groupActions}>
                          <IconButton
                            label="Monter le groupe"
                            icon="arrowUp"
                            disabled={groupIndex <= 0}
                            onClick={() => void moveGroup(group.id, 'up')}
                          />
                          <IconButton
                            label="Descendre le groupe"
                            icon="arrowDown"
                            disabled={groupIndex >= groups.length - 1}
                            onClick={() => void moveGroup(group.id, 'down')}
                          />
                          <IconButton
                            label="Renommer le groupe"
                            icon="pencil"
                            onClick={() => openRenameGroup(group)}
                          />
                          <IconButton
                            label="Supprimer le groupe"
                            icon="trash"
                            onClick={() => requestDeleteGroup(group)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {group !== null && pendingGroupDeletionId === group.id && (
                  <div className={styles.confirmPanel}>
                    <p className={styles.confirmText}>
                      Supprimer « {group.name} » ? Les catégories de ce groupe seront conservées,
                      sans groupe.
                    </p>
                    <div className={styles.confirmActions}>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => setPendingGroupDeletionId(null)}
                        disabled={groupDeletionBusy}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => void confirmDeleteGroup()}
                        disabled={groupDeletionBusy}
                      >
                        {groupDeletionBusy ? 'Suppression…' : 'Supprimer'}
                      </button>
                    </div>
                  </div>
                )}

                {section.categories.length === 0 && activeCategories.length > 0 && (
                  <p className={styles.emptyGroup}>Aucune catégorie dans ce groupe.</p>
                )}

                {section.categories.map((category, index) => (
                  <Fragment key={category.id}>
                    {categoryEditor?.mode === 'edit' &&
                    categoryEditor.categoryId === category.id ? (
                      <div className={styles.inlineEditor}>
                        <CategoryForm
                          key={category.id}
                          mode="edit"
                          initialName={category.name}
                          initialColor={category.color}
                          initialGroupId={category.groupId}
                          groups={groups}
                          onSubmit={handleCategorySubmit}
                          onCancel={() => setCategoryEditor(null)}
                        />
                      </div>
                    ) : (
                      <CategoryRow category={category}>
                        <IconButton
                          label="Monter la catégorie"
                          icon="arrowUp"
                          disabled={index === 0}
                          onClick={() => void moveCategory(category.id, section.categories, 'up')}
                        />
                        <IconButton
                          label="Descendre la catégorie"
                          icon="arrowDown"
                          disabled={index === section.categories.length - 1}
                          onClick={() => void moveCategory(category.id, section.categories, 'down')}
                        />
                        <IconButton
                          label="Modifier la catégorie"
                          icon="pencil"
                          onClick={() => openEditCategory(category)}
                        />
                        <IconButton
                          label="Archiver la catégorie"
                          icon="archive"
                          onClick={() => void archiveCategory(category)}
                        />
                        <IconButton
                          label="Supprimer la catégorie"
                          icon="trash"
                          onClick={() => void requestDeleteCategory(category)}
                        />
                      </CategoryRow>
                    )}
                    {renderDeletionPanel(category)}
                  </Fragment>
                ))}
              </section>
            )
          })}
        </div>

        {activeCategories.length === 0 && archivedCategories.length === 0 && (
          <p className={styles.emptyState}>
            Aucune catégorie pour l’instant. Créez une catégorie pour ranger vos tâches par matière
            ou par projet.
          </p>
        )}

        {groupEditor?.mode === 'create' ? (
          <section className={styles.editorCard} aria-label="Nouveau groupe">
            <h2 className={styles.sectionTitle}>Nouveau groupe</h2>
            <GroupNameForm
              key="new-group"
              initialName=""
              submitLabel="Créer"
              onSubmit={handleGroupNameSubmit}
              onCancel={() => setGroupEditor(null)}
            />
          </section>
        ) : (
          <button type="button" className={styles.addGroupButton} onClick={openCreateGroup}>
            <Icon name="plus" size={15} />
            Nouveau groupe
          </button>
        )}

        {archivedCategories.length > 0 && (
          <section className={styles.archivedSection}>
            <button
              type="button"
              className={styles.archivedToggle}
              aria-expanded={archivedOpen}
              onClick={() => setArchivedOpen((current) => !current)}
            >
              <Icon name={archivedOpen ? 'chevronDown' : 'chevronRight'} size={14} />
              Archivées
              <span className={styles.archivedCount}>{archivedCategories.length}</span>
            </button>

            {archivedOpen && (
              <div className={styles.groupCard}>
                {archivedCategories.map((category) => (
                  <Fragment key={category.id}>
                    <CategoryRow category={category} muted>
                      <IconButton
                        label="Désarchiver la catégorie"
                        icon="restore"
                        onClick={() => void restoreCategory(category)}
                      />
                      <IconButton
                        label="Supprimer la catégorie"
                        icon="trash"
                        onClick={() => void requestDeleteCategory(category)}
                      />
                    </CategoryRow>
                    {renderDeletionPanel(category)}
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

interface CategoryRowProps {
  category: Category
  muted?: boolean
  children: ReactNode
}

function CategoryRow({ category, muted = false, children }: CategoryRowProps): React.JSX.Element {
  return (
    <div className={styles.categoryRow}>
      <span className={styles.swatch} style={categoryColorStyle(category.color)} />
      <span className={muted ? styles.categoryNameMuted : styles.categoryName}>
        {category.name}
      </span>
      <div className={styles.rowActions}>{children}</div>
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

interface GroupNameFormProps {
  initialName: string
  submitLabel: string
  onSubmit: (name: string) => Promise<void>
  onCancel: () => void
}

function GroupNameForm({
  initialName,
  submitLabel,
  onSubmit,
  onCancel
}: GroupNameFormProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    if (saving) return

    const normalizedName = normalizeCategoryName(name)

    if (normalizedName.length === 0) {
      setError('Donnez un nom au groupe.')
      inputRef.current?.focus()
      return
    }

    setError(null)
    setSaving(true)

    try {
      await onSubmit(normalizedName)
    } catch {
      setError('L’enregistrement a échoué. Réessayez.')
      setSaving(false)
    }
  }

  return (
    <form className={styles.groupForm} onSubmit={handleSubmit} noValidate>
      <input
        ref={inputRef}
        className={styles.groupInput}
        type="text"
        value={name}
        placeholder="Nom du groupe"
        aria-label="Nom du groupe"
        autoFocus
        maxLength={60}
        disabled={saving}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className={styles.primaryButton} disabled={saving}>
        {submitLabel}
      </button>
      <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={saving}>
        Annuler
      </button>
      {error !== null && (
        <span className={styles.formError} role="alert">
          {error}
        </span>
      )}
    </form>
  )
}

function describeUsage(usage: CategoryUsage): string {
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
