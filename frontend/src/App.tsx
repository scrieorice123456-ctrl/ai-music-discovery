import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search,
  Menu,
  ArrowUpRight,
  X,
  Sparkles,
  Check,
  CircleHelp,
  ArrowRight,
  AudioLines,
  ShieldCheck,
  Music2,
} from 'lucide-react'
import { api, post, setCsrf } from './api'
import type { Bootstrap, Discovery, FeedbackAction, Mix, Mood, Page, Track } from './types'
import { usePlayer } from './hooks/usePlayer'
import Navigation from './components/Navigation'
import PlayerBar from './components/PlayerBar'
import MixEditor from './components/MixEditor'
import SearchDialog from './components/SearchDialog'
import { Cover, LaneTag, Modal, SourceLinks, Spinner } from './components/ui'
import Discover from './pages/Discover'
import ImportHistory from './pages/ImportHistory'
import Library from './pages/Library'
import Taste from './pages/Taste'
import Radio from './pages/Radio'
import Settings from './pages/Settings'
const pages: Page[] = ['discover', 'radio', 'library', 'taste', 'import', 'settings']
const titles: Record<Page, string> = {
  discover: 'Discover',
  radio: 'AI Radio',
  library: 'Your library',
  taste: 'Your taste',
  import: 'Import your music history',
  settings: 'Settings & privacy',
}
function readPage(): Page {
  const part = location.pathname.split('/')[1] as Page
  return pages.includes(part) ? part : 'discover'
}
export default function App() {
  const initialBoot = useRef<Promise<Bootstrap> | null>(null)
  const [page, setPage] = useState<Page>(readPage)
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [bootError, setBootError] = useState('')
  const [data, setData] = useState<Discovery | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mood, setMood] = useState<Mood>('all')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState<string | null>(null)
  const [mixOpen, setMixOpen] = useState(false)
  const [why, setWhy] = useState<Track | null>(null)
  const [sources, setSources] = useState<Track | null>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
  const toastId = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const notify = useCallback((text: string) => {
    const id = ++toastId.current
    setToasts((prev) => [...prev.slice(-2), { id, text }])
    timers.current.push(
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6500),
    )
  }, [])
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
    },
    [],
  )
  const reloadBoot = useCallback(async () => {
    const b = await api<Bootstrap>('/bootstrap')
    setCsrf(b.csrf_token)
    setBoot(b)
  }, [])
  useEffect(() => {
    let active = true
    initialBoot.current ||= api<Bootstrap>('/bootstrap')
    initialBoot.current
      .then((b) => {
        if (active) {
          setCsrf(b.csrf_token)
          setBoot(b)
        }
      })
      .catch((e) => {
        if (active) setBootError(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  const initialized = !!boot
  useEffect(() => {
    if (!initialized) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    api<Discovery>(`/discover?mood=${mood}&limit=20`, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [initialized, mood, version])
  function navigate(p: Page) {
    setPage(p)
    history.pushState({}, '', `/${p}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
    setNavOpen(false)
  }
  useEffect(() => {
    const handler = () => setPage(readPage())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
  useEffect(() => {
    document.title = `${titles[page]} — AI Music Discovery`
  }, [page])
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (e.key === 'Escape') setNavOpen(false)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        if (document.querySelector('dialog[open]')) return
        e.preventDefault()
        setSearch('')
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const record = useCallback(
    async (id: number, action: 'skip' | 'listen') => {
      try {
        await post('/feedback', { track_id: id, action })
        setVersion((v) => v + 1)
        await reloadBoot()
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Your feedback couldn’t be saved.')
      }
    },
    [notify, reloadBoot],
  )
  const player = usePlayer(record, notify)
  async function handleFeedback(t: Track, action: FeedbackAction) {
    try {
      await post('/feedback', { track_id: t.id, action })
      const patch: Partial<Track> =
        action === 'save'
          ? { saved: true }
          : action === 'unsave'
            ? { saved: false }
            : action === 'like'
              ? { liked: true }
              : action === 'clear'
                ? { liked: false }
                : {}
      setData((prev) =>
        prev
          ? {
              ...prev,
              tracks: prev.tracks
                .filter((x) => !(x.id === t.id && (action === 'known' || action === 'dislike')))
                .map((x) => (x.id === t.id ? { ...x, ...patch } : x)),
            }
          : prev,
      )
      player.updateTrack(t.id, patch)
      if (action === 'known' || action === 'dislike') player.removeUpcoming(t.id)
      setVersion((v) => v + 1)
      if ((action === 'known' || action === 'dislike') && player.current?.id === t.id)
        void player.next()
      notify(
        (
          {
            like: 'A little more of that. Your DJ is learning.',
            clear: 'Like removed. Your taste is up to date.',
            save: 'A keeper. Saved to your library.',
            unsave: 'Removed from your saved finds.',
            known: 'Got it. This song won’t appear in new discoveries.',
            dislike: 'Not your thing. We’ll take a different direction.',
            skip: 'On to the next discovery.',
            listen: 'Listening moment added.',
          } as Record<FeedbackAction, string>
        )[action],
      )
      await reloadBoot()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save your feedback.')
    }
  }
  async function saveMix(mix: Mix) {
    await api('/settings', { method: 'PUT', body: JSON.stringify(mix) })
    await reloadBoot()
    setVersion((v) => v + 1)
    notify('A new balance. A whole new set of possibilities.')
  }
  async function afterImport() {
    player.reset()
    await reloadBoot()
    setVersion((v) => v + 1)
  }
  const afterRefresh = useCallback(async () => {
    await reloadBoot()
    setVersion((v) => v + 1)
  }, [reloadBoot])
  if (!boot)
    return (
      <div className="app-loading">
        <span className="brand-mark">
          <i />
          <i />
          <i />
          <i />
        </span>
        <h1>Good music is on its way.</h1>
        {bootError ? (
          <>
            <p role="alert">{bootError}</p>
            <button className="button button-primary" onClick={() => location.reload()}>
              Try again
            </button>
          </>
        ) : (
          <Spinner text="Finding your frequency…" />
        )}
      </div>
    )
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navigation
        page={page}
        navigate={navigate}
        demo={boot.demo}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-page">
            <button
              className="icon-button mobile-menu"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <span>{titles[page]}</span>
            <span className="topbar-divider" />
            <small>YOUR PERSONAL AI DJ</small>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              aria-label="Search music"
              onClick={() => setSearch('')}
            >
              <Search size={16} />
              <span>Search music, find a feeling</span>
              <kbd>/</kbd>
            </button>
            <button
              className={`profile-state ${boot.demo ? 'demo-profile' : ''}`}
              onClick={() => navigate(boot.demo ? 'import' : 'taste')}
            >
              <span />
              {boot.demo ? 'Sample profile' : 'Your profile'}
              {boot.demo && <ArrowUpRight size={12} />}
            </button>
            <button
              className="avatar"
              onClick={() => navigate('settings')}
              aria-label="Your settings"
            >
              {boot.demo ? 'm' : 'you'}
              <span />
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {page === 'discover' && (
            <Discover
              boot={boot}
              data={data}
              loading={loading}
              error={error}
              mood={mood}
              setMood={setMood}
              player={player}
              navigate={navigate}
              onMix={() => setMixOpen(true)}
              onFeedback={(t, a) => void handleFeedback(t, a)}
              onWhy={setWhy}
              onSearch={setSearch}
              onRetry={() => setVersion((v) => v + 1)}
            />
          )}
          {page === 'import' && (
            <ImportHistory boot={boot} onImported={afterImport} navigate={navigate} />
          )}
          {page === 'library' && (
            <Library
              boot={boot}
              player={player}
              version={version}
              onFeedback={(t, a) => void handleFeedback(t, a)}
              onWhy={setWhy}
              navigate={navigate}
            />
          )}
          {page === 'taste' && (
            <Taste
              boot={boot}
              navigate={navigate}
              onMix={() => setMixOpen(true)}
              onSearch={setSearch}
            />
          )}
          {page === 'radio' && (
            <Radio
              player={player}
              data={data}
              mood={mood}
              setMood={setMood}
              onFeedback={(t, a) => void handleFeedback(t, a)}
              onWhy={setWhy}
              navigate={navigate}
            />
          )}
          {page === 'settings' && (
            <Settings
              boot={boot}
              onRefresh={afterRefresh}
              onReset={() => {
                player.reset()
                setData(null)
                setMood('all')
              }}
              onMix={() => setMixOpen(true)}
              notify={notify}
            />
          )}
        </main>
      </div>
      <PlayerBar
        player={player}
        onFeedback={(t, a) => void handleFeedback(t, a)}
        onQueue={() => navigate('radio')}
        onSources={setSources}
      />
      {search !== null && (
        <SearchDialog
          initial={search}
          onClose={() => setSearch(null)}
          onPlay={(t, tracks) => {
            setSearch(null)
            player.play(t, tracks)
            navigate('radio')
          }}
          onFeedback={(t, a) => void handleFeedback(t, a)}
          onWhy={(t) => {
            setSearch(null)
            setWhy(t)
          }}
          currentId={player.current?.id}
          playing={player.status === 'playing'}
        />
      )}
      {mixOpen && (
        <MixEditor initial={boot.settings} onSave={saveMix} onClose={() => setMixOpen(false)} />
      )}
      {why && (
        <Modal title="Not random. Just right for you." onClose={() => setWhy(null)}>
          <div className="why-track">
            <Cover track={why} />
            <div>
              <LaneTag lane={why.lane} />
              <h3>{why.title}</h3>
              <p>{why.artist}</p>
            </div>
          </div>
          <div className="why-reason">
            <Sparkles size={21} />
            <p>
              {why.reason ||
                'A song from your available music catalog. Like it, save it, or mark it as known to help shape your next discoveries.'}
            </p>
          </div>
          <div className="why-factors">
            {(why.factors || why.genres.slice(0, 3).map((g) => `${g} influence`)).map((f) => (
              <span key={f}>
                <Check size={13} />
                {f}
              </span>
            ))}
          </div>
          <div className="why-explanation">
            <CircleHelp size={17} />
            <p>
              Your DJ connects artists, genre tags, approximate energy, and listening patterns—not a
              paid AI service. “New to you” means not found in your available history, not a
              guarantee you’ve never heard it.
            </p>
          </div>
          <div className="why-actions">
            <button
              className="button button-primary"
              onClick={() => {
                void handleFeedback(why, why.liked ? 'clear' : 'like')
                setWhy(null)
              }}
            >
              <AudioLines size={16} />
              {why.liked ? 'Remove my like' : 'More like this'}
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                void handleFeedback(why, 'known')
                setWhy(null)
              }}
            >
              I already know this <Check size={16} />
            </button>
          </div>
          <p className="art-disclosure">
            <Music2 size={12} />
            Starter-catalog artwork is original and illustrative, not official album art.
          </p>
        </Modal>
      )}
      {sources && (
        <Modal title="Keep the good music going." onClose={() => setSources(null)}>
          <div className="why-track">
            <Cover track={sources} />
            <div>
              <span className="eyebrow">LISTEN AT THE SOURCE</span>
              <h3>{sources.title}</h3>
              <p>{sources.artist}</p>
            </div>
          </div>
          <p className="modal-intro">
            {player.current?.id === sources.id && player.status === 'unavailable'
              ? player.message
              : 'Official previews are short, and some recordings aren’t available in every region. Open your music service for full playback.'}
          </p>
          <SourceLinks track={sources} />
          <div className="why-explanation">
            <ShieldCheck size={18} />
            <p>
              Full playback is handled by the licensed service and may require an account or
              subscription. This app never downloads, scrapes, or substitutes song audio.
            </p>
          </div>
          <button
            className="text-button source-next"
            onClick={() => {
              setSources(null)
              void player.next()
            }}
          >
            Keep discovering. Try the next song. <ArrowRight size={15} />
          </button>
        </Modal>
      )}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span className="toast-icon">
              <Check size={14} />
            </span>
            <p>{t.text}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
