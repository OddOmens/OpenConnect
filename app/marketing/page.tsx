import { MarketingStudio } from '@/components/marketing/marketing-studio'
import { requireSignIn } from '@/lib/auth-page'

export const dynamic = 'force-dynamic'

export default async function MarketingPage() {
  await requireSignIn()
  return <MarketingStudio />
}
