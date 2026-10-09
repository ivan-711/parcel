export function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 10.3l2.6 2.6L14.2 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Warn({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 5.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="1.1" fill="currentColor" />
    </svg>
  )
}

/** A small chevron for links that lead somewhere, drawn in the same stroke as the marks above. */
export function Chevron({
  direction = 'right',
  className,
}: {
  direction?: 'right' | 'left' | 'down'
  className?: string
}) {
  const rotate = direction === 'left' ? 180 : direction === 'down' ? 90 : 0
  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      className={className}
      aria-hidden="true"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    >
      <path
        d="M4.2 2.4L8 6l-3.8 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
