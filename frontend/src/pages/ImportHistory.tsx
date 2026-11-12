import { useRef, useState } from 'react'
import {
  Upload,
  FileArchive,
  FileJson,
  Check,
  ArrowRight,
  ShieldCheck,
  ArrowUpRight,
  X,
  LoaderCircle,
  LockKeyhole,
  Download,
  AlertCircle,
  CheckCircle2,
  Music2,
} from 'lucide-react'
import { api } from '../api'
import type { Bootstrap, ImportResult, Page } from '../types'
import { Cover } from '../components/ui'
export default function ImportHistory({
  boot,
  onImported,
  navigate,
}: {
  boot: Bootstrap
  onImported: () => Promise<void>
  navigate: (p: Page) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [includeAll, setIncludeAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [sample, setSample] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  function select(f: File) {
    setError('')
    setResult(null)
    setSample(false)
    if (!/\.(zip|json|html?|csv)$/i.test(f.name)) {
      setError('Please choose a ZIP, JSON, HTML, or CSV file.')
      return
    }
    if (f.size > 30 * 1024 * 1024) {
      setError(
        'This file is larger than 30 MB. Export only YouTube and YouTube Music, or choose a smaller date range.',
      )
      return
    }
    setFile(f)
  }
  async function upload(selected: File | null = file, isSample = false) {
    if (!selected) return
    setBusy(true)
    setError('')
    setResult(null)
    setSample(isSample)
    const data = new FormData()
    data.append('file', selected)
    data.append('include_all_youtube', String(includeAll))
    try {
      const res = await api<ImportResult>('/import', { method: 'POST', body: data })
      setResult(res)
      setFile(null)
      if (input.current) input.current.value = ''
      await onImported()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Import failed. Your existing music data has not changed.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function useSample() {
    setError('')
    try {
      const response = await fetch('/sample-history.json')
      if (!response.ok) throw new Error('Could not load the sample file.')
      await upload(
        new File([await response.blob()], 'sample-music-history.json', {
          type: 'application/json',
        }),
        true,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sample.')
    }
  }
  return (
    <div className="page-enter import-page">
      <div className="page-heading">
        <span className="eyebrow">LET’S GET TO KNOW YOUR SOUND</span>
        <h1>
          Your next chapter starts
          <br className="desktop-break" /> with your listening history
          <span className="orange">.</span>
        </h1>
        <p>All those songs you’ve loved? They’re the map to what you’ll love next.</p>
      </div>
      <div className="import-grid">
        <div className="import-main">
          {result ? (
            <section className="import-success panel">
              <div className="success-icon">
                <CheckCircle2 size={32} />
              </div>
              <span className="eyebrow">
                {sample ? 'SAMPLE FILE IMPORTED' : 'YOUR MUSIC, CONNECTED'}
              </span>
              <h2>
                {result.imported ? 'We’re getting to know you.' : 'Already part of your story.'}
              </h2>
              <p>
                {sample
                  ? 'You’ve tested the real import pipeline with a sample file. Import your own Takeout whenever you’re ready.'
                  : result.imported
                    ? 'Your history is now shaping your next discovery. No account connection needed.'
                    : 'These events were already imported. No duplicates were added to your profile.'}
              </p>
              <div className="import-result-stats">
                <div>
                  <b>{result.imported.toLocaleString()}</b>
                  <span>events imported</span>
                </div>
                <div>
                  <b>{result.duplicates.toLocaleString()}</b>
                  <span>duplicates skipped</span>
                </div>
                <div>
                  <b>{result.skipped.toLocaleString()}</b>
                  <span>non-music skipped</span>
                </div>
              </div>
              {result.warnings.map((w) => (
                <div className="inline-warning" key={w}>
                  <AlertCircle size={15} />
                  <span>{w}</span>
                </div>
              ))}
              {!!result.taste.top_artists.length && (
                <div className="import-found-artists">
                  <span>A FEW FAMILIAR NAMES</span>
                  <div>
                    {result.taste.top_artists.slice(0, 4).map((a) => (
                      <div key={a.name}>
                        <Cover track={{ title: a.name, art: a.art }} />
                        <span>{a.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button className="button button-primary" onClick={() => navigate('discover')}>
                Find my next favorite <ArrowRight size={16} />
              </button>
              <button className="text-button import-another" onClick={() => setResult(null)}>
                Import another file
              </button>
            </section>
          ) : (
            <section className="panel import-upload-panel">
              <div className="panel-title">
                <span className="panel-title-icon">
                  <Upload size={19} />
                </span>
                <div>
                  <h2>Import your music history</h2>
                  <p>Your listening story, without the login.</p>
                </div>
              </div>
              <input
                ref={input}
                id="history-file"
                aria-label="Upload your music history file"
                type="file"
                accept=".zip,.json,.html,.htm,.csv"
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files?.[0]) select(e.target.files[0])
                }}
                className="visually-hidden"
                tabIndex={-1}
              />
              <div
                className={`dropzone ${drag ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!busy) setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  if (!busy && e.dataTransfer.files[0]) select(e.dataTransfer.files[0])
                }}
              >
                {file ? (
                  <>
                    <div className="file-selected-icon">
                      {file.name.endsWith('.zip') ? (
                        <FileArchive size={32} />
                      ) : (
                        <FileJson size={32} />
                      )}
                    </div>
                    <h3>{file.name}</h3>
                    <p>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to find your sound</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setFile(null)
                        if (input.current) input.current.value = ''
                      }}
                      disabled={busy}
                    >
                      <X size={14} />
                      Choose a different file
                    </button>
                  </>
                ) : (
                  <>
                    <div className="upload-visual">
                      <span />
                      <FileArchive size={36} strokeWidth={1.4} />
                      <span />
                    </div>
                    <h3>Drop your listening history here</h3>
                    <p>A little history. A whole lot of possibility.</p>
                    <button
                      className="button button-dark"
                      onClick={() => input.current?.click()}
                      disabled={busy}
                    >
                      <Upload size={16} />
                      Choose a file
                    </button>
                    <div className="file-types">
                      ZIP <i /> JSON <i /> HTML <i /> CSV <span>· up to 30 MB</span>
                    </div>
                  </>
                )}
              </div>
              <label className="include-checkbox">
                <input
                  type="checkbox"
                  checked={includeAll}
                  onChange={(e) => setIncludeAll(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  Include all YouTube videos
                  <small>
                    For combined watch-history files without separate music labels. Non-music videos
                    may affect your taste profile.
                  </small>
                </span>
              </label>
              {error && (
                <div className="form-error" role="alert">
                  <AlertCircle size={17} />
                  {error}
                </div>
              )}
              {file && (
                <button
                  className="button button-primary import-submit"
                  onClick={() => void upload()}
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={18} className="spin" />
                      Reading your listening story…
                    </>
                  ) : (
                    <>
                      Import & find my sound <ArrowRight size={17} />
                    </>
                  )}
                </button>
              )}
              {busy && (
                <p className="processing-note" role="status">
                  Parsing and deduplicating on this app’s server. Larger files can take a moment.
                </p>
              )}
              <div className="upload-privacy">
                <ShieldCheck size={16} />
                <span>
                  Processed by your app. Never sent to a third-party AI.
                  <br />
                  Original files aren’t kept after processing.
                </span>
              </div>
            </section>
          )}
          <div className="sample-import">
            <div>
              <Music2 size={18} />
              <span>Just looking around? Try the real importer with sample data.</span>
            </div>
            <button className="text-button" onClick={() => void useSample()} disabled={busy}>
              Try a sample import <ArrowRight size={14} />
            </button>
          </div>
        </div>
        <aside className="import-guide panel">
          <span className="eyebrow">YOUR MUSIC IS ALREADY OUT THERE</span>
          <h2>Let’s bring it home.</h2>
          <p>Google Takeout lets you download your YouTube Music activity. Here’s how.</p>
          <ol className="takeout-steps">
            <li>
              <span>01</span>
              <div>
                <h3>Open Google Takeout</h3>
                <p>Sign in to the Google account you use for YouTube Music.</p>
                <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">
                  Go to Google Takeout <ArrowUpRight size={13} />
                </a>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Choose your music data</h3>
                <p>
                  Deselect all, then select <b>YouTube and YouTube Music</b>. Under “All YouTube
                  data included,” keep <b>history</b>.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Create your export</h3>
                <p>
                  Choose JSON or HTML, then a one-time ZIP export. Google will email you when it’s
                  ready.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Drop it right here</h3>
                <p>
                  Use the ZIP or the watch-history file inside. We’ll identify tracks and skip
                  repeat events.
                </p>
              </div>
            </li>
          </ol>
          <div className="guide-note">
            <LockKeyhole size={17} />
            <div>
              <b>No passwords. No account access.</b>
              <p>
                Only import data you’re comfortable storing on this app’s server. Use a trusted
                deployment.
              </p>
            </div>
          </div>
          <a className="sample-download" href="/sample-history.json" download>
            <Download size={14} />
            Download an example JSON file
          </a>
        </aside>
      </div>
      {!!boot.imports.length && (
        <section className="import-history-section">
          <div className="section-heading">
            <h2>A growing listening story</h2>
            <span className="tiny-caption">YOUR RECENT IMPORTS</span>
          </div>
          <div className="panel import-table">
            <div className="import-table-header">
              <span>FILE</span>
              <span>NEW EVENTS</span>
              <span>DUPLICATES</span>
              <span>IMPORTED</span>
            </div>
            {boot.imports.map((i) => (
              <div className="import-table-row" key={i.id}>
                <span>
                  <FileJson size={17} />
                  {i.filename}
                </span>
                <span>{i.imported.toLocaleString()}</span>
                <span>{i.duplicates.toLocaleString()}</span>
                <span>
                  <Check size={13} />
                  {new Date(i.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="import-info">
        <ShieldCheck size={19} />
        <p>
          <b>A personal DJ, not a data business.</b> Your parsed history stays in this app’s
          database, isolated to your browser session. Export or delete it anytime in Settings. Music
          providers only receive search terms when you request a lookup.
        </p>
      </div>
    </div>
  )
}
