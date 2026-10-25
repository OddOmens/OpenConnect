import { AsoView } from '@/components/aso/aso-view'
import type { App } from '@/components/dashboard/app-selector'
import { requireSignIn } from '@/lib/auth-page'
import { appsResponse } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function AsoPage() {
  await requireSignIn()
  return <AsoView apps={appsResponse().apps as unknown as App[]} />
}
