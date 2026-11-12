import {
  Play,
  Pause,
  Heart,
  MoreHorizontal,
  ArrowUpRight,
  BookmarkPlus,
  Check,
  ThumbsDown,
  CircleHelp,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FeedbackAction, Track } from '../types'
import { Cover, LaneTag } from './ui'
export default function TrackCard({
  track,
  onPlay,
  onFeedback,
  onWhy,
  active = false,
  playing = false,
}: {
  track: Track
  onPlay: () => void
  onFeedback: (track: Track, action: FeedbackAction) => void
  onWhy: (t: Track) => void
  active?: boolean
  playing?: boolean
}) {
  const [menu, setMenu] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    function close(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setMenu(false)
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(false)
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', key)
    }
  }, [menu])
  return (
    <article className={`track-card ${active ? 'track-card-active' : ''}`}>
      <div className="track-artwork">
        <Cover track={track} />
        <button
          className={`card-save ${track.saved ? 'is-saved' : ''}`}
          onClick={() => onFeedback(track, track.saved ? 'unsave' : 'save')}
          aria-label={`${track.saved ? 'Unsave' : 'Save'} ${track.title}`}
        >
          <Heart size={16} fill={track.saved ? 'currentColor' : 'none'} />
        </button>
        <button
          className="card-play"
          onClick={onPlay}
          aria-label={`${active && playing ? 'Pause' : 'Play'} ${track.title}`}
        >
          {active && playing ? (
            <Pause size={21} fill="currentColor" />
          ) : (
            <Play size={21} fill="currentColor" />
          )}
        </button>
        <span className="artwork-caption">
          {track.source === 'editorial' ? 'DISCOVERY SELECTS' : 'MUSIC DISCOVERY'}
        </span>
      </div>
      <div className="track-card-info">
        <div>
          <h3 title={track.title}>{track.title}</h3>
          <p title={track.artist}>{track.artist}</p>
        </div>
        <div className="track-menu" ref={root}>
          <button
            className={`icon-button more-button ${menu ? 'open' : ''}`}
            onClick={() => setMenu(!menu)}
            aria-label={`More options for ${track.title}`}
            aria-expanded={menu}
          >
            <MoreHorizontal size={19} />
          </button>
          {menu && (
            <div className="dropdown">
              <button
                onClick={() => {
                  onWhy(track)
                  setMenu(false)
                }}
              >
                <CircleHelp size={15} />
                Why this song?
              </button>
              <button
                onClick={() => {
                  onFeedback(track, track.liked ? 'clear' : 'like')
                  setMenu(false)
                }}
              >
                <Heart size={15} />
                {track.liked ? 'Remove like' : 'More like this'}
              </button>
              <button
                onClick={() => {
                  onFeedback(track, track.saved ? 'unsave' : 'save')
                  setMenu(false)
                }}
              >
                <BookmarkPlus size={15} />
                {track.saved ? 'Remove from library' : 'Save to library'}
              </button>
              <button
                onClick={() => {
                  onFeedback(track, 'known')
                  setMenu(false)
                }}
              >
                <Check size={15} />I already know this
              </button>
              <button
                onClick={() => {
                  onFeedback(track, 'dislike')
                  setMenu(false)
                }}
              >
                <ThumbsDown size={15} />
                Not my thing
              </button>
              <a
                href={`https://music.youtube.com/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ArrowUpRight size={15} />
                Open YouTube Music
              </a>
            </div>
          )}
        </div>
      </div>
      <button
        className="reason-button"
        onClick={() => onWhy(track)}
        aria-label={`Why ${track.title} was recommended`}
      >
        <LaneTag lane={track.lane} />
        <CircleHelp size={12} />
      </button>
    </article>
  )
}
