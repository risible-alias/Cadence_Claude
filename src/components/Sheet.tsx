import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A modal sheet built on the native dialog element: it rises from the foot of
 * the screen on a phone and sits centred on wider screens. Escape and the
 * browser's own dismissal both call `onClose`.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    // Safari before 15.4 has no modal dialogs; show it in the page flow instead.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [])

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={headingId} onClose={onClose}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </dialog>
  )
}
