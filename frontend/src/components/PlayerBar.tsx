import { useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ListMusic,
  Heart,
  Radio,
  ExternalLink,
  LoaderCircle,
  Shuffle,
  ChevronUp,
} from 'lucide-react'
import type { Player } from '../hooks/usePlayer'
import type { FeedbackAction, Track } from '../types'
import { Cover, formatTime } from './ui'
export default function PlayerBar({
  player,
  onFeedback,
  onQueue,
  onSources,
}: {
  player: Player
  onFeedback: (track: Track, action: FeedbackAction) => void
  onQueue: () => void
  onSources: (track: Track) => void
}) {
  const t = player.current
  const [lastVolume, setLastVolume] = useState(0.7)
  return (
    <>
      <audio
        ref={player.audioRef}
        preload="none"
        onTimeUpdate={player.onTimeUpdate}
        onLoadedMetadata={player.onLoadedMetadata}
        onError={player.onError}
        onEnded={() => void player.next(true)}
      />
      <div className={`player-bar ${t ? 'has-track' : ''}`} role="region" aria-label="Music player">
        <div className="player-track">
          {t ? (
            <>
              <Cover track={t} />
              <div className="player-track-text">
                <strong>{t.title}</strong>
                <span>{t.artist}</span>
                <button
                  className={`player-source ${player.status === 'unavailable' ? 'source-unavailable' : ''}`}
                  onClick={() => onSources(t)}
                >
                  {player.status === 'unavailable' ? (
                    <>
                      <ExternalLink size={10} />
                      Listen at the source
                    </>
                  ) : (
                    <>30-SECOND OFFICIAL PREVIEW</>
                  )}
                </button>
              </div>
              <button
                className={`icon-button player-save ${t.saved ? 'saved' : ''}`}
                onClick={() => onFeedback(t, t.saved ? 'unsave' : 'save')}
                aria-label={`${t.saved ? 'Unsave' : 'Save'} current song`}
              >
                <Heart size={17} fill={t.saved ? 'currentColor' : 'none'} />
              </button>
            </>
          ) : (
            <>
              <div className="player-empty-art">
                <Radio size={22} />
              </div>
              <div className="player-track-text">
                <strong>Your next favorite is waiting.</strong>
                <span>Let’s find your frequency.</span>
              </div>
            </>
          )}
        </div>
        <div className="player-center">
          <div className="playback-controls">
            <button
              className="icon-button shuffle-button"
              onClick={() => void player.start()}
              aria-label="Shuffle a new radio"
            >
              <Shuffle size={16} />
            </button>
            <button
              className="icon-button"
              onClick={player.previous}
              disabled={!t || player.status === 'loading'}
              aria-label="Previous song"
            >
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button
              className="main-play"
              onClick={() =>
                t
                  ? player.status === 'unavailable'
                    ? onSources(t)
                    : void player.toggle()
                  : void player.start()
              }
              disabled={player.status === 'loading'}
              aria-label={
                player.status === 'playing'
                  ? 'Pause'
                  : player.status === 'unavailable'
                    ? 'Open official music sources'
                    : t
                      ? 'Play'
                      : 'Start radio'
              }
            >
              {player.status === 'loading' ? (
                <LoaderCircle className="spin" size={21} />
              ) : player.status === 'playing' ? (
                <Pause size={19} fill="currentColor" />
              ) : player.status === 'unavailable' ? (
                <ExternalLink size={18} />
              ) : (
                <Play size={19} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-button"
              onClick={() => void player.next()}
              disabled={!t || player.status === 'loading' || player.exhausted}
              aria-label="Next song"
            >
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button
              className="icon-button queue-mobile"
              onClick={onQueue}
              aria-label="Open radio queue"
            >
              <ChevronUp size={19} />
            </button>
          </div>
          <div className="playback-progress">
            <span>{formatTime(player.progress)}</span>
            <input
              type="range"
              min="0"
              max={player.duration || 30}
              step=".1"
              value={player.progress}
              onChange={(e) => player.seek(+e.target.value)}
              disabled={!t || player.status === 'unavailable' || player.status === 'loading'}
              aria-label="Preview progress"
              style={
                {
                  '--range-progress': `${(player.progress / (player.duration || 30)) * 100}%`,
                } as React.CSSProperties
              }
            />
            <span>{formatTime(t ? player.duration : 0)}</span>
          </div>
        </div>
        <div className="player-right">
          <button className="player-queue" onClick={onQueue}>
            <ListMusic size={18} />
            <span>Up next</span>
          </button>
          <div className="player-volume">
            <button
              className="icon-button"
              onClick={() => {
                if (player.volume > 0) {
                  setLastVolume(player.volume)
                  player.setVolume(0)
                } else player.setVolume(lastVolume || 0.7)
              }}
              aria-label={player.volume > 0 ? 'Mute' : 'Unmute'}
            >
              {player.volume > 0 ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={player.volume}
              onChange={(e) => player.setVolume(+e.target.value)}
              aria-label="Volume"
            />
          </div>
          <span className="preview-badge">PREVIEW MODE</span>
        </div>
      </div>
    </>
  )
}
