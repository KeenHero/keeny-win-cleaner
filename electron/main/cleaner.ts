import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  CleanRequest,
  CleanResult,
  CleanResultItem,
  ScanOptions,
  ScanSummary,
  ScanTarget,
} from '../../src/types'
import { createContentAnalyzer, type ContentAnalyzer } from './classifier'
import { getTargetHistory, recordCleanup, recordObservations } from './history'
import { getRunningProcesses, matchBlockingApps, type ProcessRecord } from './locks'
import { getInstalledAppTokens, getRunningProcessTokens, isProbablyInstalled } from './registry'
import {
  buildBrowserTargets,
  buildDeveloperTargets,
  buildDiskCleanupTargets,
  buildGameTargets,
  buildRecycleBinTarget,
  developerTargets,
  gameTargets,
  localAppData,
  localLowAppData,
  roamingAppData,
  standardTargets,
  systemDrive,
  systemLogTargets,
  targetSources,
  volumeCachesKey,
  windowsDir,
  type TargetDefinition,
} from './targets'

interface MeasuredPath {
  size: number
  files: number
  folders: number
  denied: boolean
  latestModified?: Date
}

interface MeasureOptions {
  directFilePattern?: RegExp
  analyzer?: ContentAnalyzer
  relativePath?: string
  olderThan?: number
}

interface RemovalResult {
  freed: number
  skipped: number
}

interface ApprovedTarget {
  definition: TargetDefinition
  allowedRoots: string[]
  measuredSize: number
}

const execFileAsync = promisify(execFile)
const diskCleanupFlagName = 'StateFlags0099'
const diskCleanupRunId = '99'

const protectedAppDataNames = new Set([
  'application data',
  'connecteddevicesplatform',
  'elevateddiagnostics',
  'history',
  'microsoft',
  'packages',
  'package cache',
  'programs',
  'publishers',
  'temp',
  'temporary internet files',
  'virtualstore',
])

const approvedTargets = new Map<string, ApprovedTarget>()

function canonical(candidate: string): string {
  return path.resolve(candidate).replace(/[\\/]+$/, '').toLocaleLowerCase('en-US')
}

export function isPathWithin(candidate: string, root: string): boolean {
  const resolvedCandidate = canonical(candidate)
  const resolvedRoot = canonical(root)
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
}

export function ageCutoff(minFileAgeDays: number | undefined, now = Date.now()): number | undefined {
  if (!minFileAgeDays || minFileAgeDays <= 0) return undefined
  return now - minFileAgeDays * 24 * 60 * 60 * 1000
}

interface MeasureJob {
  directory: string
  relativePath: string
  directFilePattern?: RegExp
}

const measureConcurrency = 12

// Directories are walked by a small pool of workers. Every accumulated value is
// order independent, so the result does not depend on how the pool schedules work.
async function measure(candidate: string, options: MeasureOptions = {}): Promise<MeasuredPath> {
  const { directFilePattern, analyzer, relativePath = '', olderThan } = options
  const result: MeasuredPath = { size: 0, files: 0, folders: 0, denied: false }
  const queue: MeasureJob[] = [{ directory: candidate, relativePath, directFilePattern }]
  let active = 0

  async function handle(job: MeasureJob): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(job.directory, { withFileTypes: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') result.denied = true
      return
    }

    for (const entry of entries) {
      if (job.directFilePattern && !entry.isFile()) continue
      if (job.directFilePattern && !job.directFilePattern.test(entry.name)) continue

      const entryPath = path.join(job.directory, entry.name)
      const entryRelativePath = job.relativePath ? path.join(job.relativePath, entry.name) : entry.name
      try {
        const stat = await fs.lstat(entryPath)
        if (stat.isSymbolicLink()) continue
        if (!result.latestModified || stat.mtime > result.latestModified) result.latestModified = stat.mtime

        if (stat.isDirectory()) {
          analyzer?.addDirectory(entryRelativePath)
          result.folders += 1
          queue.push({ directory: entryPath, relativePath: entryRelativePath })
        } else if (stat.isFile()) {
          if (olderThan !== undefined && stat.mtimeMs > olderThan) continue
          result.size += stat.size
          result.files += 1
          analyzer?.addFile(entryRelativePath, stat.size)
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EACCES' || code === 'EPERM') result.denied = true
      }
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const job = queue.shift()
      if (!job) {
        if (!active) return
        await new Promise((resolve) => setImmediate(resolve))
        continue
      }
      active += 1
      try {
        await handle(job)
      } finally {
        active -= 1
      }
    }
  }

  await Promise.all(Array.from({ length: measureConcurrency }, () => worker()))
  return result
}

function buildScanTarget(
  definition: TargetDefinition,
  status: ScanTarget['status'],
  measured?: Partial<ScanTarget>,
): ScanTarget {
  return {
    id: definition.id,
    nameKey: definition.nameKey,
    nameSuffix: definition.nameSuffix,
    descriptionKey: definition.descriptionKey,
    path: definition.path,
    category: definition.category,
    risk: definition.risk,
    kind: definition.kind,
    requiresAdmin: Boolean(definition.requiresAdmin),
    selectedByDefault: Boolean(definition.selectedByDefault),
    size: 0,
    sizeUnknown: definition.sizeUnknown,
    fileCount: 0,
    folderCount: 0,
    minFileAgeDays: definition.minFileAgeDays,
    reason: definition.reason,
    classification: definition.classification,
    status,
    ...measured,
  }
}

async function scanFileTarget(definition: TargetDefinition): Promise<ScanTarget> {
  const stat = await fs.lstat(definition.path)
  if (stat.isSymbolicLink() || !stat.isFile()) return buildScanTarget(definition, 'protected')
  return buildScanTarget(definition, 'ready', {
    size: stat.size,
    fileCount: 1,
    modifiedAt: stat.mtime.toISOString(),
  })
}

async function toScanTarget(definition: TargetDefinition): Promise<ScanTarget> {
  try {
    if (definition.kind === 'file') return await scanFileTarget(definition)

    const sources = targetSources(definition)
    const readable: string[] = []
    for (const source of sources) {
      try {
        const stat = await fs.lstat(source)
        if (stat.isDirectory() && !stat.isSymbolicLink()) readable.push(source)
      } catch {
        continue
      }
    }
    if (!readable.length) return buildScanTarget(definition, 'missing')

    // Handlers without a measurable folder are offered without a size estimate.
    if (definition.sizeUnknown) return buildScanTarget(definition, 'ready')

    if (definition.virtualSize !== undefined) {
      const stat = await fs.lstat(readable[0])
      return buildScanTarget(definition, 'ready', {
        size: definition.virtualSize,
        fileCount: definition.virtualFiles ?? 0,
        modifiedAt: stat.mtime.toISOString(),
      })
    }

    const analyzer = definition.id.startsWith('orphan:')
      ? createContentAnalyzer(path.basename(definition.path))
      : undefined
    const olderThan = ageCutoff(definition.minFileAgeDays)
    const total: MeasuredPath = { size: 0, files: 0, folders: 0, denied: false }
    for (const source of readable) {
      const measured = await measure(source, {
        directFilePattern: definition.directFilePattern,
        analyzer,
        olderThan,
      })
      total.size += measured.size
      total.files += measured.files
      total.folders += measured.folders
      total.denied ||= measured.denied
      if (measured.latestModified && (!total.latestModified || measured.latestModified > total.latestModified)) {
        total.latestModified = measured.latestModified
      }
    }

    const denied = total.denied && !definition.tolerateDenied
    return buildScanTarget(definition, denied ? 'denied' : 'ready', {
      size: total.size,
      fileCount: total.files,
      folderCount: total.folders,
      modifiedAt: total.latestModified?.toISOString(),
      classification: definition.classification ?? analyzer?.finish(total.size),
    })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return buildScanTarget(definition, 'missing')
    if (code === 'EACCES' || code === 'EPERM') return buildScanTarget(definition, 'denied')
    return buildScanTarget(definition, 'error')
  }
}

export function parseDismSize(value: string): number {
  const match = value.trim().match(/^([\d,.]+)\s*(bytes|KB|MB|GB|TB)$/i)
  if (!match) return 0
  const amount = Number(match[1].replace(/,/g, ''))
  const unit = match[2].toLocaleUpperCase('en-US')
  const power = ['BYTES', 'KB', 'MB', 'GB', 'TB'].indexOf(unit)
  return Number.isFinite(amount) && power >= 0 ? Math.round(amount * 1024 ** power) : 0
}

async function getComponentStoreTarget(): Promise<TargetDefinition | null> {
  try {
    const { stdout } = await execFileAsync(
      'dism.exe',
      ['/Online', '/Cleanup-Image', '/AnalyzeComponentStore', '/English'],
      { windowsHide: true, timeout: 90_000, maxBuffer: 4 * 1024 * 1024 },
    )
    const recommended = /Component Store Cleanup Recommended\s*:\s*Yes/i.test(stdout)
    if (!recommended) return null
    const backups = stdout.match(/Backups and Disabled Features\s*:\s*([^\r\n]+)/i)?.[1] ?? ''
    const cache = stdout.match(/Cache and Temporary Data\s*:\s*([^\r\n]+)/i)?.[1] ?? ''
    const packages = Number(stdout.match(/Number of Reclaimable Packages\s*:\s*(\d+)/i)?.[1] ?? 0)
    return {
      id: 'windows-component-cleanup',
      nameKey: 'targets.componentStore.name',
      descriptionKey: 'targets.componentStore.description',
      path: path.join(windowsDir, 'WinSxS'),
      category: 'system',
      risk: 'advanced',
      kind: 'contents',
      requiresAdmin: true,
      cleanAction: 'component-cleanup',
      virtualSize: parseDismSize(backups) + parseDismSize(cache),
      virtualFiles: packages,
      reason: 'dism-cleanup-recommended',
      classification: {
        applicationType: 'system',
        applicationConfidence: 'high',
        contentType: 'updates',
        contentConfidence: 'high',
        evidence: ['windowsManaged', 'dismRecommendation'],
        breakdown: [],
      },
    }
  } catch {
    return null
  }
}

export function shouldIncludeTarget(target: TargetDefinition, options: ScanOptions): boolean {
  if (target.category === 'development') return options.includeDevelopment
  if (target.category === 'games') return options.includeGames
  if (target.category === 'system' || target.category === 'logs' || target.category === 'recycle') {
    return options.includeSystem
  }
  if (target.risk === 'safe') return options.includeSafe
  return options.includeApps
}

async function findOrphanCandidates(minAgeDays: number): Promise<TargetDefinition[]> {
  const installedTokens = getInstalledAppTokens()
  const runningTokens = getRunningProcessTokens()
  const knownTokens = new Set([...installedTokens, ...runningTokens])
  const roots = [localAppData, roamingAppData, localLowAppData]
  const cutoff = Date.now() - Math.max(14, minAgeDays) * 24 * 60 * 60 * 1000
  const candidates: TargetDefinition[] = []

  for (const root of roots) {
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      if (protectedAppDataNames.has(entry.name.toLocaleLowerCase('en-US'))) continue
      if (isProbablyInstalled(entry.name, knownTokens)) continue

      const candidatePath = path.join(root, entry.name)
      try {
        const stat = await fs.lstat(candidatePath)
        if (stat.mtimeMs > cutoff || stat.isSymbolicLink()) continue
      } catch {
        continue
      }

      const rootLabel = canonical(root) === canonical(localAppData)
        ? 'Local'
        : canonical(root) === canonical(roamingAppData)
          ? 'Roaming'
          : 'LocalLow'
      candidates.push({
        id: `orphan:${rootLabel}:${Buffer.from(entry.name).toString('base64url')}`,
        nameKey: entry.name,
        descriptionKey: 'targets.orphan.description',
        path: candidatePath,
        category: 'leftovers',
        risk: 'advanced',
        kind: 'folder',
      })
    }
  }
  return candidates
}

async function collectDefinitions(options: ScanOptions): Promise<TargetDefinition[]> {
  const definitions = [
    ...standardTargets,
    ...developerTargets,
    ...gameTargets,
    ...systemLogTargets,
  ].filter((target) => shouldIncludeTarget(target, options))

  if (options.includeApps) definitions.push(...await buildBrowserTargets())
  if (options.includeDevelopment) definitions.push(...await buildDeveloperTargets())
  if (options.includeGames) definitions.push(...await buildGameTargets())
  if (options.includeSystem) {
    definitions.push(...buildDiskCleanupTargets())
    const recycleBin = await buildRecycleBinTarget()
    if (recycleBin) definitions.push(recycleBin)
    const componentStoreTarget = await getComponentStoreTarget()
    if (componentStoreTarget) definitions.push(componentStoreTarget)
  }
  if (options.includeOrphans) definitions.push(...await findOrphanCandidates(options.minOrphanAgeDays))

  return definitions
}

function allowedRootsFor(definition: TargetDefinition): string[] {
  if (definition.id.startsWith('orphan:')) {
    const root = [localAppData, roamingAppData, localLowAppData]
      .find((candidate) => isPathWithin(definition.path, candidate))
    return root ? [root] : []
  }
  return definition.kind === 'file' ? [definition.path] : targetSources(definition)
}

export async function scanSystem(
  options: ScanOptions,
  onProgress?: (progress: number) => void,
): Promise<ScanSummary> {
  approvedTargets.clear()
  const definitions = await collectDefinitions(options)
  const processes = getRunningProcesses()

  const targets: ScanTarget[] = []
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index]
    const target = await toScanTarget(definition)
    if (target.status === 'ready') {
      const blockingApps = matchBlockingApps(
        processes,
        targetSources(definition),
        definition.ownerProcesses,
      )
      if (blockingApps.length) target.blockingApps = blockingApps
      target.history = getTargetHistory(target.id, target.size)

      const allowedRoots = allowedRootsFor(definition)
      if (allowedRoots.length) {
        approvedTargets.set(target.id, { definition, allowedRoots, measuredSize: target.size })
      }
    }
    targets.push(target)
    onProgress?.(Math.round(((index + 1) / Math.max(1, definitions.length)) * 100))
  }

  const visibleTargets = targets
    .filter((target) => target.status !== 'missing')
    .sort((left, right) => right.size - left.size)
  recordObservations(visibleTargets.map((target) => ({ targetId: target.id, size: target.size })))

  const warnings: string[] = []
  if (options.includeOrphans) warnings.push('orphan-detection-is-heuristic')
  if (visibleTargets.some((target) => target.sizeUnknown)) warnings.push('size-unknown-for-windows-handlers')
  if (visibleTargets.some((target) => target.blockingApps?.length)) warnings.push('applications-are-running')

  return {
    targets: visibleTargets,
    totalSize: visibleTargets.reduce((sum, target) => sum + target.size, 0),
    totalFiles: visibleTargets.reduce((sum, target) => sum + target.fileCount, 0),
    scannedAt: new Date().toISOString(),
    partial: visibleTargets.some((target) => target.status === 'denied' || target.status === 'error'),
    warnings,
  }
}

async function removeEntry(
  candidate: string,
  allowedRoots: string[],
  olderThan?: number,
): Promise<RemovalResult> {
  if (!allowedRoots.some((root) => isPathWithin(candidate, root))) {
    throw new Error('Path is outside the approved cleanup roots')
  }
  const stat = await fs.lstat(candidate)
  if (stat.isSymbolicLink()) throw new Error('Links and junctions are protected')

  if (stat.isDirectory()) {
    const result: RemovalResult = { freed: 0, skipped: 0 }
    let entries: string[] = []
    try {
      entries = await fs.readdir(candidate)
    } catch {
      return { freed: 0, skipped: 1 }
    }
    for (const entry of entries) {
      try {
        const nested = await removeEntry(path.join(candidate, entry), allowedRoots, olderThan)
        result.freed += nested.freed
        result.skipped += nested.skipped
      } catch {
        result.skipped += 1
      }
    }
    try {
      await fs.rmdir(candidate)
    } catch {
      // The folder still holds locked or recent files and stays in place.
    }
    return result
  }

  if (!stat.isFile()) return { freed: 0, skipped: 1 }
  if (olderThan !== undefined && stat.mtimeMs > olderThan) return { freed: 0, skipped: 1 }
  await fs.unlink(candidate)
  return { freed: stat.size, skipped: 0 }
}

async function freedSpaceOf(action: () => Promise<void>): Promise<number> {
  const before = await fs.statfs(systemDrive)
  await action()
  const after = await fs.statfs(systemDrive)
  return Math.max(0, Number(after.bavail - before.bavail) * Number(after.bsize))
}

async function runDiskCleanupHandlers(handlerKeys: string[]): Promise<void> {
  const available = await execFileAsync('reg.exe', ['query', volumeCachesKey], {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  const allKeys = available.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLocaleUpperCase('en-US').startsWith('HK'))
    .map((line) => line.slice(line.lastIndexOf('\\') + 1))
    .filter(Boolean)

  // Every handler is reset first so that no flag from an earlier run stays active.
  for (const key of allKeys) {
    const enabled = handlerKeys.includes(key)
    await execFileAsync('reg.exe', [
      'add',
      `${volumeCachesKey}\\${key}`,
      '/v',
      diskCleanupFlagName,
      '/t',
      'REG_DWORD',
      '/d',
      enabled ? '2' : '0',
      '/f',
    ], { windowsHide: true, timeout: 10_000 })
  }

  await execFileAsync('cleanmgr.exe', ['/sagerun:' + diskCleanupRunId], {
    windowsHide: true,
    timeout: 60 * 60 * 1000,
  })
}

async function cleanTarget(approved: ApprovedTarget): Promise<RemovalResult> {
  const { definition, allowedRoots } = approved

  if (definition.cleanAction === 'windows-autoclean' || definition.cleanAction === 'component-cleanup') {
    const stat = await fs.lstat(definition.path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Target is no longer a safe folder')
    const freed = await freedSpaceOf(async () => {
      if (definition.cleanAction === 'windows-autoclean') {
        await execFileAsync('cleanmgr.exe', ['/d', systemDrive.slice(0, 2), '/autoclean'], {
          windowsHide: true,
          timeout: 30 * 60 * 1000,
        })
      } else {
        await execFileAsync('dism.exe', ['/Online', '/Cleanup-Image', '/StartComponentCleanup', '/English'], {
          windowsHide: true,
          timeout: 60 * 60 * 1000,
          maxBuffer: 8 * 1024 * 1024,
        })
      }
    })
    return { freed, skipped: 0 }
  }

  if (definition.cleanAction === 'recycle-bin') {
    const freed = await freedSpaceOf(async () => {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Clear-RecycleBin -Force -ErrorAction SilentlyContinue',
      ], { windowsHide: true, timeout: 30 * 60 * 1000 })
    })
    return { freed, skipped: 0 }
  }

  if (definition.kind === 'file') {
    const stat = await fs.lstat(definition.path)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Target is no longer a regular file')
    return removeEntry(definition.path, allowedRoots)
  }

  const olderThan = ageCutoff(definition.minFileAgeDays)
  const result: RemovalResult = { freed: 0, skipped: 0 }

  for (const source of targetSources(definition)) {
    let stat: import('node:fs').Stats
    try {
      stat = await fs.lstat(source)
    } catch {
      continue
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Target is no longer a safe folder')

    if (definition.kind === 'folder') {
      const removed = await removeEntry(source, allowedRoots, olderThan)
      result.freed += removed.freed
      result.skipped += removed.skipped
      continue
    }

    let entries: import('node:fs').Dirent[] = []
    try {
      entries = await fs.readdir(source, { withFileTypes: true })
    } catch {
      result.skipped += 1
      continue
    }
    for (const entry of entries) {
      if (definition.directFilePattern && !entry.isFile()) continue
      if (definition.directFilePattern && !definition.directFilePattern.test(entry.name)) continue
      try {
        const removed = await removeEntry(path.join(source, entry.name), allowedRoots, olderThan)
        result.freed += removed.freed
        result.skipped += removed.skipped
      } catch {
        result.skipped += 1
      }
    }
  }
  return result
}

export async function cleanSystem(request: CleanRequest): Promise<CleanResult> {
  if (request.confirmation !== 'CLEAN') throw new Error('Cleanup confirmation is invalid')
  if (!request.targetIds.length) throw new Error('No cleanup targets were selected')

  const requestedIds = [...new Set(request.targetIds)]
  const handlerIds = requestedIds.filter(
    (id) => approvedTargets.get(id)?.definition.cleanAction === 'disk-cleanup-handler',
  )
  const items: CleanResultItem[] = []
  const cleaned: Array<{ targetId: string; sizeBefore: number; freedBytes: number }> = []
  const blocked: Array<{ item: CleanResultItem; definition: TargetDefinition }> = []

  for (const id of requestedIds) {
    if (handlerIds.includes(id)) continue
    const approved = approvedTargets.get(id)
    if (!approved) {
      items.push({ id, freedBytes: 0, skippedFiles: 0, success: false, error: 'Target requires a new scan' })
      continue
    }
    try {
      const removed = await cleanTarget(approved)
      const item: CleanResultItem = { id, freedBytes: removed.freed, skippedFiles: removed.skipped, success: true }
      items.push(item)
      cleaned.push({ targetId: id, sizeBefore: approved.measuredSize, freedBytes: removed.freed })
      if (removed.skipped > 0) blocked.push({ item, definition: approved.definition })
      approvedTargets.delete(id)
    } catch (error) {
      items.push({
        id,
        freedBytes: 0,
        skippedFiles: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown cleanup error',
      })
    }
  }

  // Applications are looked up once, and only when something was actually skipped.
  if (blocked.length) {
    let processes: ProcessRecord[] = []
    try {
      processes = getRunningProcesses()
    } catch {
      processes = []
    }
    for (const entry of blocked) {
      const apps = matchBlockingApps(
        processes,
        targetSources(entry.definition),
        entry.definition.ownerProcesses,
      )
      if (apps.length) entry.item.blockedBy = apps
    }
  }

  // All selected Disk Cleanup handlers run in a single supported cleanmgr pass.
  if (handlerIds.length) {
    const handlerKeys = handlerIds
      .map((id) => approvedTargets.get(id)?.definition.handlerKey)
      .filter((key): key is string => Boolean(key))
    try {
      const freed = await freedSpaceOf(() => runDiskCleanupHandlers(handlerKeys))
      handlerIds.forEach((id, index) => {
        const freedBytes = index === 0 ? freed : 0
        items.push({ id, freedBytes, skippedFiles: 0, success: true })
        const approved = approvedTargets.get(id)
        if (approved) cleaned.push({ targetId: id, sizeBefore: approved.measuredSize, freedBytes })
        approvedTargets.delete(id)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown cleanup error'
      for (const id of handlerIds) {
        items.push({ id, freedBytes: 0, skippedFiles: 0, success: false, error: message })
      }
    }
  }

  recordCleanup(cleaned)

  return {
    items,
    totalFreed: items.reduce((sum, item) => sum + item.freedBytes, 0),
    completedAt: new Date().toISOString(),
  }
}
