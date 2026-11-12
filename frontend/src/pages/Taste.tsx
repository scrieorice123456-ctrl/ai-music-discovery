import {
  ArrowRight,
  AudioLines,
  Users,
  Disc3,
  Sparkles,
  Clock3,
  SlidersHorizontal,
  Music2,
  Heart,
  Fingerprint,
  Info,
  ArrowUpRight,
} from 'lucide-react'
import type { Bootstrap, Page } from '../types'
import { Cover } from '../components/ui'
const genreColors = ['#dd7048', '#6e8576', '#c5ad70', '#9c9eb3', '#b4be9a', '#b78672']
export default function Taste({
  boot,
  onMix,
  navigate,
  onSearch,
}: {
  boot: Bootstrap
  onMix: () => void
  navigate: (p: Page) => void
  onSearch: (q: string) => void
}) {
  const t = boot.taste
  const maxWeight = Math.max(1, ...t.top_artists.map((a) => a.weight))
  const maxPeriod = Math.max(1, ...t.periods.map((p) => p.plays))
  return (
    <div className="page-enter taste-page">
      <div className="page-heading">
        <span className="eyebrow">A SOUND THAT’S UNIQUELY YOU</span>
        <h1>
          Let’s put a little soul
          <br className="desktop-break" /> into the data<span className="orange">.</span>
        </h1>
        <p>Your listening story, decoded. No boxes. No labels. Just a little self-discovery.</p>
      </div>
      {boot.demo && (
        <div className="demo-notice">
          <Sparkles size={17} />
          <p>
            These insights describe the <strong>sample profile</strong>, not your personal listening
            history.
          </p>
          <button onClick={() => navigate('import')}>
            Make it yours <ArrowRight size={15} />
          </button>
        </div>
      )}
      <div className="stat-grid">
        {[
          {
            label: 'Listening moments',
            value: t.plays,
            icon: AudioLines,
            note: 'Available history events',
          },
          {
            label: 'Tracks in your story',
            value: t.tracks,
            icon: Disc3,
            note: 'Distinct songs, deduplicated',
          },
          {
            label: 'Artists in your orbit',
            value: t.artists,
            icon: Users,
            note: 'Performers in your history',
          },
          {
            label: 'Signals from you',
            value: t.feedback_count,
            icon: Heart,
            note: 'Tracks with feedback',
          },
        ].map((s) => (
          <section className="stat-card panel" key={s.label}>
            <div>
              <s.icon size={19} />
              <span>{s.label}</span>
            </div>
            <b>{s.value.toLocaleString()}</b>
            <p>{s.note}</p>
          </section>
        ))}
      </div>
      <div className="taste-charts">
        <section className="panel artist-chart">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">THE FAMILIAR FACES</span>
              <h2>Your inner circle</h2>
            </div>
            <Users size={20} />
          </div>
          {t.top_artists.length ? (
            t.top_artists.slice(0, 6).map((a, i) => (
              <button className="artist-bar-row" key={a.name} onClick={() => onSearch(a.name)}>
                <span className="artist-rank">0{i + 1}</span>
                <Cover track={{ title: a.name, art: a.art }} />
                <div>
                  <span>
                    {a.name}
                    <ArrowUpRight size={13} />
                  </span>
                  <div className="artist-bar-track">
                    <i
                      style={{
                        width: `${(a.weight / maxWeight) * 100}%`,
                        background: genreColors[i % 6],
                      }}
                    />
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="chart-empty">
              <Music2 size={25} />
              <p>Your favorite artists will find a home here after an import.</p>
            </div>
          )}
          <p className="chart-note">
            Ranked by repeat listening, recency, and your feedback—not raw play counts.
          </p>
        </section>
        <section className="panel genre-chart">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR MUSICAL FINGERPRINT</span>
              <h2>A little bit of everything</h2>
            </div>
            <Fingerprint size={22} />
          </div>
          {t.genres.length ? (
            <>
              <div
                className="genre-ring"
                style={{
                  background: `conic-gradient(${t.genres.map((_g, i) => `${genreColors[i % 6]} ${t.genres.slice(0, i).reduce((s, x) => s + x.value, 0)}% ${t.genres.slice(0, i + 1).reduce((s, x) => s + x.value, 0)}%`).join(',')})`,
                }}
              >
                <div>
                  <AudioLines size={25} />
                  <b>Always evolving</b>
                  <small>JUST LIKE YOU</small>
                </div>
              </div>
              <div className="genre-legend">
                {t.genres.map((g, i) => (
                  <div key={g.name}>
                    <i style={{ background: genreColors[i % 6] }} />
                    <span>{g.name}</span>
                    <b>{g.value}%</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="chart-empty">
              <Fingerprint size={26} />
              <p>Import history and enrich the catalog to uncover your musical fingerprint.</p>
            </div>
          )}
          <p className="chart-note">
            Genre shares among your top tags. Editorial and provider metadata, not audio analysis.
          </p>
        </section>
      </div>
      <div className="taste-secondary-grid">
        <section className="panel listening-patterns">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">EVERY HOUR HAS A SOUNDTRACK</span>
              <h2>When the music finds you</h2>
            </div>
            <Clock3 size={19} />
          </div>
          <div className="period-chart">
            {t.periods.map((p, i) => (
              <div className="period-column" key={p.name}>
                <div className="period-track">
                  <div
                    style={{
                      height: `${Math.max(p.plays ? 5 : 0, (p.plays / maxPeriod) * 100)}%`,
                      background: genreColors[i],
                    }}
                  >
                    <span>{p.plays}</span>
                  </div>
                </div>
                <b>{p.name}</b>
                <small>{['00–06', '06–12', '12–18', '18–24'][i]}</small>
              </div>
            ))}
          </div>
          <p className="chart-note">
            Recognized timestamps in UTC. Missing timestamps don’t contribute to this chart.
          </p>
        </section>
        <section className="taste-mix-card panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ROOM FOR THE UNEXPECTED</span>
              <h2>Curiosity looks good on you.</h2>
            </div>
            <SlidersHorizontal size={20} />
          </div>
          <p>
            Your DJ follows your taste, then takes the scenic route. Choose the balance that feels
            right.
          </p>
          <div className="mix-stack large">
            {(['similar', 'discovery', 'experimental'] as const).map((k) => (
              <div
                className={`mix-segment segment-${k}`}
                key={k}
                style={{ width: `${boot.settings[k]}%` }}
              />
            ))}
          </div>
          <div className="mini-mix-stats">
            <div>
              <b>{boot.settings.similar}%</b>
              <span>Familiar</span>
            </div>
            <div>
              <b>{boot.settings.discovery}%</b>
              <span>Discovery</span>
            </div>
            <div>
              <b>{boot.settings.experimental}%</b>
              <span>Adventure</span>
            </div>
          </div>
          <button className="button button-dark" onClick={onMix}>
            Fine-tune my mix <SlidersHorizontal size={15} />
          </button>
        </section>
      </div>
      <section className="taste-transparency">
        <div>
          <Info size={21} />
        </div>
        <div>
          <h3>Intelligent discovery. No black box.</h3>
          <p>
            Your DJ uses artist affinity, shared genres, approximate energy, and your feedback.
            Recent listening matters more, and repeated plays are gently balanced.{' '}
            {t.metadata_coverage}% of available events have genre metadata; unmatched tracks still
            teach us your artists. We can only exclude songs in your available history or those you
            mark as known.
          </p>
          <button className="text-button" onClick={() => navigate('settings')}>
            See your data & connections <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  )
}
