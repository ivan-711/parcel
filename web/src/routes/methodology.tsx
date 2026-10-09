import { createFileRoute } from '@tanstack/react-router'

import { PublicNav } from '../features/shell/nav'

export const Route = createFileRoute('/methodology')({
  component: () => (
    <>
      <PublicNav />
      <h1>Methodology</h1>
    </>
  ),
})
