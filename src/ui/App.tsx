import { useEffect, useState } from 'react'
import { repositories } from '../db/repositories'
import { prepareApplication, type ApplicationStartup } from '../db/startup'
import { useUiStore } from '../state/ui'
import { CategoriesScreen } from './categories/CategoriesScreen'
import { CommandPalette } from './commands/CommandPalette'
import { Icon } from './components/Icon'
import { WelcomeScreen } from './onboarding/WelcomeScreen'
import { TemplatesScreen } from './templates/TemplatesScreen'
import { DayView } from './week/DayView'
import { WeekView } from './week/WeekView'
import styles from './App.module.css'

function App(): React.JSX.Element {
  const [startup, setStartup] = useState<ApplicationStartup | null>(null)
  const [startupError, setStartupError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const screen = useUiStore((state) => state.screen)
  const viewMode = useUiStore((state) => state.viewMode)
  const showCalendar = useUiStore((state) => state.showCalendar)
  const togglePalette = useUiStore((state) => state.togglePalette)

  useEffect(() => {
    let cancelled = false

    prepareApplication(repositories)
      .then((state) => {
        if (!cancelled) setStartup(state)
      })
      .catch(() => {
        if (!cancelled) setStartupError(true)
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (startup === null || startup.firstLaunch) return
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 'k') return

      event.preventDefault()
      togglePalette()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [startup, togglePalette])

  const retryStartup = (): void => {
    setStartup(null)
    setStartupError(false)
    setAttempt((current) => current + 1)
  }

  if (startupError) {
    return (
      <div className={styles.centered}>
        <div className={styles.errorBox}>
          <p className={styles.errorText}>Impossible d’ouvrir les données locales de Planner.</p>
          <button type="button" className={styles.retryButton} onClick={retryStartup}>
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  if (startup === null) {
    return (
      <div className={styles.centered}>
        <p className={styles.loading}>Ouverture de Planner…</p>
      </div>
    )
  }

  if (startup.firstLaunch) {
    return <WelcomeScreen onFinished={() => setStartup({ firstLaunch: false })} />
  }

  return (
    <>
      {screen === 'week' ? (
        viewMode === 'day' ? (
          <DayView />
        ) : (
          <WeekView />
        )
      ) : (
        <div className={styles.app}>
          <header className={styles.topBar}>
            <button type="button" className={styles.backButton} onClick={() => showCalendar()}>
              <Icon name="chevronLeft" size={15} />
              Calendrier
            </button>
            <span className={styles.brand}>Planner</span>
          </header>
          <main className={styles.content}>
            {screen === 'templates' ? <TemplatesScreen /> : <CategoriesScreen />}
          </main>
        </div>
      )}

      <CommandPalette />
    </>
  )
}

export default App
