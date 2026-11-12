import { Heart, Play, Pause, CircleHelp, Check, ThumbsDown, AudioLines } from 'lucide-react'
import type { FeedbackAction, Track } from '../types'
import { Cover, formatTime, LaneTag } from './ui'
export default function TrackList({
  tracks,
  currentId,
  playing,
  onPlay,
  onFeedback,
  onWhy,
  showHeader = true,
  compact = false,
}: {
  tracks: Track[]
  currentId?: number
  playing: boolean
  onPlay: (t: Track) => void
  onFeedback: (t: Track, a: FeedbackAction) => void
  onWhy: (t: Track) => void
  showHeader?: boolean
  compact?: boolean
}) {
  return (
    <div className={`track-list ${compact ? 'track-list-compact' : ''}`}>
      {showHeader && (
        <div className="track-list-header">
          <span>#</span>
          <span>TRACK / ARTIST</span>
          <span className="list-album">ALBUM</span>
          <span className="list-duration">TIME</span>
          <span className="list-actions-heading">MAKE IT YOURS</span>
        </div>
      )}
      {tracks.map((t, i) => (
        <div key={t.id} className={`track-row ${currentId === t.id ? 'current-track' : ''}`}>
          <span className="track-number">
            {currentId === t.id && playing ? (
              <AudioLines size={15} />
            ) : (
              String(i + 1).padStart(2, '0')
            )}
          </span>
          <div className="list-track-name">
            <button
              className="list-art-button"
              onClick={() => onPlay(t)}
              aria-label={`${currentId === t.id && playing ? 'Pause' : 'Play'} ${t.title}`}
            >
              <Cover track={t} />
              <span>
                {currentId === t.id && playing ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}
              </span>
            </button>
            <div>
              <button onClick={() => onPlay(t)} className="list-title" title={t.title}>
                {t.title}
              </button>
              <p>{t.artist}</p>
              {compact && t.lane && <LaneTag lane={t.lane} />}
            </div>
          </div>
          <span className="list-album" title={t.album}>
            {t.album || '—'}
          </span>
          <span className="list-duration">{formatTime(t.duration)}</span>
          <div className="list-actions">
            <button
              className={`icon-button ${t.saved ? 'saved' : ''}`}
              onClick={() => onFeedback(t, t.saved ? 'unsave' : 'save')}
              aria-label={`${t.saved ? 'Unsave' : 'Save'} ${t.title}`}
              title={t.saved ? 'Remove from library' : 'Save to library'}
            >
              <Heart size={16} fill={t.saved ? 'currentColor' : 'none'} />
            </button>
            <button
              className="icon-button list-why"
              onClick={() => onWhy(t)}
              aria-label={`Why ${t.title}?`}
              title="Why this song?"
            >
              <CircleHelp size={15} />
            </button>
            <button
              className="icon-button list-known"
              onClick={() => onFeedback(t, 'known')}
              aria-label={`I already know ${t.title}`}
              title="I already know this song"
            >
              <Check size={16} />
            </button>
            <button
              className="icon-button list-dislike"
              onClick={() => onFeedback(t, 'dislike')}
              aria-label={`Not interested in ${t.title}`}
              title="Not my thing"
            >
              <ThumbsDown size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
