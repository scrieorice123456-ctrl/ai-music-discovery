import { useRef, useState } from 'react'
import { api, post } from '../api'
import type { Mood, Track } from '../types'
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'unavailable'

type Preview = { available: boolean; preview_url?: string; source_url?: string; message?: string }
export function usePlayer(
  onFeedback: (id: number, action: 'skip' | 'listen') => Promise<void>,
  notify: (message: string) => void,
) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const sequence = useRef(0)
  const moodRef = useRef<Mood>('all')
  const [queue, setQueue] = useState<Track[]>([])
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(30)
  const [volume, setVolumeState] = useState(0.7)
  const [exhausted, setExhausted] = useState(false)
  const current = queue[index]

  async function resolve(track: Track) {
    const seq = ++sequence.current
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    setStatus('loading')
    setProgress(0)
    setDuration(30)
    setMessage('Finding an official preview…')
    try {
      const data = await api<Preview>(`/tracks/${track.id}/preview`)
      if (seq !== sequence.current) return
      if (!data.available || !data.preview_url) {
        setStatus('unavailable')
        setMessage(
          data.message ||
            'No official preview is available. Listen on YouTube Music or Apple Music instead.',
        )
        notify('Official preview unavailable. Use “Listen at the source” in the player.')
        return
      }
      audio.src = data.preview_url
      audio.volume = volume
      if (data.source_url)
        setQueue((prev) =>
          prev.map((t) => (t.id === track.id ? { ...t, source_url: data.source_url } : t)),
        )
      try {
        await audio.play()
        if (seq === sequence.current) {
          setStatus('playing')
          setMessage('Official Apple preview')
        }
      } catch (error) {
        if (seq !== sequence.current) return
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setStatus('paused')
          setMessage('Press play to start the official preview.')
        } else {
          setStatus('unavailable')
          setMessage(
            'This preview could not be loaded in your browser. Open the official source instead.',
          )
        }
      }
    } catch (error) {
      if (seq === sequence.current) {
        setStatus('unavailable')
        setMessage(
          error instanceof Error
            ? error.message
            : 'Preview unavailable. Open the official source instead.',
        )
      }
    }
  }

  function play(track: Track, tracks: Track[] = [track], mood: Mood = 'all') {
    moodRef.current = mood
    const found = tracks.findIndex((t) => t.id === track.id)
    setQueue(found >= 0 ? tracks : [track, ...tracks])
    setIndex(found >= 0 ? found : 0)
    setExhausted(false)
    void resolve(track)
  }
  async function start(mood: Mood = 'all') {
    const ticket = ++sequence.current
    audioRef.current?.pause()
    setStatus('loading')
    setMessage('Building your personal radio…')
    moodRef.current = mood
    try {
      const data = await post<{ tracks: Track[]; exhausted: boolean; message: string }>(
        '/radio/queue',
        { mood, exclude: [], seed: `${Date.now()}` },
      )
      if (ticket !== sequence.current) return
      if (!data.tracks.length) {
        setStatus(current ? 'paused' : 'idle')
        setExhausted(true)
        notify(data.message)
        return
      }
      setQueue(data.tracks)
      setIndex(0)
      setExhausted(false)
      await resolve(data.tracks[0])
    } catch (error) {
      setStatus(current ? 'paused' : 'idle')
      notify(error instanceof Error ? error.message : 'Could not start radio.')
    }
  }
  async function next(completed = false) {
    if (status === 'loading') return
    if (current) await onFeedback(current.id, completed ? 'listen' : 'skip')
    if (index + 1 < queue.length) {
      const i = index + 1
      setIndex(i)
      await resolve(queue[i])
      return
    }
    setStatus('loading')
    try {
      const data = await post<{ tracks: Track[]; exhausted: boolean; message: string }>(
        '/radio/queue',
        {
          mood: moodRef.current,
          exclude: queue.slice(-1000).map((t) => t.id),
          seed: `${Date.now()}`,
        },
      )
      if (!data.tracks.length) {
        audioRef.current?.pause()
        setExhausted(true)
        setStatus('paused')
        setMessage('You’ve reached the end of this catalog. Refresh for more discoveries.')
        notify(data.message)
        return
      }
      const base = queue.slice(-900)
      setQueue([...base, ...data.tracks])
      setIndex(base.length)
      await resolve(data.tracks[0])
    } catch (error) {
      setStatus('paused')
      notify(error instanceof Error ? error.message : 'Could not load the next song.')
    }
  }
  function previous() {
    if (!current) return
    if (progress > 3 && audioRef.current?.src) {
      audioRef.current.currentTime = 0
      return
    }
    if (index > 0) {
      setExhausted(false)
      setIndex(index - 1)
      void resolve(queue[index - 1])
    }
  }
  async function toggle() {
    const audio = audioRef.current
    if (!current || !audio) return
    if (status === 'playing') {
      audio.pause()
      setStatus('paused')
    } else if (status === 'paused' && audio.src) {
      try {
        await audio.play()
        setStatus('playing')
      } catch {
        setStatus('unavailable')
        setMessage('Playback was blocked. Open the official source instead.')
      }
    } else if (status !== 'loading') {
      await resolve(current)
    }
  }
  function seek(time: number) {
    if (audioRef.current?.src && Number.isFinite(time)) {
      audioRef.current.currentTime = time
      setProgress(time)
    }
  }
  function setVolume(value: number) {
    setVolumeState(value)
    if (audioRef.current) audioRef.current.volume = value
  }
  function updateTrack(id: number, patch: Partial<Track>) {
    setQueue((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  function removeUpcoming(id: number) {
    setQueue((prev) => prev.filter((t, i) => i <= index || t.id !== id))
  }
  function reset() {
    sequence.current++
    audioRef.current?.pause()
    audioRef.current?.removeAttribute('src')
    setQueue([])
    setIndex(0)
    setStatus('idle')
    setProgress(0)
    setMessage('')
    setExhausted(false)
  }
  return {
    audioRef,
    queue,
    index,
    current,
    status,
    message,
    progress,
    duration,
    volume,
    exhausted,
    play,
    start,
    next,
    previous,
    toggle,
    seek,
    setVolume,
    updateTrack,
    removeUpcoming,
    reset,
    onTimeUpdate: () => {
      if (audioRef.current) setProgress(audioRef.current.currentTime)
    },
    onLoadedMetadata: () => {
      if (audioRef.current && Number.isFinite(audioRef.current.duration))
        setDuration(audioRef.current.duration)
    },
    onError: () => {
      if (audioRef.current?.getAttribute('src')) {
        setStatus('unavailable')
        setMessage(
          'The official preview is unavailable in this browser. Listen at the source instead.',
        )
      }
    },
  }
}
export type Player = ReturnType<typeof usePlayer>
