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

/** The phone tab bar: the same places, and Settings. */
export const TAB_ITEMS = [...NAV_ITEMS, { page: 'settings', href: '/settings', label: 'Settings', icon: Settings }] as const

/**
 * The top bar of every page: OpenConnect, its places, the page's own controls (`actions`),
 * and Settings. `children` are extra toolbar rows for the page, just under it.
 * On phones it's an app's navigation bar instead: the page's title and controls, with the
 * places in a tab bar along the bottom.
 */
export function AppNav({ active, actions, children }: { active: NavPage; actions?: React.ReactNode; children?: React.ReactNode }) {
  const title = TAB_ITEMS.find((t) => t.page === active)?.label
  return (
    <>
      <header className="sticky top-0 z-40 select-none border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-backdrop-filter:bg-background/75">
        {/* On phones the page's controls wrap to a second row when they don't fit beside the title. */}
        <div className="mx-auto flex min-h-14 max-w-(--breakpoint-2xl) flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5 md:h-14 md:flex-nowrap md:gap-4 md:px-6 md:py-0 lg:px-8">
          <Link href="/" className="hidden shrink-0 text-base font-semibold tracking-tight md:block">
            OpenConnect
          </Link>
          <div className="mr-auto shrink-0 text-[22px] font-bold leading-tight tracking-tight md:hidden">{title}</div>
          <nav aria-label="Main" className="hidden min-w-0 items-center gap-1 overflow-x-auto md:flex">
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
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          {actions && <div className="ml-auto flex min-w-0 items-center justify-end gap-2">{actions}</div>}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={active === 'settings' ? 'page' : undefined}
            className={cn(
              'hidden h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors md:flex',
              !actions && 'md:ml-auto',
              active === 'settings' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </header>
      {/* The page's toolbar rows: pinned under the bar on wider screens, scrolled away with the
          page on phones so the content gets the room. */}
      {children && (
        <div className="z-30 border-b border-border bg-background/90 backdrop-blur-xl supports-backdrop-filter:bg-background/75 md:sticky md:top-[calc(3.5rem+1px+env(safe-area-inset-top))] *:first:border-t-0">
          {children}
        </div>
      )}
      <TabBar active={active} />
    </>
  )
}

/** iOS-style tab bar along the bottom of a phone screen, clear of the home indicator. */
function TabBar({ active }: { active: NavPage }) {
  return (
    <nav
      aria-label="Main"
      data-tab-bar
      className="fixed inset-x-0 bottom-0 z-40 select-none border-t border-border bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <div className="mx-auto flex h-[50px] max-w-lg items-stretch">
        {TAB_ITEMS.map(({ page, href, label, icon: Icon }) => (
          <Link
            key={page}
            href={href}
            aria-current={active === page ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[10px] font-medium [-webkit-touch-callout:none]',
              active === page ? 'text-tint' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-[23px] w-[23px]" strokeWidth={active === page ? 2.25 : 1.75} />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
