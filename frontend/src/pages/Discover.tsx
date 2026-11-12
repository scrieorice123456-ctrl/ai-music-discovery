import { useState } from 'react'
import {
  ArrowRight,
  Play,
  SlidersHorizontal,
  Sparkles,
  Headphones,
  Moon,
  Sun,
  ArrowUpRight,
  AudioLines,
  ThumbsUp,
  Disc3,
  ChevronRight,
} from 'lucide-react'
import type { Bootstrap, Discovery, FeedbackAction, Mood, Page, Track } from '../types'
import type { Player } from '../hooks/usePlayer'
import TrackCard from '../components/TrackCard'
import { Cover, Empty, Spinner } from '../components/ui'
export const moods: { id: Mood; label: string }[] = [
  { id: 'all', label: 'For you' },
  { id: 'chill', label: 'Chill' },
  { id: 'focus', label: 'Focus' },
  { id: 'energy', label: 'Energy' },
  { id: 'after-hours', label: 'After hours' },
]
type Props = {
  boot: Bootstrap
  data: Discovery | null
  loading: boolean
  error: string
  mood: Mood
  setMood: (m: Mood) => void
  player: Player
  navigate: (p: Page) => void
  onMix: () => void
  onFeedback: (t: Track, a: FeedbackAction) => void
  onWhy: (t: Track) => void
  onSearch: (q: string) => void
  onRetry: () => void
}
export default function Discover({
  boot,
  data,
  loading,
  error,
  mood,
  setMood,
  player,
  navigate,
  onMix,
  onFeedback,
  onWhy,
  onSearch,
  onRetry,
}: Props) {
  const [all, setAll] = useState(false)
  function start(m: Mood = 'all') {
    navigate('radio')
    void player.start(m)
  }
  const picks = data?.tracks.slice(0, all ? 20 : 4) || []
  return (
    <div className="discover-page page-enter">
      <div className="welcome-row">
        <div>
          <span className="eyebrow">LESS SCROLLING. MORE DISCOVERING.</span>
          <h1>
            A good day for new music<span className="orange">.</span>
          </h1>
          <p>Your taste is the starting point. Not the limit.</p>
        </div>
        <span className="daily-label">
          <span />
          REFRESHED DAILY
        </span>
      </div>
      <div className="hero-grid">
        <section className="discovery-hero">
          <div className="hero-photo" />
          <div className="hero-content">
            <span className="hero-eyebrow">
              <AudioLines size={15} />
              YOUR PERSONAL AI DJ
            </span>
            <h2>
              Meet your next
              <br />
              <em>on-repeat.</em>
            </h2>
            <p>
              Hidden gems. New obsessions.
              <br />A whole world of music that feels like you.
            </p>
            <div className="hero-actions">
              <button className="button button-cream" onClick={() => start()}>
                <Play size={16} fill="currentColor" />
                Start my radio
              </button>
              <button className="hero-secondary" onClick={() => navigate('taste')}>
                Explore my taste <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
          <div className="hero-corner">
            <span className="hero-sound-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>
              ALWAYS IN YOUR ELEMENT.
              <br />
              NEVER IN A LOOP.
            </span>
          </div>
        </section>
        <section className="discovery-mix">
          <div className="mix-card-heading">
            <span className="eyebrow">YOUR DISCOVERY MIX</span>
            <SlidersHorizontal size={16} />
          </div>
          <h3>
            Comfort zone.
            <br />
            Meet the unknown.
          </h3>
          <div className="mix-stack">
            {(['similar', 'discovery', 'experimental'] as const).map((k) => (
              <div
                key={k}
                className={`mix-segment segment-${k}`}
                style={{ width: `${boot.settings[k]}%` }}
              />
            ))}
          </div>
          <div className="mix-legend">
            <div>
              <i className="dot-similar" />
              <span>Familiar sounds</span>
              <b>
                {boot.settings.similar}
                <small>%</small>
              </b>
            </div>
            <div>
              <i className="dot-discovery" />
              <span>Fresh discoveries</span>
              <b>
                {boot.settings.discovery}
                <small>%</small>
              </b>
            </div>
            <div>
              <i className="dot-experimental" />
              <span>A little adventure</span>
              <b>
                {boot.settings.experimental}
                <small>%</small>
              </b>
            </div>
          </div>
          <button className="mix-adjust" onClick={onMix}>
            Make it your mix <ArrowRight size={15} />
          </button>
        </section>
      </div>
      {boot.demo && (
        <div className="demo-notice">
          <span className="demo-spark">
            <Sparkles size={16} />
          </span>
          <p>
            You’re exploring a <strong>sample taste profile.</strong> The real magic starts with
            your music.
          </p>
          <button onClick={() => navigate('import')}>
            Import your history <ArrowRight size={15} />
          </button>
        </div>
      )}
      {!boot.demo && boot.taste.plays > 0 && boot.taste.metadata_coverage < 30 && (
        <div className="demo-notice">
          <Sparkles size={16} />
          <p>
            We’ve learned your artists. Enrich their metadata in Settings to discover more
            connections.
          </p>
          <button onClick={() => navigate('settings')}>
            Expand your catalog <ArrowRight size={15} />
          </button>
        </div>
      )}
      <section className="fresh-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow section-kicker">A LITTLE FAMILIAR. A LITTLE UNEXPECTED.</span>
            <h2>
              Fresh finds for your rotation <span className="small-spark">✳</span>
            </h2>
          </div>
          <button className="text-button" onClick={() => setAll(!all)}>
            {all ? 'Show less' : 'View all picks'} <ArrowRight size={15} />
          </button>
        </div>
        <div className="section-filter-row">
          <div className="mood-tabs" role="group" aria-label="Filter discoveries by mood">
            {moods.map((m) => (
              <button
                key={m.id}
                className={mood === m.id ? 'selected' : ''}
                onClick={() => setMood(m.id)}
              >
                {m.id === 'all' && <Sparkles size={13} />} {m.label}
              </button>
            ))}
          </div>
          <span className="discovery-count">
            {loading ? 'Finding your sound…' : `${data?.total || 0} picks, tuned to you`}
          </span>
        </div>
        {error ? (
          <Empty
            title="A small interruption."
            action={
              <button className="button button-primary" onClick={onRetry}>
                Try again
              </button>
            }
          >
            {error}
          </Empty>
        ) : loading && !data ? (
          <div className="skeleton-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton-card">
                <div />
                <span />
                <small />
              </div>
            ))}
          </div>
        ) : picks.length ? (
          <div className={`track-grid ${loading ? 'is-fetching' : ''}`} aria-busy={loading}>
            {picks.map((t) => (
              <TrackCard
                key={t.id}
                track={t}
                onPlay={() =>
                  player.current?.id === t.id && player.status === 'playing'
                    ? void player.toggle()
                    : player.play(t, data!.tracks, mood)
                }
                onFeedback={onFeedback}
                onWhy={onWhy}
                active={player.current?.id === t.id}
                playing={player.status === 'playing'}
              />
            ))}
          </div>
        ) : loading ? (
          <Spinner />
        ) : (
          <Empty
            title="You’ve explored this corner."
            action={
              <button className="button button-secondary" onClick={() => setMood('all')}>
                Explore all moods
              </button>
            }
          >
            Try another mood, adjust your discovery mix, or expand your catalog in Settings.
          </Empty>
        )}
        <div className="picks-footnote">
          <span>
            <Headphones size={13} /> Official previews when available. Full listening at the source.
          </span>
          <span>
            Artwork is illustrative <Disc3 size={12} />
          </span>
        </div>
      </section>
      <section className="mood-section">
        <div className="section-heading">
          <div>
            <h2>Go where the mood takes you</h2>
            <p>Same you. A different frequency.</p>
          </div>
          <span className="tiny-caption">YOUR RADIO, REIMAGINED</span>
        </div>
        <div className="mood-grid">
          <button className="mood-card mood-focus" onClick={() => start('focus')}>
            <div className="mood-orbit orbit-focus" />
            <div className="mood-card-top">
              <Sun size={20} />
              <span>01 / FIND YOUR FLOW</span>
            </div>
            <div className="mood-card-bottom">
              <div>
                <h3>Head in the clouds</h3>
                <p>A little focus. A lot of feeling.</p>
              </div>
              <span className="mood-play">
                <Play size={16} fill="currentColor" />
              </span>
            </div>
          </button>
          <button className="mood-card mood-night" onClick={() => start('after-hours')}>
            <div className="mood-orbit orbit-night" />
            <div className="mood-card-top">
              <Moon size={19} />
              <span>02 / STAY A LITTLE LONGER</span>
            </div>
            <div className="mood-card-bottom">
              <div>
                <h3>After the afterhours</h3>
                <p>For when the world gets quiet.</p>
              </div>
              <span className="mood-play">
                <Play size={16} fill="currentColor" />
              </span>
            </div>
          </button>
          <button className="mood-card mood-energy" onClick={() => start('energy')}>
            <div className="mood-orbit orbit-energy" />
            <div className="mood-card-top">
              <AudioLines size={21} />
              <span>03 / FEEL SOMETHING GOOD</span>
            </div>
            <div className="mood-card-bottom">
              <div>
                <h3>A brighter kind of day</h3>
                <p>Good energy, on your wavelength.</p>
              </div>
              <span className="mood-play">
                <Play size={16} fill="currentColor" />
              </span>
            </div>
          </button>
        </div>
      </section>
      {!!boot.taste.top_artists.length && (
        <section className="artists-section">
          <div className="section-heading">
            <div>
              <h2>The artists in your orbit</h2>
              <p>A few familiar faces behind your next discovery.</p>
            </div>
            <button className="text-button" onClick={() => navigate('taste')}>
              Your taste, decoded <ArrowRight size={15} />
            </button>
          </div>
          <div className="artist-grid">
            {boot.taste.top_artists.slice(0, 6).map((artist, i) => (
              <button
                className="artist-chip"
                key={artist.name}
                onClick={() => onSearch(artist.name)}
              >
                <div>
                  <Cover track={{ art: artist.art, title: artist.name }} />
                  <span>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <strong>{artist.name}</strong>
                <small>
                  Explore artist <ArrowUpRight size={11} />
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="feedback-callout">
        <div className="feedback-icon">
          <ThumbsUp size={21} />
        </div>
        <div>
          <h3>A little feedback. A better soundtrack.</h3>
          <p>Love it? Like it. Know it? Tell us. Your DJ gets better with every little signal.</p>
        </div>
        <button
          className="icon-button"
          onClick={() => navigate('taste')}
          aria-label="See how recommendations learn"
        >
          <ChevronRight size={21} />
        </button>
      </div>
      <footer className="page-footer">
        <span>FOR THE MUSIC YOU HAVEN’T MET YET.</span>
        <span>
          Human taste. Intelligent discovery. <span className="orange">✳</span>
        </span>
      </footer>
    </div>
  )
}
