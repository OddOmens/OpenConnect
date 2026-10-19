import { StudioEditor } from '@/components/studio/studio-editor'
import { StudioFrame } from '@/components/studio/studio-nav'
import { requireSignIn } from '@/lib/auth-page'

export const dynamic = 'force-dynamic'

export default async function StudioPage() {
  await requireSignIn('/studio')
  return (
    <StudioFrame>
      <div id="root">
        <StudioEditor />
      </div>
    </StudioFrame>
  )
}
