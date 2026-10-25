import Link from 'next/link'
import { Images, LayoutDashboard, Megaphone, Search, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavPage = 'dashboard' | 'aso' | 'marketing' | 'studio' | 'settings'

// The same places, in the same order, on every page. The studio has its own copy of this
// bar in its own styles (components/studio/studio-nav.tsx); keep the two in step.
export const NAV_ITEMS = [
  { page: 'dashboard', href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'aso', href: '/aso', label: 'ASO', icon: Search },
  { page: 'marketing', href: '/marketing', label: 'Marketing', icon: Megaphone },
  { page: 'studio', href: '/studio', label: 'Studio', icon: Images },
] as const

/**
 * The top bar of every page: OpenConnect, its places, the page's own controls (`actions`),
 * and Settings. `children` are extra toolbar rows for the page, inside the same sticky header.
 */
export function AppNav({ active, actions, children }: { active: NavPage; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/* On phones the page's controls wrap to a second row, so the bar itself stays the same everywhere. */}
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 sm:h-14 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-0 lg:px-8">
        <Link href="/" className="shrink-0 text-base font-semibold tracking-tight">
          OpenConnect
        </Link>
        <nav aria-label="Main" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map(({ page, href, label, icon: Icon }) => (
            <Link
              key={page}
              href={href}
              aria-current={active === page ? 'page' : undefined}
              title={label}
              className={cn(
                'flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors',
                active === page ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
        {actions && (
          <div className="order-last flex min-w-0 basis-full items-center justify-end gap-2 sm:order-none sm:ml-auto sm:basis-auto sm:pb-0">
            {actions}
          </div>
        )}
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          aria-current={active === 'settings' ? 'page' : undefined}
          className={cn(
            'ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors sm:ml-0',
            !actions && 'sm:ml-auto',
            active === 'settings' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
      {children}
    </header>
  )
}
