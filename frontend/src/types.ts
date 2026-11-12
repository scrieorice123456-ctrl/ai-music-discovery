export type Lane = 'similar' | 'discovery' | 'experimental'
export type Mood = 'all' | 'chill' | 'focus' | 'energy' | 'after-hours'
export type Page = 'discover' | 'radio' | 'library' | 'taste' | 'import' | 'settings'
export type Mix = Record<Lane, number>
export type Track = {
  id: number
  title: string
  artist: string
  album: string
  genres: string[]
  moods: string[]
  art: string
  duration: number
  energy: number
  family: string
  source: string
  lane?: Lane
  reason?: string
  factors?: string[]
  saved?: boolean
  liked?: boolean
  video_id?: string
  source_url?: string
  preview_url?: string
  play_count?: number
  metadata_status: string
}
export type Taste = {
  plays: number
  tracks: number
  artists: number
  metadata_coverage: number
  genres: { name: string; value: number }[]
  top_artists: { name: string; weight: number; art: string }[]
  moods: { name: string; weight: number }[]
  energy: number
  periods: { name: string; plays: number }[]
  feedback_count: number
  saved: number
}
export type ImportRecord = {
  id: number
  filename: string
  imported: number
  duplicates: number
  skipped: number
  created_at: string
}
export type Bootstrap = {
  csrf_token: string
  demo: boolean
  settings: Mix
  taste: Taste
  imports: ImportRecord[]
  providers: { provider: string; available: number; message: string; checked_at: string }[]
  catalog_size: number
  external_apis_enabled: boolean
}
export type Discovery = {
  tracks: Track[]
  actual_mix: Partial<Record<Lane, number>>
  total: number
  demo: boolean
  cold_start: boolean
  note: string
}
export type FeedbackAction =
  'like' | 'dislike' | 'known' | 'save' | 'unsave' | 'skip' | 'listen' | 'clear'
export type ImportResult = {
  imported: number
  duplicates: number
  skipped: number
  files: number
  warnings: string[]
  taste: Taste
}
