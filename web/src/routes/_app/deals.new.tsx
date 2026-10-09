import { createFileRoute } from '@tanstack/react-router'

import { NewDeal } from '../../features/deals/new'

export const Route = createFileRoute('/_app/deals/new')({ component: NewDeal })
