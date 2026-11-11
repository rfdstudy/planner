import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import styles from './AppMenu.module.css'

interface AppMenuProps {
  onOpenCategories: () => void
  onOpenTemplates: () => void
  /** Commande de développement uniquement. */
  onLoadDemo?: () => void
  demoLoading?: boolean
}

export function AppMenu({
  onOpenCategories,
  onOpenTemplates,
  onLoadDemo,
  demoLoading = false
}: AppMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (wrapperRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return

      setOpen(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    itemRef.current?.focus()

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Menu
        <Icon name="chevronDown" size={14} />
      </button>

      {open && (
        <div className={styles.panel} role="menu" aria-label="Menu principal">
          <button
            ref={itemRef}
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenTemplates()
            }}
          >
            Semaine type
          </button>

          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenCategories()
            }}
          >
            Catégories
          </button>

          {import.meta.env.DEV && onLoadDemo !== undefined && (
            <>
              <div className={styles.divider} role="separator" />
              <button
                type="button"
                className={styles.item}
                role="menuitem"
                disabled={demoLoading}
                onClick={() => {
                  setOpen(false)
                  onLoadDemo()
                }}
              >
                {demoLoading ? 'Chargement…' : 'Charger des données de démonstration'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
