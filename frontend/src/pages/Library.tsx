import { useEffect, useMemo, useState } from 'react'
import {
  Heart,
  History,
  ThumbsUp,
  Search,
  ArrowRight,
  Library as LibraryIcon,
  ArrowDownWideNarrow,
} from 'lucide-react'
import { api } from '../api'
import type { Bootstrap, FeedbackAction, Page, Track } from '../types'
import type { Player } from '../hooks/usePlayer'
import TrackList from '../components/TrackList'
import { Empty, Spinner } from '../components/ui'
export default function Library({
  boot,
  player,
  version,
  onFeedback,
  onWhy,
  navigate,
}: {
  boot: Bootstrap
  player: Player
  version: number
  onFeedback: (t: Track, a: FeedbackAction) => void
  onWhy: (t: Track) => void
  navigate: (p: Page) => void
}) {
  const [view, setView] = useState<'saved' | 'liked' | 'history'>('saved')
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    api<{ tracks: Track[] }>(`/library?view=${view}`, { signal: controller.signal })
      .then((d) => setTracks(d.tracks))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [view, version])
  const visible = useMemo(() => {
    const list = tracks.filter((t) =>
      `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase()),
    )
    return sort ? [...list].sort((a, b) => a.title.localeCompare(b.title)) : list
  }, [tracks, query, sort])
  return (
    <div className="page-enter library-page">
      <div className="page-heading">
        <span className="eyebrow">THE ONES THAT STAY WITH YOU</span>
        <h1>
          Your little corner of music<span className="orange">.</span>
        </h1>
        <p>New finds, old loves, and everything worth coming back to.</p>
      </div>
      <div className="library-banner">
        <div className="library-banner-icon">
          <LibraryIcon size={37} strokeWidth={1.2} />
        </div>
        <div>
          <span className="eyebrow">YOUR GROWING COLLECTION</span>
          <h2>Good music deserves a second listen.</h2>
          <p>
            <b>{boot.taste.saved}</b> saved {boot.taste.saved === 1 ? 'discovery' : 'discoveries'}{' '}
            <i /> <b>{boot.taste.tracks}</b> tracks in your listening story
          </p>
        </div>
        <Heart size={75} strokeWidth={0.8} className="library-watermark" />
      </div>
      <div className="library-toolbar">
        <div className="mood-tabs" role="group" aria-label="Library view">
          <button className={view === 'saved' ? 'selected' : ''} onClick={() => setView('saved')}>
            <Heart size={14} />
            Saved finds
          </button>
          <button className={view === 'liked' ? 'selected' : ''} onClick={() => setView('liked')}>
            <ThumbsUp size={14} />
            Liked tracks
          </button>
          <button
            className={view === 'history' ? 'selected' : ''}
            onClick={() => setView('history')}
          >
            <History size={14} />
            Listening history
          </button>
        </div>
        <div className="library-search">
          <Search size={15} />
          <input
            aria-label="Search your library"
            placeholder="Find in your library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className={`icon-button ${sort ? 'saved' : ''}`}
            onClick={() => setSort(!sort)}
            title={sort ? 'Sort by most recent' : 'Sort by title'}
            aria-label={sort ? 'Sort by most recent' : 'Sort by title'}
          >
            <ArrowDownWideNarrow size={17} />
          </button>
        </div>
      </div>
      {error ? (
        <Empty title="Couldn’t load your collection.">{error}</Empty>
      ) : loading ? (
        <Spinner text="Opening your record collection…" />
      ) : visible.length ? (
        <>
          <TrackList
            tracks={visible}
            currentId={player.current?.id}
            playing={player.status === 'playing'}
            onPlay={(t) =>
              player.current?.id === t.id && player.status === 'playing'
                ? void player.toggle()
                : player.play(t, visible)
            }
            onFeedback={onFeedback}
            onWhy={onWhy}
          />
          <div className="library-count">
            {visible.length} {visible.length === 1 ? 'track' : 'tracks'}
            {view === 'history'
              ? ' · Preview plays are included; full-song listening is not inferred.'
              : ''}
          </div>
        </>
      ) : (
        <Empty
          title={
            query
              ? 'Nothing here by that name.'
              : view === 'history'
                ? 'Every listening story starts somewhere.'
                : view === 'liked'
                  ? 'Tell your DJ what you love.'
                  : 'Your next keeper is out there.'
          }
          action={
            <button
              className="button button-primary"
              onClick={() => navigate(view === 'history' ? 'import' : 'discover')}
            >
              {view === 'history' ? 'Import your history' : 'Discover something good'}
              <ArrowRight size={16} />
            </button>
          }
        >
          {query
            ? 'Try another song or artist.'
            : view === 'history'
              ? 'Import your Takeout or complete an official preview to start your listening story.'
              : view === 'liked'
                ? 'Choose “More like this” on a song to help your DJ understand your taste.'
                : 'Tap the heart on a discovery and it’ll be right here, waiting for you.'}
        </Empty>
      )}
    </div>
  )
}
