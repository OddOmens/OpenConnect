import Link from 'next/link'
import { Settings } from 'lucide-react'
import { NAV_ITEMS, TAB_ITEMS } from '@/components/nav/app-nav'
import styles from './studio-nav.module.css'

/**
 * The dashboard's top bar on the studio page, with the studio's editor filling the rest. On
 * phones the places move to a tab bar along the bottom, as on the other pages.
 */
export function StudioFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.frame}>
      <header className={styles.bar}>
        <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          OpenConnect
        </Link>
        <div className={styles.title}>Studio</div>
        <nav aria-label="Main" className={styles.tabs}>
          {NAV_ITEMS.map(({ page, href, label, icon: Icon }) => (
            <Link key={page} href={href} className={styles.tab} title={label} aria-current={page === 'studio' ? 'page' : undefined}>
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/settings" className={styles.icon} aria-label="Settings" title="Settings">
          <Settings size={16} />
        </Link>
        </div>
      </header>
      {children}
      <nav aria-label="Main" className={styles.tabBar}>
        {TAB_ITEMS.map(({ page, href, label, icon: Icon }) => (
          <Link key={page} href={href} className={styles.tabBarItem} aria-current={page === 'studio' ? 'page' : undefined}>
            <Icon size={23} strokeWidth={page === 'studio' ? 2.25 : 1.75} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
