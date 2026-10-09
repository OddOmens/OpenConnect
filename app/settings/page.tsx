import { SettingsView, ServerSettings } from '@/components/settings/settings-view'
import { requireSignIn } from '@/lib/auth-page'
import { appsResponse, settingsResponse } from '@/lib/data'
import pkg from '../../package.json'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireSignIn()
  return <SettingsView initial={settingsResponse() as ServerSettings} apps={appsResponse().apps as any} version={pkg.version} />
}
