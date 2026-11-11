import { useEffect, useState } from 'react'
import { repositories } from '../db/repositories'
import { prepareApplication, type ApplicationStartup } from '../db/startup'
import { CategoriesScreen } from './categories/CategoriesScreen'
import { AppMenu } from './components/AppMenu'
import { WelcomeScreen } from './onboarding/WelcomeScreen'
import styles from './App.module.css'

type Screen = 'categories'

function App(): React.JSX.Element {
  const [startup, setStartup] = useState<ApplicationStartup | null>(null)
  const [startupError, setStartupError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [screen, setScreen] = useState<Screen>('categories')

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
    <div className={styles.app}>
      <header className={styles.topBar}>
        <span className={styles.brand}>Planner</span>
        <AppMenu onOpenCategories={() => setScreen('categories')} />
      </header>
      <main className={styles.content}>{screen === 'categories' && <CategoriesScreen />}</main>
    </div>
  )
}

export default App
