import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X, ArrowUpRight, LoaderCircle, Music2 } from 'lucide-react'
import type { Lane, Track } from '../types'

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = before
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose()
        }
      }}
    >
      <header>
        <div>
          <span className="eyebrow">AI MUSIC DISCOVERY</span>
          <h2 id={id}>{title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  )
}

export function Cover({
  track,
  className = '',
}: {
  track: Pick<Track, 'art' | 'title'>
  className?: string
}) {
  return (
    <img
      className={`cover ${className}`}
      src={track.art}
      alt=""
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget
        if (!img.src.endsWith('/art/cover-1.svg')) img.src = '/art/cover-1.svg'
      }}
    />
  )
}

export const laneLabels: Record<Lane, string> = {
  similar: 'Familiar sound',
  discovery: 'New to you',
  experimental: 'Off the beaten path',
}
export function LaneTag({ lane = 'discovery' }: { lane?: Lane }) {
  return (
    <span className={`lane-tag lane-${lane}`}>
      <i />
      {laneLabels[lane]}
    </span>
  )
}
export function Spinner({ text = 'Finding your rhythm…' }: { text?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{text}</span>
    </div>
  )
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Music2 size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  )
}
export function SourceLinks({ track }: { track: Track }) {
  const query = encodeURIComponent(`${track.artist} ${track.title}`)
  return (
    <div className="source-links">
      <a
        className="button button-dark"
        href={
          track.video_id
            ? `https://music.youtube.com/watch?v=${track.video_id}`
            : `https://music.youtube.com/search?q=${query}`
        }
        target="_blank"
        rel="noopener noreferrer"
      >
        YouTube Music <ArrowUpRight size={16} />
      </a>
      <a
        className="button button-secondary"
        href={track.source_url || `https://music.apple.com/search?term=${query}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Apple Music <ArrowUpRight size={16} />
      </a>
    </div>
  )
}
export function formatTime(n: number) {
  return `${Math.floor(n / 60)}:${Math.floor(n % 60)
    .toString()
    .padStart(2, '0')}`
}
