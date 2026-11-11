import { Icon } from '../components/Icon'
import { AppMenu } from '../components/AppMenu'
import styles from './WeekTopBar.module.css'

interface WeekTopBarProps {
  weekLabel: string
  onPreviousWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  onOpenCategories: () => void
  onLoadDemo?: () => void
  demoLoading: boolean
}

export function WeekTopBar({
  weekLabel,
  onPreviousWeek,
  onNextWeek,
  onToday,
  onOpenCategories,
  onLoadDemo,
  demoLoading
}: WeekTopBarProps): React.JSX.Element {
  return (
    <header className={styles.topBar}>
      <div className={styles.left}>
        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.arrowButton}
            aria-label="Semaine précédente"
            title="Semaine précédente"
            onClick={onPreviousWeek}
          >
            <Icon name="chevronLeft" size={17} />
          </button>
          <button
            type="button"
            className={styles.arrowButton}
            aria-label="Semaine suivante"
            title="Semaine suivante"
            onClick={onNextWeek}
          >
            <Icon name="chevronRight" size={17} />
          </button>
        </div>

        <h1 className={styles.weekLabel}>{weekLabel}</h1>

        <button type="button" className={styles.todayButton} onClick={onToday}>
          Aujourd’hui
        </button>
      </div>

      <div className={styles.right}>
        <div className={styles.viewSwitch} role="group" aria-label="Échelle de temps">
          <button
            type="button"
            className={styles.viewButton}
            title="La vue Jour arrive prochainement"
            disabled
          >
            Jour
          </button>
          <button
            type="button"
            className={`${styles.viewButton} ${styles.viewButtonActive}`}
            aria-pressed="true"
          >
            Semaine
          </button>
        </div>

        <button
          type="button"
          className={styles.search}
          aria-label="Rechercher (bientôt disponible)"
          title="La recherche arrive prochainement"
          disabled
        >
          <span className={styles.searchPlaceholder}>Rechercher…</span>
          <kbd className={styles.shortcut}>Ctrl K</kbd>
        </button>

        <AppMenu
          onOpenCategories={onOpenCategories}
          onLoadDemo={onLoadDemo}
          demoLoading={demoLoading}
        />
      </div>
    </header>
  )
}
