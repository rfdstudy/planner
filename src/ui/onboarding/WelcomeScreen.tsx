import { useEffect, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import {
  DEFAULT_CATEGORY_COLOR,
  normalizeCategoryColor,
  normalizeCategoryName,
  sortByOrder
} from '../../core/categories'
import type { CategoryGroup } from '../../core/types'
import { repositories } from '../../db/repositories'
import { finishOnboarding, type OnboardingCategoryInput } from '../../db/startup'
import { categoryColorStyle } from '../categoryColorStyle'
import { ColorPicker } from '../components/ColorPicker'
import { Icon } from '../components/Icon'
import styles from './WelcomeScreen.module.css'

interface WelcomeScreenProps {
  onFinished: () => void
}

interface DraftCategory extends OnboardingCategoryInput {
  key: string
}

export function WelcomeScreen({ onFinished }: WelcomeScreenProps): React.JSX.Element {
  const [groups, setGroups] = useState<CategoryGroup[] | null>(null)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftCategory[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const initialGroupChosen = useRef(false)

  useEffect(() => {
    const subscription = liveQuery(() => repositories.categoryGroups.list()).subscribe({
      next: (records) => {
        const sortedGroups = sortByOrder(records)
        setGroups(sortedGroups)
        setGroupsError(null)

        if (!initialGroupChosen.current) {
          initialGroupChosen.current = true
          setGroupId(sortedGroups[0]?.id ?? null)
        }
      },
      error: () => setGroupsError('Les groupes n’ont pas pu être chargés.')
    })

    return () => subscription.unsubscribe()
  }, [])

  const groupsById = new Map((groups ?? []).map((group) => [group.id, group]))
  const draftSections = sortByOrder(groups ?? [])
    .map((group) => ({
      group,
      categories: drafts.filter((draft) => draft.groupId === group.id)
    }))
    .filter((section) => section.categories.length > 0)
  const ungroupedDrafts = drafts.filter(
    (draft) => draft.groupId === null || !groupsById.has(draft.groupId)
  )

  function handleAdd(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    if (saving) return

    const normalizedName = normalizeCategoryName(name)

    if (normalizedName.length === 0) {
      setFormError('Donnez un nom à la catégorie.')
      nameInputRef.current?.focus()
      return
    }

    const normalizedColor = normalizeCategoryColor(color)

    if (normalizedColor === null) {
      setFormError('Choisissez une couleur valide.')
      return
    }

    setDrafts((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        name: normalizedName,
        color: normalizedColor,
        groupId
      }
    ])
    setName('')
    setFormError(null)
    nameInputRef.current?.focus()
  }

  function removeDraft(key: string): void {
    if (saving) return
    setDrafts((current) => current.filter((draft) => draft.key !== key))
  }

  async function complete(categories: readonly OnboardingCategoryInput[]): Promise<void> {
    if (saving) return

    setSaving(true)
    setSaveError(null)

    try {
      await finishOnboarding(repositories, categories)
      onFinished()
    } catch {
      setSaveError('Vos catégories n’ont pas pu être enregistrées. Réessayez.')
      setSaving(false)
    }
  }

  return (
    <div className={styles.screen}>
      <main className={styles.card}>
        <span className={styles.wordmark}>Planner</span>
        <h1 className={styles.title}>Bienvenue</h1>
        <p className={styles.lead}>
          Créez les catégories qui vous serviront à ranger vos tâches. Vous pourrez les renommer,
          changer leur couleur ou les supprimer à tout moment.
        </p>
        {groups !== null && groups.length > 0 && (
          <p className={styles.hint}>
            Groupes déjà prêts : {groups.map((group) => group.name).join(' · ')}.
          </p>
        )}
        {groupsError !== null && (
          <p className={styles.error} role="alert">
            {groupsError}
          </p>
        )}

        <form className={styles.addForm} onSubmit={handleAdd} noValidate>
          <h2 className={styles.sectionTitle}>Ajouter une catégorie</h2>
          <div className={styles.addRow}>
            <input
              ref={nameInputRef}
              className={styles.nameInput}
              type="text"
              value={name}
              placeholder="Nom de la catégorie"
              aria-label="Nom de la catégorie"
              maxLength={80}
              autoFocus
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
            />
            <select
              className={styles.select}
              value={groupId ?? ''}
              aria-label="Groupe"
              disabled={saving || groups === null}
              onChange={(event) =>
                setGroupId(event.target.value === '' ? null : event.target.value)
              }
            >
              <option value="">Sans groupe</option>
              {(groups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              Ajouter
            </button>
          </div>

          <ColorPicker value={color} onChange={setColor} disabled={saving} />

          {formError !== null && (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          )}
        </form>

        {drafts.length > 0 ? (
          <section className={styles.draftSection} aria-label="Catégories ajoutées">
            <h2 className={styles.sectionTitle}>Vos catégories</h2>
            {draftSections.map((section) => (
              <div className={styles.draftGroup} key={section.group.id}>
                <h3 className={styles.draftGroupName}>{section.group.name}</h3>
                {section.categories.map((draft) => (
                  <DraftRow
                    key={draft.key}
                    draft={draft}
                    disabled={saving}
                    onRemove={() => removeDraft(draft.key)}
                  />
                ))}
              </div>
            ))}
            {ungroupedDrafts.length > 0 && (
              <div className={styles.draftGroup}>
                <h3 className={styles.draftGroupName}>Sans groupe</h3>
                {ungroupedDrafts.map((draft) => (
                  <DraftRow
                    key={draft.key}
                    draft={draft}
                    disabled={saving}
                    onRemove={() => removeDraft(draft.key)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <p className={styles.emptyHint}>Ajoutez au moins une catégorie, ou passez cette étape.</p>
        )}

        {saveError !== null && (
          <p className={styles.error} role="alert">
            {saveError}
          </p>
        )}

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.ghostButton}
            disabled={saving}
            onClick={() => void complete([])}
          >
            Passer cette étape
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={saving || drafts.length === 0}
            onClick={() =>
              void complete(
                drafts.map(({ name: draftName, color: draftColor, groupId: draftGroupId }) => ({
                  name: draftName,
                  color: draftColor,
                  groupId: draftGroupId
                }))
              )
            }
          >
            {saving ? 'Enregistrement…' : 'Commencer'}
          </button>
        </footer>
      </main>
    </div>
  )
}

interface DraftRowProps {
  draft: DraftCategory
  disabled: boolean
  onRemove: () => void
}

function DraftRow({ draft, disabled, onRemove }: DraftRowProps): React.JSX.Element {
  return (
    <div className={styles.draftRow}>
      <span className={styles.swatch} style={categoryColorStyle(draft.color)} />
      <span className={styles.draftName}>{draft.name}</span>
      <button
        type="button"
        className={styles.removeButton}
        aria-label={`Retirer ${draft.name}`}
        title="Retirer"
        disabled={disabled}
        onClick={onRemove}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
