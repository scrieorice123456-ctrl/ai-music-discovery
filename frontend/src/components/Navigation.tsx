import {
  Compass,
  Radio,
  Library,
  ChartNoAxesCombined,
  Upload,
  Settings2,
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  X,
} from 'lucide-react'
import type { Page } from '../types'
const links = [
  { page: 'discover' as Page, label: 'Discover', icon: Compass },
  { page: 'radio' as Page, label: 'AI Radio', icon: Radio },
  { page: 'library' as Page, label: 'Your library', icon: Library },
  { page: 'taste' as Page, label: 'Your taste', icon: ChartNoAxesCombined },
]
export default function Navigation({
  page,
  navigate,
  demo,
  open,
  onClose,
}: {
  page: Page
  navigate: (p: Page) => void
  demo: boolean
  open: boolean
  onClose: () => void
}) {
  function go(p: Page) {
    navigate(p)
    onClose()
  }
  return (
    <>
      {open && <button className="nav-overlay" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <a
          className="brand"
          href="/discover"
          onClick={(e) => {
            e.preventDefault()
            go('discover')
          }}
          aria-label="AI Music Discovery home"
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <b>AI music</b>
            <small>discovery</small>
          </span>
        </a>
        <button
          className="mobile-nav-close icon-button"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <div className="sidebar-caption">YOUR MUSICAL UNIVERSE</div>
        <nav aria-label="Main navigation">
          {links.map(({ page: p, label, icon: Icon }) => (
            <a
              key={p}
              className={`nav-item ${page === p ? 'active' : ''}`}
              href={`/${p}`}
              onClick={(e) => {
                e.preventDefault()
                go(p)
              }}
              aria-current={page === p ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {p === 'radio' && <span className="live-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-caption">MAKE IT PERSONAL</div>
        <a
          className={`nav-item ${page === 'import' ? 'active' : ''}`}
          href="/import"
          onClick={(e) => {
            e.preventDefault()
            go('import')
          }}
        >
          <Upload size={18} />
          <span>Import history</span>
          <ChevronRight className="nav-chevron" size={14} />
        </a>
        {demo && (
          <div className="sidebar-invite">
            <div className="mini-record">
              <span />
            </div>
            <h4>
              Your taste.
              <br />
              Your soundtrack.
            </h4>
            <p>
              Bring your listening history.
              <br />
              We’ll find what comes next.
            </p>
            <button onClick={() => go('import')}>
              Make it yours <ArrowUpRight size={15} />
            </button>
          </div>
        )}
        <div className="sidebar-bottom">
          <a
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            href="/settings"
            onClick={(e) => {
              e.preventDefault()
              go('settings')
            }}
          >
            <Settings2 size={18} />
            <span>Settings & privacy</span>
          </a>
          <div className="privacy-note">
            <ShieldCheck size={14} />
            <span>Your music. Your data.</span>
          </div>
          <div className="version">
            MADE FOR THE LOVE OF MUSIC <span>↗</span>
          </div>
        </div>
      </aside>
    </>
  )
}
