import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import styles from './AppMenu.module.css'

interface AppMenuProps {
  onOpenCategories: () => void
}

export function AppMenu({ onOpenCategories }: AppMenuProps): React.JSX.Element {
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
            aria-current="page"
            onClick={() => {
              setOpen(false)
              onOpenCategories()
            }}
          >
            <Icon name="check" size={14} className={styles.itemIcon} />
            Catégories
          </button>
        </div>
      )}
    </div>
  )
}
