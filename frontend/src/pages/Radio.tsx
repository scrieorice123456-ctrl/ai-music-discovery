import {
  Play,
  Pause,
  Radio as RadioIcon,
  Shuffle,
  Heart,
  ThumbsDown,
  Check,
  ArrowRight,
  AudioLines,
  ExternalLink,
  LoaderCircle,
  SkipForward,
  Sparkles,
  Headphones,
  AlertCircle,
} from 'lucide-react'
import type { Discovery, FeedbackAction, Mood, Page, Track } from '../types'
import type { Player } from '../hooks/usePlayer'
import { Cover, LaneTag, SourceLinks } from '../components/ui'
import TrackList from '../components/TrackList'
import { moods } from './Discover'
export default function Radio({
  player,
  data,
  mood,
  setMood,
  onFeedback,
  onWhy,
  navigate,
}: {
  player: Player
  data: Discovery | null
  mood: Mood
  setMood: (m: Mood) => void
  onFeedback: (t: Track, a: FeedbackAction) => void
  onWhy: (t: Track) => void
  navigate: (p: Page) => void
}) {
  const current = player.current
  const upcoming = player.queue.length ? player.queue.slice(player.index + 1) : data?.tracks || []
  return (
    <div className="page-enter radio-page">
      <div className="page-heading radio-heading">
        <div>
          <span className="eyebrow">NO TWO LISTENING STORIES ARE THE SAME</span>
          <h1>
            Your frequency. Found<span className="orange">.</span>
          </h1>
          <p>A familiar feeling. An unexpected turn. A DJ that gets you.</p>
        </div>
        <span className="radio-live-badge">
          <span className={player.status === 'playing' ? 'pulsing' : ''} />
          {player.status === 'playing' ? 'ON YOUR WAVELENGTH' : 'YOUR PERSONAL STATION'}
        </span>
      </div>
      <div className="radio-layout">
        <section className="now-playing-card">
          <div className="now-playing-top">
            <span>
              <AudioLines size={15} />
              {current ? 'IN YOUR ROTATION' : 'FIND YOUR FREQUENCY'}
            </span>
            <Headphones size={18} />
          </div>
          <div className={`radio-artwork ${player.status === 'playing' ? 'is-playing' : ''}`}>
            {current ? (
              <Cover track={current} />
            ) : (
              <div className="radio-record">
                <div>
                  <span className="brand-mark">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            )}
            <span className="record-shine" />
          </div>
          <div className="radio-track-info">
            {current ? (
              <>
                <LaneTag lane={current.lane} />
                <h2>{current.title}</h2>
                <p>{current.artist}</p>
                <small>{current.album}</small>
              </>
            ) : (
              <>
                <span className="eyebrow">BUILT AROUND YOU</span>
                <h2>
                  Something good
                  <br />
                  is just a play away.
                </h2>
                <p>Unheard songs. A sound you’ll love.</p>
              </>
            )}
          </div>
          <div className="radio-main-actions">
            <button
              className="button button-primary"
              disabled={player.status === 'loading'}
              onClick={() => (current ? void player.toggle() : void player.start(mood))}
            >
              {player.status === 'loading' ? (
                <>
                  <LoaderCircle className="spin" size={18} />
                  Finding a preview…
                </>
              ) : player.status === 'playing' ? (
                <>
                  <Pause size={17} fill="currentColor" />
                  Pause radio
                </>
              ) : current && player.status === 'unavailable' ? (
                <>
                  <ExternalLink size={16} />
                  Retry official preview
                </>
              ) : (
                <>
                  <Play size={17} fill="currentColor" />
                  {current ? 'Play preview' : 'Start my radio'}
                </>
              )}
            </button>
            {current && (
              <button
                className="radio-next button button-secondary"
                onClick={() => void player.next()}
                disabled={player.status === 'loading' || player.exhausted}
                aria-label="Next discovery"
              >
                <SkipForward size={20} />
              </button>
            )}
          </div>
          {current && (
            <div className="radio-feedback">
              <button
                className={current.liked ? 'selected' : ''}
                onClick={() => onFeedback(current, current.liked ? 'clear' : 'like')}
              >
                <Heart size={17} fill={current.liked ? 'currentColor' : 'none'} />
                More like this
              </button>
              <button onClick={() => onFeedback(current, 'dislike')}>
                <ThumbsDown size={17} />
                Not for me
              </button>
              <button onClick={() => onFeedback(current, 'known')}>
                <Check size={17} />
                Know it
              </button>
            </div>
          )}
          <div className="preview-explainer">
            <Headphones size={14} />
            <p>
              Official Apple previews, usually 30 seconds. Full tracks open on licensed music
              services.
            </p>
          </div>
        </section>
        <div className="radio-content">
          <section className="panel station-controls">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">HOW ARE WE FEELING?</span>
                <h2>Set the mood. We’ll do the rest.</h2>
              </div>
              <RadioIcon size={22} />
            </div>
            <div className="mood-tabs" role="group" aria-label="Radio mood">
              {moods.map((m) => (
                <button
                  className={mood === m.id ? 'selected' : ''}
                  key={m.id}
                  onClick={() => setMood(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="station-controls-footer">
              <span>Choose a mood, then start a fresh station.</span>
              <button
                className="text-button"
                onClick={() => void player.start(mood)}
                disabled={player.status === 'loading'}
              >
                <Shuffle size={14} />
                Retune radio
              </button>
            </div>
          </section>
          {current && player.status === 'unavailable' && (
            <div className="playback-fallback" role="status">
              <div>
                <AlertCircle size={21} />
                <h3>The discovery’s here. The preview isn’t.</h3>
              </div>
              <p>{player.message}</p>
              <SourceLinks track={current} />
              <small>We never substitute audio or bypass a music service’s playback rules.</small>
            </div>
          )}
          {player.exhausted && (
            <div className="inline-warning">
              <AlertCircle size={18} />
              <div>
                You’ve reached this catalog’s edge.{' '}
                <button className="text-button" onClick={() => navigate('settings')}>
                  Find more music <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
          {current?.reason && (
            <div className="radio-why">
              <Sparkles size={17} />
              <p>{current.reason}</p>
              <button
                className="icon-button"
                aria-label="Why this song?"
                onClick={() => onWhy(current)}
              >
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <div className="section-heading queue-heading">
            <div>
              <span className="eyebrow">GOOD THINGS ARE COMING</span>
              <h2>{current ? 'Next in your orbit' : 'A taste of what’s waiting'}</h2>
            </div>
            <span className="tiny-caption">{upcoming.length} DISCOVERIES</span>
          </div>
          {upcoming.length ? (
            <TrackList
              tracks={upcoming.slice(0, 20)}
              currentId={current?.id}
              playing={player.status === 'playing'}
              onPlay={(t) => player.play(t, player.queue.length ? player.queue : upcoming, mood)}
              onFeedback={onFeedback}
              onWhy={onWhy}
              compact
            />
          ) : (
            <div className="queue-empty">
              <RadioIcon size={24} />
              <h3>A little room for possibility.</h3>
              <p>Start a station to fill this space with fresh discoveries.</p>
            </div>
          )}
          <div className="radio-queue-note">
            <span className="live-dot" />
            Your queue refills as you listen. Songs in your history, marked known, or disliked stay
            out. Offline catalogs are finite.
          </div>
        </div>
      </div>
    </div>
  )
}
