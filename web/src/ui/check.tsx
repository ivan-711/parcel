import { Check as CheckIcon, ChevronRight, TriangleAlert } from 'lucide-react'

const SIZE = 14

/** The three marks the app repeats: a check, a warning and a chevron, all from one icon set. */
export function Check({ className }: { className?: string }) {
  return <CheckIcon size={SIZE} strokeWidth={2.4} className={className} aria-hidden="true" />
}

export function Warn({ className }: { className?: string }) {
  return <TriangleAlert size={SIZE} strokeWidth={2} className={className} aria-hidden="true" />
}

export function Chevron({
  direction = 'right',
  className,
}: {
  direction?: 'right' | 'left' | 'down'
  className?: string
}) {
  const rotate = direction === 'left' ? 180 : direction === 'down' ? 90 : 0
  return (
    <ChevronRight
      size={12}
      strokeWidth={2.2}
      className={className}
      aria-hidden="true"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    />
  )
}
