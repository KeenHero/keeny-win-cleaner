import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { TargetHistory } from '../../src/types'

export interface CleanupRecord {
  cleanedAt: string
  sizeBefore: number
  freedBytes: number
}

export interface RefillObservation {
  at: string
  size: number
  daysSinceCleanup: number
}

export interface TargetRecord {
  records: CleanupRecord[]
  observations: RefillObservation[]
}

interface HistoryFile {
  version: number
  targets: Record<string, TargetRecord>
}

const dayInMilliseconds = 24 * 60 * 60 * 1000
const maxRecordsPerTarget = 5
const maxObservationsPerTarget = 12
const maxHistoryAgeDays = 180

let storeDirectory: string | null = null
let cache: HistoryFile | null = null

function emptyFile(): HistoryFile {
  return { version: 1, targets: {} }
}

export function configureHistoryStore(directory: string | null): void {
  storeDirectory = directory
  cache = null
}

function storePath(): string | null {
  return storeDirectory ? path.join(storeDirectory, 'cleanup-history.json') : null
}

function load(): HistoryFile {
  if (cache) return cache
  const file = storePath()
  if (!file || !existsSync(file)) {
    cache = emptyFile()
    return cache
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as HistoryFile
    cache = parsed?.version === 1 && parsed.targets ? parsed : emptyFile()
  } catch {
    cache = emptyFile()
  }
  return cache
}

function save(): void {
  const file = storePath()
  if (!file || !cache) return
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    const temporaryFile = `${file}.tmp`
    writeFileSync(temporaryFile, JSON.stringify(cache), 'utf8')
    renameSync(temporaryFile, file)
  } catch {
    // History is a convenience. A failed write never blocks a cleanup.
  }
}

function prune(file: HistoryFile, now: number): void {
  for (const [id, record] of Object.entries(file.targets)) {
    const latest = record.records.at(-1)?.cleanedAt
    if (!latest || now - new Date(latest).getTime() > maxHistoryAgeDays * dayInMilliseconds) {
      delete file.targets[id]
    }
  }
}

export function daysBetween(from: string, to: number): number {
  const start = new Date(from).getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(0, (to - start) / dayInMilliseconds)
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Compares the current size of a target against the size it had before its last
 * cleanup. A high share after only a few days means the target refills by itself.
 */
export function computeHistory(
  record: TargetRecord,
  currentSize: number,
  now: number,
): TargetHistory | undefined {
  const last = record.records.at(-1)
  if (!last) return undefined

  const daysSinceCleanup = daysBetween(last.cleanedAt, now)
  const refillShare = last.sizeBefore > 0 ? currentSize / last.sizeBefore : 0
  const rates = record.observations
    .filter((observation) => observation.daysSinceCleanup >= 0.25)
    .map((observation) => observation.size / observation.daysSinceCleanup)

  return {
    lastCleanedAt: last.cleanedAt,
    daysSinceCleanup,
    sizeBefore: last.sizeBefore,
    freedBytes: last.freedBytes,
    refillShare,
    refillsQuickly: refillShare >= 0.5 && daysSinceCleanup <= 7 && daysSinceCleanup >= 0.25,
    refillPerDay: median(rates),
    cleanupCount: record.records.length,
  }
}

export function getTargetHistory(targetId: string, currentSize: number, now = Date.now()): TargetHistory | undefined {
  const record = load().targets[targetId]
  return record ? computeHistory(record, currentSize, now) : undefined
}

export function recordCleanup(
  entries: Array<{ targetId: string; sizeBefore: number; freedBytes: number }>,
  now = Date.now(),
): void {
  if (!storePath() || !entries.length) return
  const file = load()
  const cleanedAt = new Date(now).toISOString()

  for (const entry of entries) {
    const record = file.targets[entry.targetId] ?? { records: [], observations: [] }
    record.records.push({ cleanedAt, sizeBefore: entry.sizeBefore, freedBytes: entry.freedBytes })
    record.records = record.records.slice(-maxRecordsPerTarget)
    // A new cleanup starts a new refill cycle.
    record.observations = []
    file.targets[entry.targetId] = record
  }

  prune(file, now)
  save()
}

export function recordObservations(
  entries: Array<{ targetId: string; size: number }>,
  now = Date.now(),
): void {
  if (!storePath() || !entries.length) return
  const file = load()
  let changed = false

  for (const entry of entries) {
    const record = file.targets[entry.targetId]
    const last = record?.records.at(-1)
    if (!record || !last) continue

    const daysSinceCleanup = daysBetween(last.cleanedAt, now)
    if (daysSinceCleanup < 0.25) continue

    const latestObservation = record.observations.at(-1)
    if (latestObservation && daysSinceCleanup - latestObservation.daysSinceCleanup < 0.5) continue

    record.observations.push({ at: new Date(now).toISOString(), size: entry.size, daysSinceCleanup })
    record.observations = record.observations.slice(-maxObservationsPerTarget)
    changed = true
  }

  if (changed) save()
}
