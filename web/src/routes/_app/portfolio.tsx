import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/portfolio')({ component: () => <h1>Portfolio</h1> })
