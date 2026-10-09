import { createFileRoute } from '@tanstack/react-router'

import { Methodology } from '../features/methodology/methodology'

export const Route = createFileRoute('/methodology')({ component: Methodology })
