import { useEffect, useRef, useState } from 'react'
import { Search, ArrowUpRight, Info, LoaderCircle } from 'lucide-react'
import { api } from '../api'
import type { FeedbackAction, Track } from '../types'
import { Empty, Modal, Spinner } from './ui'
import TrackList from './TrackList'
export default function SearchDialog({
  initial,
  onClose,
  onPlay,
  onFeedback,
  onWhy,
  currentId,
  playing,
}: {
  initial: string
  onClose: () => void
  onPlay: (t: Track, tracks: Track[]) => void
  onFeedback: (t: Track, a: FeedbackAction) => void
  onWhy: (t: Track) => void
  currentId?: number
  playing: boolean
}) {
  const [query, setQuery] = useState(initial)
  const [online, setOnline] = useState(false)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setMessage('')
    if (query.trim().length < 2) {
      setTracks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(
      () => {
        void api<{ tracks: Track[]; message: string }>(
          `/search?q=${encodeURIComponent(query)}&online=${online}`,
          { signal: controller.signal },
        )
          .then((d) => {
            setTracks(d.tracks)
            setMessage(d.message)
          })
          .catch((e) => {
            if (!controller.signal.aborted) setMessage(e.message)
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false)
          })
      },
      online ? 0 : 200,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, online])
  return (
    <Modal title="A new favorite starts somewhere." onClose={onClose} wide>
      <div className="search-dialog-input">
        <Search size={20} />
        <input
          ref={ref}
          aria-label="Search music"
          placeholder="A song, an artist, a feeling…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOnline(false)
          }}
        />
        <span>ESC TO CLOSE</span>
      </div>
      <div className="search-scope">
        <span>
          {online ? 'Searching Apple’s public catalog' : 'Searching your available catalog'}
        </span>
        <button
          className="text-button"
          disabled={loading || query.trim().length < 2 || online}
          onClick={() => setOnline(true)}
        >
          {online && loading ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <>
              Search Apple catalog <ArrowUpRight size={14} />
            </>
          )}
        </button>
      </div>
      {message && (
        <div className="inline-warning" role="status">
          <Info size={17} />
          <span>{message}</span>
        </div>
      )}
      <div className="search-results">
        {loading ? (
          <Spinner text={online ? 'Checking the Apple catalog…' : 'Looking through the crates…'} />
        ) : tracks.length ? (
          <TrackList
            tracks={tracks}
            currentId={currentId}
            playing={playing}
            onPlay={(t) => onPlay(t, tracks)}
            onFeedback={(t, a) => {
              onFeedback(t, a)
              setTracks((prev) =>
                prev.map((x) =>
                  x.id === t.id
                    ? { ...x, saved: a === 'save' ? true : a === 'unsave' ? false : x.saved }
                    : x,
                ),
              )
            }}
            onWhy={onWhy}
            showHeader={false}
            compact
          />
        ) : query.trim().length >= 2 ? (
          <Empty title="That one’s still out there.">
            Try another spelling, or search the Apple catalog for more music.
          </Empty>
        ) : (
          <div className="search-inspiration">
            <span className="eyebrow">FOLLOW A LITTLE CURIOSITY</span>
            <div>
              {['Bonobo', 'Khruangbin', 'Men I Trust', 'Nujabes', 'Maribou State'].map((q) => (
                <button key={q} onClick={() => setQuery(q)}>
                  {q}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="search-privacy">
        <Info size={12} /> Online lookup sends your search terms to Apple. No account or API key
        required.
      </p>
    </Modal>
  )
}
