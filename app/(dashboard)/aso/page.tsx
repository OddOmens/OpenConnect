import { AsoView } from '@/components/aso/aso-view'
import type { App } from '@/components/dashboard/app-selector'
import { requireSignIn } from '@/lib/auth-page'
import { appsResponse } from '@/lib/data'
import { asoPortfolio } from '@/lib/aso'
import { getUiPrefs } from '@/lib/config'

export const dynamic = 'force-dynamic'

export default async function AsoPage() {
  await requireSignIn()
  return (
    <AsoView
      initialApps={appsResponse().apps as unknown as App[]}
      initialPortfolio={asoPortfolio(30)}
      sidebar={getUiPrefs().sidebar}
    />
  )
}
