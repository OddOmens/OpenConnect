import { MarketingStudio } from '@/components/marketing/marketing-studio'
import type { PromoScreens } from '@/components/marketing/screen-thumb'
import { requireSignIn } from '@/lib/auth-page'
import { getUiPrefs } from '@/lib/config'
import { appsResponse } from '@/lib/data'
import { promoInfo, statsVersion } from '@/lib/promo-screens'

export const dynamic = 'force-dynamic'

// How long the page waits for the promo app's material (from disk after the first time) before
// leaving it to the browser to fetch.
const INFO_WAIT = 1200

// Rendered with the settings and apps already in the HTML, so the cards start loading at once
// instead of after two API calls; the promo app's screenshots too, when they're quick to get.
export default async function MarketingPage() {
  await requireSignIn()
  const prefs = getUiPrefs()
  const { apps, months } = appsResponse() as { apps: { apple_id: string; hidden?: number | boolean }[]; months: string[] }
  const visible = apps.filter((a) => !a.hidden)
  const promoApp = visible.find((a) => a.apple_id === prefs.marketing.app) ?? visible[0]
  let screens: { app: string; data: PromoScreens } | null = null
  if (prefs.marketing.mode === 'promo' && promoApp) {
    const info = await Promise.race([promoInfo(promoApp.apple_id).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), INFO_WAIT))])
    if (info) screens = { app: promoApp.apple_id, data: info as unknown as PromoScreens }
  }
  return <MarketingStudio initial={{ share: prefs.share, marketing: prefs.marketing, apps: visible as never, months, screens, statsVersion: statsVersion() }} />
}
