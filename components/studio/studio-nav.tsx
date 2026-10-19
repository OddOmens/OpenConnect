import Link from 'next/link'
import { Settings } from 'lucide-react'
import { NAV_ITEMS } from '@/components/nav/app-nav'
import styles from './studio-nav.module.css'

/** The dashboard's top bar on the studio page, with the studio's editor filling the rest. */
export function StudioFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.frame}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand}>
          OpenConnect
        </Link>
        <nav aria-label="Main" className={styles.tabs}>
          {NAV_ITEMS.map(({ page, href, label, icon: Icon }) => (
            <Link key={page} href={href} className={styles.tab} title={label} aria-current={page === 'studio' ? 'page' : undefined}>
              <Icon size={16} />
              <span className={styles.label}>{label}</span>
            </Link>
          ))}
        </nav>
        <Link href="/settings" className={styles.icon} aria-label="Settings" title="Settings">
          <Settings size={16} />
        </Link>
      </header>
      {children}
    </div>
  )
}
