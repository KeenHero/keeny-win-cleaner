import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  CleanRequest,
  CleanResult,
  CleanResultItem,
  RiskLevel,
  ScanOptions,
  ScanSummary,
  ScanTarget,
  TargetClassification,
} from '../../src/types'
import { createContentAnalyzer, type ContentAnalyzer } from './classifier'
import { getInstalledAppTokens, getRunningProcessTokens, isProbablyInstalled } from './registry'

interface TargetDefinition {
  id: string
  nameKey: string
  descriptionKey: string
  path: string
  category: string
  risk: RiskLevel
  kind: 'contents' | 'folder'
  requiresAdmin?: boolean
  selectedByDefault?: boolean
  directFilePattern?: RegExp
  cleanAction?: 'windows-autoclean' | 'component-cleanup'
  virtualSize?: number
  virtualFiles?: number
  reason?: string
  classification?: TargetClassification
}

interface MeasuredPath {
  size: number
  files: number
  folders: number
  denied: boolean
  latestModified?: Date
}

interface ApprovedTarget {
  definition: TargetDefinition
  allowedRoots: string[]
}

const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
const roamingAppData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
const localLowAppData = path.join(os.homedir(), 'AppData', 'LocalLow')
const programData = process.env.ProgramData ?? 'C:\\ProgramData'
const windowsDir = process.env.WINDIR ?? 'C:\\Windows'
const userTemp = process.env.TEMP ?? path.join(localAppData, 'Temp')
const systemDrive = path.parse(windowsDir).root
const execFileAsync = promisify(execFile)

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

const standardTargets: TargetDefinition[] = [
  {
    id: 'user-temp',
    nameKey: 'targets.userTemp.name',
    descriptionKey: 'targets.userTemp.description',
    path: userTemp,
    category: 'temporary',
    risk: 'safe',
    kind: 'contents',
    selectedByDefault: true,
  },
  {
    id: 'crash-dumps',
    nameKey: 'targets.crashDumps.name',
    descriptionKey: 'targets.crashDumps.description',
    path: path.join(localAppData, 'CrashDumps'),
    category: 'reports',
    risk: 'safe',
    kind: 'contents',
    selectedByDefault: true,
  },
  {
    id: 'directx-shader-cache',
    nameKey: 'targets.shaderCache.name',
    descriptionKey: 'targets.shaderCache.description',
    path: path.join(localAppData, 'D3DSCache'),
    category: 'cache',
    risk: 'safe',
    kind: 'contents',
    selectedByDefault: true,
  },
  {
    id: 'windows-error-reports',
    nameKey: 'targets.errorReports.name',
    descriptionKey: 'targets.errorReports.description',
    path: path.join(localAppData, 'Microsoft', 'Windows', 'WER'),
    category: 'reports',
    risk: 'safe',
    kind: 'contents',
    selectedByDefault: true,
  },
  {
    id: 'thumbnail-cache',
    nameKey: 'targets.thumbnailCache.name',
    descriptionKey: 'targets.thumbnailCache.description',
    path: path.join(localAppData, 'Microsoft', 'Windows', 'Explorer'),
    category: 'cache',
    risk: 'safe',
    kind: 'contents',
    selectedByDefault: true,
    directFilePattern: /^(thumbcache|iconcache).*\.db$/i,
  },
  {
    id: 'edge-cache',
    nameKey: 'targets.edgeCache.name',
    descriptionKey: 'targets.edgeCache.description',
    path: path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
    category: 'browser',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'chrome-cache',
    nameKey: 'targets.chromeCache.name',
    descriptionKey: 'targets.chromeCache.description',
    path: path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
    category: 'browser',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'discord-cache',
    nameKey: 'targets.discordCache.name',
    descriptionKey: 'targets.discordCache.description',
    path: path.join(roamingAppData, 'discord', 'Cache'),
    category: 'apps',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'windows-temp',
    nameKey: 'targets.windowsTemp.name',
    descriptionKey: 'targets.windowsTemp.description',
    path: path.join(windowsDir, 'Temp'),
    category: 'system',
    risk: 'advanced',
    kind: 'contents',
    requiresAdmin: true,
    classification: {
      applicationType: 'system',
      applicationConfidence: 'high',
      contentType: 'cache',
      contentConfidence: 'high',
      evidence: ['windowsManaged', 'temporaryFolder'],
      breakdown: [],
    },
  },
  {
    id: 'delivery-optimization',
    nameKey: 'targets.deliveryOptimization.name',
    descriptionKey: 'targets.deliveryOptimization.description',
    path: path.join(programData, 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache'),
    category: 'system',
    risk: 'advanced',
    kind: 'contents',
    requiresAdmin: true,
    classification: {
      applicationType: 'system',
      applicationConfidence: 'high',
      contentType: 'cache',
      contentConfidence: 'high',
      evidence: ['windowsManaged', 'updateCache'],
      breakdown: [],
    },
  },
  {
    id: 'previous-windows-installation',
    nameKey: 'targets.previousWindows.name',
    descriptionKey: 'targets.previousWindows.description',
    path: path.join(systemDrive, 'Windows.old'),
    category: 'system',
    risk: 'advanced',
    kind: 'folder',
    requiresAdmin: true,
    cleanAction: 'windows-autoclean',
    reason: 'removes-windows-rollback',
    classification: {
      applicationType: 'system',
      applicationConfidence: 'high',
      contentType: 'rollback',
      contentConfidence: 'high',
      evidence: ['windowsManaged', 'previousWindows'],
      breakdown: [],
    },
  },
]

const approvedTargets = new Map<string, ApprovedTarget>()

function canonical(candidate: string): string {
  return path.resolve(candidate).replace(/[\\/]+$/, '').toLocaleLowerCase('en-US')
}

export function isPathWithin(candidate: string, root: string): boolean {
  const resolvedCandidate = canonical(candidate)
  const resolvedRoot = canonical(root)
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
}

async function measure(
  candidate: string,
  directFilePattern?: RegExp,
  analyzer?: ContentAnalyzer,
  relativePath = '',
): Promise<MeasuredPath> {
  const result: MeasuredPath = { size: 0, files: 0, folders: 0, denied: false }
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(candidate, { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') result.denied = true
    return result
  }

  for (const entry of entries) {
    if (directFilePattern && !entry.isFile()) continue
    if (directFilePattern && !directFilePattern.test(entry.name)) continue

    const entryPath = path.join(candidate, entry.name)
    const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name
    try {
      const stat = await fs.lstat(entryPath)
      if (stat.isSymbolicLink()) continue
      if (!result.latestModified || stat.mtime > result.latestModified) result.latestModified = stat.mtime

      if (stat.isDirectory()) {
        analyzer?.addDirectory(entryRelativePath)
        result.folders += 1
        const nested = await measure(entryPath, undefined, analyzer, entryRelativePath)
        result.size += nested.size
        result.files += nested.files
        result.folders += nested.folders
        result.denied ||= nested.denied
        if (nested.latestModified && (!result.latestModified || nested.latestModified > result.latestModified)) {
          result.latestModified = nested.latestModified
        }
      } else if (stat.isFile()) {
        result.size += stat.size
        result.files += 1
        analyzer?.addFile(entryRelativePath, stat.size)
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EACCES' || code === 'EPERM') result.denied = true
    }
  }
  return result
}

async function toScanTarget(definition: TargetDefinition): Promise<ScanTarget> {
  const {
    directFilePattern: _directFilePattern,
    cleanAction: _cleanAction,
    virtualSize,
    virtualFiles,
    reason,
    ...publicDefinition
  } = definition
  try {
    const stat = await fs.lstat(definition.path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return emptyTarget(definition, 'protected')
    }

    const analyzer = definition.id.startsWith('orphan:')
      ? createContentAnalyzer(path.basename(definition.path))
      : undefined
    const measured = virtualSize === undefined
      ? await measure(definition.path, definition.directFilePattern, analyzer)
      : {
          size: virtualSize,
          files: virtualFiles ?? 0,
          folders: 0,
          denied: false,
          latestModified: stat.mtime,
        }
    const modifiedAt = measured.latestModified?.toISOString() ?? stat.mtime.toISOString()
    return {
      ...publicDefinition,
      requiresAdmin: Boolean(definition.requiresAdmin),
      selectedByDefault: Boolean(definition.selectedByDefault),
      size: measured.size,
      fileCount: measured.files,
      folderCount: measured.folders,
      modifiedAt,
      reason,
      classification: definition.classification ?? analyzer?.finish(measured.size),
      status: measured.denied ? 'denied' : 'ready',
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return emptyTarget(definition, 'missing')
    if (code === 'EACCES' || code === 'EPERM') return emptyTarget(definition, 'denied')
    return emptyTarget(definition, 'error')
  }
}

function emptyTarget(definition: TargetDefinition, status: ScanTarget['status']): ScanTarget {
  const {
    directFilePattern: _directFilePattern,
    cleanAction: _cleanAction,
    virtualSize: _virtualSize,
    virtualFiles: _virtualFiles,
    reason,
    ...publicDefinition
  } = definition
  return {
    ...publicDefinition,
    requiresAdmin: Boolean(definition.requiresAdmin),
    selectedByDefault: Boolean(definition.selectedByDefault),
    size: 0,
    fileCount: 0,
    folderCount: 0,
    reason,
    status,
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

function shouldIncludeTarget(target: TargetDefinition, options: ScanOptions): boolean {
  if (target.risk === 'safe') return options.includeSafe
  if (target.category === 'system') return options.includeSystem
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

export async function scanSystem(
  options: ScanOptions,
  onProgress?: (progress: number) => void,
): Promise<ScanSummary> {
  approvedTargets.clear()
  const definitions = standardTargets.filter((target) => shouldIncludeTarget(target, options))
  if (options.includeSystem) {
    const componentStoreTarget = await getComponentStoreTarget()
    if (componentStoreTarget) definitions.push(componentStoreTarget)
  }
  if (options.includeOrphans) definitions.push(...await findOrphanCandidates(options.minOrphanAgeDays))

  const targets: ScanTarget[] = []
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index]
    const target = await toScanTarget(definition)
    targets.push(target)
    if (target.status === 'ready') {
      const root = target.id.startsWith('orphan:')
        ? [localAppData, roamingAppData, localLowAppData].find((item) => isPathWithin(target.path, item))
        : definition.path
      if (root) approvedTargets.set(target.id, { definition, allowedRoots: [root] })
    }
    onProgress?.(Math.round(((index + 1) / Math.max(1, definitions.length)) * 100))
  }

  const visibleTargets = targets
    .filter((target) => target.status !== 'missing')
    .sort((left, right) => right.size - left.size)
  return {
    targets: visibleTargets,
    totalSize: visibleTargets.reduce((sum, target) => sum + target.size, 0),
    totalFiles: visibleTargets.reduce((sum, target) => sum + target.fileCount, 0),
    scannedAt: new Date().toISOString(),
    partial: visibleTargets.some((target) => target.status === 'denied' || target.status === 'error'),
    warnings: options.includeOrphans
      ? ['orphan-detection-is-heuristic']
      : [],
  }
}

async function removeEntry(candidate: string, allowedRoots: string[]): Promise<number> {
  if (!allowedRoots.some((root) => isPathWithin(candidate, root))) {
    throw new Error('Path is outside the approved cleanup roots')
  }
  const stat = await fs.lstat(candidate)
  if (stat.isSymbolicLink()) throw new Error('Links and junctions are protected')

  if (stat.isDirectory()) {
    let freed = 0
    const entries = await fs.readdir(candidate)
    for (const entry of entries) freed += await removeEntry(path.join(candidate, entry), allowedRoots)
    await fs.rmdir(candidate)
    return freed
  }
  const size = stat.isFile() ? stat.size : 0
  await fs.unlink(candidate)
  return size
}

async function cleanTarget(approved: ApprovedTarget): Promise<number> {
  const { definition, allowedRoots } = approved
  const stat = await fs.lstat(definition.path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Target is no longer a safe folder')

  if (definition.cleanAction) {
    const before = await fs.statfs(systemDrive)
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
    const after = await fs.statfs(systemDrive)
    return Math.max(0, Number(after.bavail - before.bavail) * Number(after.bsize))
  }

  if (definition.kind === 'folder') return removeEntry(definition.path, allowedRoots)

  const entries = await fs.readdir(definition.path, { withFileTypes: true })
  let freed = 0
  for (const entry of entries) {
    if (definition.directFilePattern && !entry.isFile()) continue
    if (definition.directFilePattern && !definition.directFilePattern.test(entry.name)) continue
    try {
      freed += await removeEntry(path.join(definition.path, entry.name), allowedRoots)
    } catch {
      continue
    }
  }
  return freed
}

export async function cleanSystem(request: CleanRequest): Promise<CleanResult> {
  if (request.confirmation !== 'CLEAN') throw new Error('Cleanup confirmation is invalid')
  if (!request.targetIds.length) throw new Error('No cleanup targets were selected')

  const items: CleanResultItem[] = []
  for (const id of [...new Set(request.targetIds)]) {
    const approved = approvedTargets.get(id)
    if (!approved) {
      items.push({ id, freedBytes: 0, success: false, error: 'Target requires a new scan' })
      continue
    }
    try {
      const freedBytes = await cleanTarget(approved)
      items.push({ id, freedBytes, success: true })
      approvedTargets.delete(id)
    } catch (error) {
      items.push({
        id,
        freedBytes: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown cleanup error',
      })
    }
  }

  return {
    items,
    totalFreed: items.reduce((sum, item) => sum + item.freedBytes, 0),
    completedAt: new Date().toISOString(),
  }
}
