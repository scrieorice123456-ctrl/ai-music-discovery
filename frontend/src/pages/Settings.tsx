import { useEffect, useRef, useState } from 'react'
import { api, post } from '../api'
import {
  ShieldCheck,
  Download,
  Trash2,
  RefreshCw,
  ArrowUpRight,
  Check,
  Database,
  Link2,
  Info,
  LoaderCircle,
  SlidersHorizontal,
  LockKeyhole,
  Disc3,
  AlertCircle,
} from 'lucide-react'
import type { Bootstrap } from '../types'
import { Modal } from '../components/ui'
type Job = { status: string; message?: string; found?: number }
export default function Settings({
  boot,
  onRefresh,
  onReset,
  onMix,
  notify,
}: {
  boot: Bootstrap
  onRefresh: () => Promise<void>
  onReset: () => void
  onMix: () => void
  notify: (s: string) => void
}) {
  const [job, setJob] = useState<Job>({ status: 'idle' })
  const [confirm, setConfirm] = useState<'delete' | 'demo' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    void api<Job>('/catalog/status')
      .then((j) => {
        if (mounted.current) setJob(j)
      })
      .catch(() => {})
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (job.status !== 'running') return
    let canceled = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const j = await api<Job>('/catalog/status')
        if (canceled) return
        setJob(j)
        if (j.status === 'running') timer = setTimeout(() => void poll(), 1500)
        else {
          await onRefresh()
          if (j.message) notify(j.message)
        }
      } catch {
        if (!canceled) {
          setJob({
            status: 'error',
            message: 'Could not check the catalog refresh. Try again later.',
          })
        }
      }
    }
    timer = setTimeout(() => void poll(), 1200)
    return () => {
      canceled = true
      clearTimeout(timer)
    }
  }, [job.status, onRefresh, notify])
  async function refresh() {
    setError('')
    setJob({ status: 'running', message: 'Checking iTunes and MusicBrainz…' })
    try {
      const j = await post<Job>('/catalog/refresh')
      if (mounted.current) setJob(j)
    } catch (e) {
      setJob({ status: 'error', message: e instanceof Error ? e.message : 'Could not refresh.' })
    }
  }
  async function reset() {
    setDeleting(true)
    setError('')
    try {
      await post('/profile/reset', { demo: confirm === 'demo', confirm: 'DELETE MY DATA' })
      onReset()
      await onRefresh()
      setConfirm(null)
      notify(
        confirm === 'demo'
          ? 'Sample profile loaded. Ready to explore.'
          : 'Your listening history, feedback, and imports have been deleted.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete data.')
    } finally {
      setDeleting(false)
    }
  }
  return (
    <div className="page-enter settings-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR MUSIC. YOUR RULES.</span>
        <h1>
          A little control goes a long way<span className="orange">.</span>
        </h1>
        <p>Your data, your discovery, and the services that help it all come together.</p>
      </div>
      <div className="settings-grid">
        <div>
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">A PRIVATE LITTLE MUSIC UNIVERSE</span>
                <h2>Your listening data</h2>
              </div>
              <Database size={21} />
            </div>
            <div className="settings-detail">
              <div>
                <h3>Stored on this app’s server</h3>
                <p>
                  {boot.taste.plays.toLocaleString()} history events · {boot.taste.feedback_count}{' '}
                  feedback tracks · {boot.imports.length} recent imports
                </p>
              </div>
              <span className="data-status">
                <ShieldCheck size={13} />
                Session isolated
              </span>
            </div>
            <p className="settings-description">
              No Google login. No tracking pixels. No AI service receives your archive. A private,
              HTTP-only cookie identifies this browser’s data for up to 30 days. Clearing that
              cookie loses access to the profile.
            </p>
            <div className="settings-action-row">
              <div>
                <h3>Take your music story with you</h3>
                <p>Export normalized history, feedback, and mix settings as JSON.</p>
              </div>
              <a
                href="/api/profile/export"
                download
                className="button button-secondary button-small"
              >
                <Download size={15} />
                Export data
              </a>
            </div>
            <div className="settings-action-row">
              <div>
                <h3>Start with a clean slate</h3>
                <p>Permanently remove this session’s history, feedback, and imports.</p>
              </div>
              <button
                className="button button-danger button-small"
                onClick={() => setConfirm('delete')}
              >
                <Trash2 size={14} />
                Delete data
              </button>
            </div>
            <div className="settings-action-row">
              <div>
                <h3>Just here to explore?</h3>
                <p>Replace this profile with our curated sample listening history.</p>
              </div>
              <button
                className="button button-secondary button-small"
                onClick={() => setConfirm('demo')}
              >
                <Disc3 size={14} />
                Load sample
              </button>
            </div>
          </section>
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">YOUR TASTE, WITH A TWIST</span>
                <h2>The discovery balance</h2>
              </div>
              <SlidersHorizontal size={21} />
            </div>
            <div className="settings-mix">
              <div className="mix-stack large">
                {(['similar', 'discovery', 'experimental'] as const).map((k) => (
                  <div
                    key={k}
                    className={`mix-segment segment-${k}`}
                    style={{ width: `${boot.settings[k]}%` }}
                  />
                ))}
              </div>
              <p>
                <b>{boot.settings.similar}%</b> familiar · <b>{boot.settings.discovery}%</b>{' '}
                discovery · <b>{boot.settings.experimental}%</b> adventure
              </p>
              <button className="text-button" onClick={onMix}>
                Adjust my discovery mix <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
        </div>
        <div>
          <section className="panel settings-panel connections-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">GOOD COMPANY FOR GOOD MUSIC</span>
                <h2>Music connections</h2>
              </div>
              <Link2 size={21} />
            </div>
            <p className="settings-description">
              Public metadata, no API keys. Only search terms, artist names, and track titles are
              sent when you request a lookup—not your full history.
            </p>
            {[
              {
                id: 'musicbrainz',
                name: 'MusicBrainz',
                mark: 'mb',
                description: 'Open recording metadata & genre connections',
                url: 'https://musicbrainz.org/',
              },
              {
                id: 'itunes',
                name: 'Apple iTunes',
                mark: '♪',
                description: 'Music search, artwork & official audio previews',
                url: 'https://performance-partners.apple.com/search-api',
              },
            ].map((p) => {
              const s = boot.providers.find((x) => x.provider === p.id)
              return (
                <div className="provider-card" key={p.id}>
                  <div className={`provider-mark provider-${p.id}`}>{p.mark}</div>
                  <div>
                    <h3>
                      {p.name}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`About ${p.name}`}
                      >
                        <ArrowUpRight size={13} />
                      </a>
                    </h3>
                    <p>{p.description}</p>
                    <span
                      className={`provider-status ${s ? (s.available ? 'connected' : 'offline') : 'unchecked'}`}
                    >
                      <i />
                      {!boot.external_apis_enabled
                        ? 'Disabled by deployment'
                        : s
                          ? s.available
                            ? 'Connected'
                            : 'Currently unreachable'
                          : 'Not checked yet'}
                    </span>
                  </div>
                </div>
              )
            })}
            <div className="catalog-summary">
              <Disc3 size={18} />
              <p>
                <b>{boot.catalog_size.toLocaleString()} recordings</b> in this server’s available
                catalog. A refresh searches your top artists and genre tags for more.
              </p>
            </div>
            <button
              className="button button-dark catalog-refresh"
              disabled={job.status === 'running' || !boot.external_apis_enabled}
              onClick={() => void refresh()}
            >
              {job.status === 'running' ? (
                <>
                  <LoaderCircle className="spin" size={16} />
                  Finding more music…
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Expand my catalog
                </>
              )}
            </button>
            {job.message && (
              <div
                className={`catalog-job ${job.status === 'error' ? 'job-error' : ''}`}
                role="status"
              >
                {job.status === 'running' ? (
                  <LoaderCircle size={14} className="spin" />
                ) : job.found ? (
                  <Check size={15} />
                ) : (
                  <Info size={15} />
                )}
                <p>{job.message}</p>
              </div>
            )}
          </section>
          <section className="privacy-card">
            <LockKeyhole size={22} />
            <h3>Made to stay yours.</h3>
            <p>
              This is a local-first app, not a cloud account. For shared or public hosting, the
              administrator should put authentication and HTTPS in front of it. Imported files are
              discarded after parsing.
            </p>
            <span>NO PAID AI. NO HIDDEN PLAYBACK.</span>
          </section>
        </div>
      </div>
      {confirm && (
        <Modal
          title={
            confirm === 'demo' ? 'Back to a little exploring?' : 'Let’s make sure it’s goodbye.'
          }
          onClose={() => {
            if (!deleting) {
              setConfirm(null)
              setError('')
            }
          }}
        >
          <div className="delete-dialog-icon">
            <AlertCircle size={28} />
          </div>
          <p className="modal-intro">
            {confirm === 'demo'
              ? 'Loading the sample profile permanently replaces this browser’s history, feedback, and imports. Export anything you want to keep first.'
              : 'This permanently deletes your listening history, feedback, and import records for this browser’s profile. It can’t be undone. Your original Takeout files are not affected.'}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              className="button button-secondary"
              disabled={deleting}
              onClick={() => setConfirm(null)}
            >
              Keep my data
            </button>
            <button
              className="button button-danger-solid"
              disabled={deleting}
              onClick={() => void reset()}
            >
              {deleting ? (
                <LoaderCircle className="spin" size={17} />
              ) : confirm === 'demo' ? (
                'Replace with sample'
              ) : (
                'Yes, delete my data'
              )}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  )
}
