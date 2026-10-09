import { Link, type LinkProps } from '@tanstack/react-router'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import styles from './button.module.css'

type Look = 'default' | 'primary' | 'plain'
type Size = 'default' | 'large' | 'small'

function classes(look: Look, size: Size, extra?: string) {
  return [
    styles.button,
    look !== 'default' && styles[look],
    size !== 'default' && styles[size],
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  look?: Look
  size?: Size
}

export function Button({ look = 'default', size = 'default', className, ...rest }: ButtonProps) {
  return <button type="button" className={classes(look, size, className)} {...rest} />
}

interface LinkButtonProps {
  look?: Look
  size?: Size
  className?: string
  children: ReactNode
  to: LinkProps['to']
  params?: LinkProps['params']
  search?: LinkProps['search']
}

export function LinkButton({
  look = 'default',
  size = 'default',
  className,
  ...rest
}: LinkButtonProps) {
  return <Link className={classes(look, size, className)} {...rest} />
}
