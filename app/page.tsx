import { Dashboard, InitialData } from '@/components/dashboard/dashboard'
import { requireSignIn } from '@/lib/auth-page'
import { appsResponse, dashboardResponse, settingsResponse, storeResponse } from '@/lib/data'

export const dynamic = 'force-dynamic'

// Rendered on the server with the first view's data already in the HTML: the dashboard
// shows its numbers without waiting for any API call. All of it comes from the local DB.
export default function DashboardPage() {
  requireSignIn()
  const settings = settingsResponse()
  const { prefs } = settings
  const initial = {
    ...appsResponse(),
    settings,
    dash: dashboardResponse({ app: null, range: prefs.range, granularity: prefs.granularity, currency: prefs.currency, compare: prefs.compareToPrevious }),
    store: storeResponse(null),
  } as unknown as InitialData
  return <Dashboard initial={initial} />
}
