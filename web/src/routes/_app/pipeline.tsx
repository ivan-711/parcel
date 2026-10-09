import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/pipeline')({ component: () => <h1>Pipeline</h1> })
