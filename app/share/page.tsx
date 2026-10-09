import { ShareStudio } from '@/components/share/share-studio'
import { requireSignIn } from '@/lib/auth-page'

export const dynamic = 'force-dynamic'

export default function SharePage() {
  requireSignIn()
  return <ShareStudio />
}
