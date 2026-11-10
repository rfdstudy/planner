import styles from './App.module.css'

function App(): React.JSX.Element {
  return (
    <div className={styles.app}>
      <header className={styles.topBar} />
      <main className={styles.content} />
    </div>
  )
}

export default App
