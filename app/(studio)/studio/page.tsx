import { StudioEditor } from '@/components/studio/studio-editor'
import { requireSignIn } from '@/lib/auth-page'

export const dynamic = 'force-dynamic'

export default async function StudioPage() {
  await requireSignIn('/studio')
  return (
    <div id="root">
      <StudioEditor />
    </div>
  )
}
