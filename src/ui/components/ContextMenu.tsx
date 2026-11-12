import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ContextMenu.module.css'

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  label: string
  items: readonly ContextMenuItem[]
  onClose: () => void
}

const VIEWPORT_MARGIN = 8

/**
 * Menu contextuel sobre, rendu dans le portail du document pour ne pas être
 * rogné par la grille. Il se ferme au clic extérieur, à Échap ou au défilement.
 */
export function ContextMenu({ x, y, label, items, onClose }: ContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const menu = menuRef.current

    if (menu === null) return

    const rect = menu.getBoundingClientRect()
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN)
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN)

    setPosition({
      x: Math.min(Math.max(VIEWPORT_MARGIN, x), maxLeft),
      y: Math.min(Math.max(VIEWPORT_MARGIN, y), maxTop)
    })
  }, [items.length, x, y])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target) === true) {
        return
      }

      onClose()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      onClose()
    }

    const handleScroll = (): void => onClose()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{
        left: `${position?.x ?? x}px`,
        top: `${position?.y ?? y}px`,
        visibility: position === null ? 'hidden' : 'visible'
      }}
      role="menu"
      aria-label={label}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={styles.item}
          disabled={item.disabled}
          onClick={() => {
            item.onSelect()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
