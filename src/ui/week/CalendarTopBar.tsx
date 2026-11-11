import type { CalendarViewMode } from '../../state/ui'
import { Icon } from '../components/Icon'
import { AppMenu } from '../components/AppMenu'
import styles from './CalendarTopBar.module.css'

interface CalendarTopBarProps {
  viewMode: CalendarViewMode
  title: string
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onChangeView: (viewMode: CalendarViewMode) => void
  onOpenPalette: () => void
  onOpenCategories: () => void
  onOpenTemplates: () => void
  onLoadDemo?: () => void
  demoLoading: boolean
}

export function CalendarTopBar({
  viewMode,
  title,
  onPrevious,
  onNext,
  onToday,
  onChangeView,
  onOpenPalette,
  onOpenCategories,
  onOpenTemplates,
  onLoadDemo,
  demoLoading
}: CalendarTopBarProps): React.JSX.Element {
  const previousLabel = viewMode === 'day' ? 'Jour précédent' : 'Semaine précédente'
  const nextLabel = viewMode === 'day' ? 'Jour suivant' : 'Semaine suivante'

  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.arrowButton}
            aria-label={previousLabel}
            title={`${previousLabel} (←)`}
            onClick={onPrevious}
          >
            <Icon name="chevronLeft" size={17} />
          </button>
          <button
            type="button"
            className={styles.arrowButton}
            aria-label={nextLabel}
            title={`${nextLabel} (→)`}
            onClick={onNext}
          >
            <Icon name="chevronRight" size={17} />
          </button>
        </div>

        <h1 className={styles.periodLabel}>{title}</h1>

        <button
          type="button"
          className={styles.todayButton}
          title="Aujourd’hui (T)"
          onClick={onToday}
        >
          Aujourd’hui
        </button>
      </div>

      <div className={styles.right}>
        <div className={styles.viewSwitch} role="group" aria-label="Échelle de temps">
          <button
            type="button"
            className={
              viewMode === 'day'
                ? `${styles.viewButton} ${styles.viewButtonActive}`
                : styles.viewButton
            }
            aria-pressed={viewMode === 'day'}
            title="Vue Jour (1)"
            onClick={() => onChangeView('day')}
          >
            Jour
          </button>
          <button
            type="button"
            className={
              viewMode === 'week'
                ? `${styles.viewButton} ${styles.viewButtonActive}`
                : styles.viewButton
            }
            aria-pressed={viewMode === 'week'}
            title="Vue Semaine (2)"
            onClick={() => onChangeView('week')}
          >
            Semaine
          </button>
        </div>

        <button
          type="button"
          className={styles.search}
          aria-label="Ouvrir la palette de commandes"
          title="Palette de commandes (Ctrl+K)"
          onClick={onOpenPalette}
        >
          <span className={styles.searchPlaceholder}>Commandes…</span>
          <kbd className={styles.shortcut}>Ctrl K</kbd>
        </button>

        <AppMenu
          onOpenCategories={onOpenCategories}
          onOpenTemplates={onOpenTemplates}
          onLoadDemo={onLoadDemo}
          demoLoading={demoLoading}
        />
      </div>
    </header>
  )
}
