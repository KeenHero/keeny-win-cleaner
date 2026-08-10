import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { RiskLevel, ScanKind, TargetCategory, TargetClassification } from '../../src/types'
import { getSteamPath, parseLibraryFolders, querySubKeys } from './registry'

export type CleanAction = 'windows-autoclean' | 'component-cleanup' | 'recycle-bin' | 'disk-cleanup-handler'

export interface TargetDefinition {
  id: string
  nameKey: string
  nameSuffix?: string
  descriptionKey: string
  path: string
  sources?: string[]
  category: TargetCategory
  risk: RiskLevel
  kind: ScanKind
  requiresAdmin?: boolean
  selectedByDefault?: boolean
  directFilePattern?: RegExp
  minFileAgeDays?: number
  ownerProcesses?: string[]
  tolerateDenied?: boolean
  cleanAction?: CleanAction
  handlerKey?: string
  virtualSize?: number
  virtualFiles?: number
  sizeUnknown?: boolean
  reason?: string
  classification?: TargetClassification
}

export const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
export const roamingAppData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
export const localLowAppData = path.join(os.homedir(), 'AppData', 'LocalLow')
export const programData = process.env.ProgramData ?? 'C:\\ProgramData'
export const windowsDir = process.env.WINDIR ?? 'C:\\Windows'
export const userProfile = process.env.USERPROFILE ?? os.homedir()
export const userTemp = process.env.TEMP ?? path.join(localAppData, 'Temp')
export const systemDrive = path.parse(windowsDir).root

const systemClassification: TargetClassification = {
  applicationType: 'system',
  applicationConfidence: 'high',
  contentType: 'cache',
  contentConfidence: 'high',
  evidence: ['windowsManaged', 'temporaryFolder'],
  breakdown: [],
}

// Sources are deduplicated case insensitively so that a folder is never measured or removed twice.
export function uniquePaths(candidates: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const candidate of candidates) {
    const key = path.resolve(candidate).replace(/[\\/]+$/, '').toLocaleLowerCase('en-US')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result
}

export function targetSources(definition: TargetDefinition): string[] {
  return definition.sources?.length ? uniquePaths(definition.sources) : [definition.path]
}

async function listDirectories(root: string, match?: (name: string) => boolean): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .filter((entry) => !match || match(entry.name))
      .map((entry) => path.join(root, entry.name))
      .sort()
  } catch {
    return []
  }
}

async function directoryExists(candidate: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(candidate)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

export const standardTargets: TargetDefinition[] = [
  {
    id: 'user-temp',
    nameKey: 'targets.userTemp.name',
    descriptionKey: 'targets.userTemp.description',
    path: userTemp,
    category: 'temporary',
    risk: 'safe',
    kind: 'contents',
    selectedByDefault: true,
    minFileAgeDays: 1,
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
    id: 'discord-cache',
    nameKey: 'targets.discordCache.name',
    descriptionKey: 'targets.discordCache.description',
    path: path.join(roamingAppData, 'discord'),
    sources: [
      path.join(roamingAppData, 'discord', 'Cache'),
      path.join(roamingAppData, 'discord', 'Code Cache'),
      path.join(roamingAppData, 'discord', 'GPUCache'),
    ],
    category: 'apps',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['discord.exe'],
  },
  {
    id: 'teams-cache',
    nameKey: 'targets.teamsCache.name',
    descriptionKey: 'targets.teamsCache.description',
    path: path.join(localAppData, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache'),
    sources: [
      path.join(localAppData, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'Cache'),
      path.join(localAppData, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'Logs'),
      path.join(localAppData, 'Packages', 'MSTeams_8wekyb3d8bbwe', 'LocalCache', 'Microsoft', 'MSTeams', 'GPUCache'),
    ],
    category: 'apps',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['ms-teams.exe', 'teams.exe'],
  },
  {
    id: 'spotify-cache',
    nameKey: 'targets.spotifyCache.name',
    descriptionKey: 'targets.spotifyCache.description',
    path: path.join(localAppData, 'Spotify'),
    sources: [
      path.join(localAppData, 'Spotify', 'Data'),
      path.join(localAppData, 'Spotify', 'Browser', 'Cache'),
    ],
    category: 'apps',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['spotify.exe'],
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
    minFileAgeDays: 1,
    classification: systemClassification,
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
      ...systemClassification,
      evidence: ['windowsManaged', 'updateCache'],
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
      ...systemClassification,
      contentType: 'rollback',
      evidence: ['windowsManaged', 'previousWindows'],
    },
  },
]

// Package manager and build caches. Everything here is downloaded or generated again on demand.
export const developerTargets: TargetDefinition[] = [
  {
    id: 'dev-npm',
    nameKey: 'targets.npmCache.name',
    descriptionKey: 'targets.npmCache.description',
    path: path.join(localAppData, 'npm-cache'),
    sources: [path.join(localAppData, 'npm-cache'), path.join(roamingAppData, 'npm-cache')],
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-pnpm',
    nameKey: 'targets.pnpmStore.name',
    descriptionKey: 'targets.pnpmStore.description',
    path: path.join(localAppData, 'pnpm'),
    sources: [path.join(localAppData, 'pnpm', 'store'), path.join(localAppData, 'pnpm-cache')],
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-yarn',
    nameKey: 'targets.yarnCache.name',
    descriptionKey: 'targets.yarnCache.description',
    path: path.join(localAppData, 'Yarn', 'Cache'),
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-pip',
    nameKey: 'targets.pipCache.name',
    descriptionKey: 'targets.pipCache.description',
    path: path.join(localAppData, 'pip', 'Cache'),
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-nuget',
    nameKey: 'targets.nugetCache.name',
    descriptionKey: 'targets.nugetCache.description',
    path: path.join(userProfile, '.nuget', 'packages'),
    sources: [
      path.join(userProfile, '.nuget', 'packages'),
      path.join(localAppData, 'NuGet', 'v3-cache'),
      path.join(localAppData, 'NuGet', 'plugins-cache'),
    ],
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-gradle',
    nameKey: 'targets.gradleCache.name',
    descriptionKey: 'targets.gradleCache.description',
    path: path.join(userProfile, '.gradle', 'caches'),
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-maven',
    nameKey: 'targets.mavenCache.name',
    descriptionKey: 'targets.mavenCache.description',
    path: path.join(userProfile, '.m2', 'repository'),
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-cargo',
    nameKey: 'targets.cargoCache.name',
    descriptionKey: 'targets.cargoCache.description',
    path: path.join(userProfile, '.cargo', 'registry'),
    sources: [
      path.join(userProfile, '.cargo', 'registry', 'cache'),
      path.join(userProfile, '.cargo', 'registry', 'src'),
    ],
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-go',
    nameKey: 'targets.goCache.name',
    descriptionKey: 'targets.goCache.description',
    path: path.join(localAppData, 'go-build'),
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-electron',
    nameKey: 'targets.electronCache.name',
    descriptionKey: 'targets.electronCache.description',
    path: path.join(localAppData, 'electron-builder', 'Cache'),
    sources: [
      path.join(localAppData, 'electron-builder', 'Cache'),
      path.join(localAppData, 'electron', 'Cache'),
    ],
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'dev-vscode',
    nameKey: 'targets.vscodeCache.name',
    descriptionKey: 'targets.vscodeCache.description',
    path: path.join(roamingAppData, 'Code'),
    sources: [
      path.join(roamingAppData, 'Code', 'Cache'),
      path.join(roamingAppData, 'Code', 'CachedData'),
      path.join(roamingAppData, 'Code', 'Code Cache'),
      path.join(roamingAppData, 'Code', 'GPUCache'),
      path.join(roamingAppData, 'Code', 'logs'),
    ],
    category: 'development',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['Code.exe'],
  },
  {
    id: 'dev-unity',
    nameKey: 'targets.unityCache.name',
    descriptionKey: 'targets.unityCache.description',
    path: path.join(localAppData, 'Unity', 'cache'),
    category: 'development',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['Unity.exe', 'UnityHub.exe'],
  },
  {
    id: 'dev-unreal',
    nameKey: 'targets.unrealCache.name',
    descriptionKey: 'targets.unrealCache.description',
    path: path.join(localAppData, 'UnrealEngine', 'Common', 'DerivedDataCache'),
    category: 'development',
    risk: 'review',
    kind: 'contents',
  },
]

export const gameTargets: TargetDefinition[] = [
  {
    id: 'game-nvidia-shader',
    nameKey: 'targets.nvidiaCache.name',
    descriptionKey: 'targets.nvidiaCache.description',
    path: path.join(localAppData, 'NVIDIA'),
    sources: [
      path.join(localAppData, 'NVIDIA', 'DXCache'),
      path.join(localAppData, 'NVIDIA', 'GLCache'),
      path.join(localAppData, 'NVIDIA', 'OptixCache'),
      path.join(localAppData, 'NVIDIA Corporation', 'NV_Cache'),
    ],
    category: 'games',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'game-amd-shader',
    nameKey: 'targets.amdCache.name',
    descriptionKey: 'targets.amdCache.description',
    path: path.join(localAppData, 'AMD'),
    sources: [
      path.join(localAppData, 'AMD', 'DxCache'),
      path.join(localAppData, 'AMD', 'DxcCache'),
      path.join(localAppData, 'AMD', 'GLCache'),
      path.join(localAppData, 'AMD', 'VkCache'),
    ],
    category: 'games',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'game-intel-shader',
    nameKey: 'targets.intelCache.name',
    descriptionKey: 'targets.intelCache.description',
    path: path.join(localAppData, 'Intel', 'ShaderCache'),
    category: 'games',
    risk: 'review',
    kind: 'contents',
  },
  {
    id: 'game-battlenet',
    nameKey: 'targets.battleNetCache.name',
    descriptionKey: 'targets.battleNetCache.description',
    path: path.join(localAppData, 'Battle.net', 'Cache'),
    category: 'games',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['Battle.net.exe'],
  },
  {
    id: 'game-ea',
    nameKey: 'targets.eaCache.name',
    descriptionKey: 'targets.eaCache.description',
    path: path.join(localAppData, 'Electronic Arts', 'EA Desktop', 'cache'),
    category: 'games',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['EADesktop.exe'],
  },
  {
    id: 'game-gog',
    nameKey: 'targets.gogCache.name',
    descriptionKey: 'targets.gogCache.description',
    path: path.join(programData, 'GOG.com', 'Galaxy', 'webcache'),
    category: 'games',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['GalaxyClient.exe'],
  },
]

// Crash dumps, setup logs and update leftovers. All of them require administrator access.
export const systemLogTargets: TargetDefinition[] = [
  {
    id: 'log-memory-dump',
    nameKey: 'targets.memoryDump.name',
    descriptionKey: 'targets.memoryDump.description',
    path: path.join(windowsDir, 'MEMORY.DMP'),
    category: 'logs',
    risk: 'advanced',
    kind: 'file',
    requiresAdmin: true,
    reason: 'removes-crash-analysis',
  },
  {
    id: 'log-minidumps',
    nameKey: 'targets.minidumps.name',
    descriptionKey: 'targets.minidumps.description',
    path: path.join(windowsDir, 'Minidump'),
    category: 'logs',
    risk: 'advanced',
    kind: 'contents',
    requiresAdmin: true,
    reason: 'removes-crash-analysis',
  },
  {
    id: 'log-system-error-reports',
    nameKey: 'targets.systemErrorReports.name',
    descriptionKey: 'targets.systemErrorReports.description',
    path: path.join(programData, 'Microsoft', 'Windows', 'WER'),
    sources: [
      path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportQueue'),
      path.join(programData, 'Microsoft', 'Windows', 'WER', 'ReportArchive'),
      path.join(programData, 'Microsoft', 'Windows', 'WER', 'Temp'),
    ],
    category: 'logs',
    risk: 'advanced',
    kind: 'contents',
    requiresAdmin: true,
  },
  {
    id: 'log-setup',
    nameKey: 'targets.setupLogs.name',
    descriptionKey: 'targets.setupLogs.description',
    path: path.join(windowsDir, 'Panther'),
    sources: [
      path.join(windowsDir, 'Panther'),
      path.join(windowsDir, 'Logs', 'CBS'),
      path.join(windowsDir, 'Logs', 'DISM'),
      path.join(windowsDir, 'Logs', 'MoSetup'),
      path.join(windowsDir, 'Logs', 'SIH'),
    ],
    category: 'logs',
    risk: 'advanced',
    kind: 'contents',
    requiresAdmin: true,
    minFileAgeDays: 7,
  },
  {
    id: 'log-update-leftovers',
    nameKey: 'targets.updateLeftovers.name',
    descriptionKey: 'targets.updateLeftovers.description',
    path: path.join(systemDrive, '$WinREAgent'),
    sources: [
      path.join(systemDrive, '$WinREAgent'),
      path.join(systemDrive, 'ESD', 'Download'),
    ],
    category: 'logs',
    risk: 'advanced',
    kind: 'contents',
    requiresAdmin: true,
    classification: {
      ...systemClassification,
      contentType: 'updates',
      evidence: ['windowsManaged', 'updateCache'],
    },
  },
  {
    id: 'log-diagnostic-traces',
    nameKey: 'targets.diagnosticTraces.name',
    descriptionKey: 'targets.diagnosticTraces.description',
    path: path.join(programData, 'Microsoft', 'Diagnosis', 'ETLLogs'),
    category: 'logs',
    risk: 'advanced',
    kind: 'contents',
    requiresAdmin: true,
    minFileAgeDays: 7,
  },
]

interface ChromiumBrowser {
  id: string
  label: string
  userData: string
  process: string
  flatProfile?: boolean
}

const chromiumBrowsers: ChromiumBrowser[] = [
  { id: 'edge', label: 'Microsoft Edge', process: 'msedge.exe', userData: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
  { id: 'chrome', label: 'Google Chrome', process: 'chrome.exe', userData: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
  { id: 'brave', label: 'Brave', process: 'brave.exe', userData: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
  { id: 'vivaldi', label: 'Vivaldi', process: 'vivaldi.exe', userData: path.join(localAppData, 'Vivaldi', 'User Data') },
  { id: 'opera', label: 'Opera', process: 'opera.exe', userData: path.join(localAppData, 'Opera Software', 'Opera Stable'), flatProfile: true },
  { id: 'opera-gx', label: 'Opera GX', process: 'opera.exe', userData: path.join(localAppData, 'Opera Software', 'Opera GX Stable'), flatProfile: true },
]

const chromiumProfileCaches = [
  path.join('Cache', 'Cache_Data'),
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
  path.join('Service Worker', 'CacheStorage'),
  path.join('Service Worker', 'ScriptCache'),
]

const chromiumSharedCaches = ['ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'component_crx_cache']

function isChromiumProfile(name: string): boolean {
  return name === 'Default' || name === 'Guest Profile' || /^Profile \d+$/.test(name)
}

export async function buildBrowserTargets(): Promise<TargetDefinition[]> {
  const definitions: TargetDefinition[] = []

  for (const browser of chromiumBrowsers) {
    if (!(await directoryExists(browser.userData))) continue

    const profiles = browser.flatProfile
      ? [browser.userData]
      : await listDirectories(browser.userData, isChromiumProfile)

    for (const profile of profiles) {
      const profileName = browser.flatProfile ? '' : path.basename(profile)
      definitions.push({
        id: `browser:${browser.id}:${profileName || 'default'}`,
        nameKey: 'targets.browserCache.name',
        nameSuffix: profileName ? `${browser.label}, ${profileName}` : browser.label,
        descriptionKey: 'targets.browserCache.description',
        path: profile,
        sources: chromiumProfileCaches.map((cache) => path.join(profile, cache)),
        category: 'browser',
        risk: 'review',
        kind: 'contents',
        ownerProcesses: [browser.process],
      })
    }

    if (!browser.flatProfile) {
      definitions.push({
        id: `browser:${browser.id}:shared`,
        nameKey: 'targets.browserSharedCache.name',
        nameSuffix: browser.label,
        descriptionKey: 'targets.browserSharedCache.description',
        path: browser.userData,
        sources: chromiumSharedCaches.map((cache) => path.join(browser.userData, cache)),
        category: 'browser',
        risk: 'review',
        kind: 'contents',
        ownerProcesses: [browser.process],
      })
    }
  }

  const firefoxRoot = path.join(localAppData, 'Mozilla', 'Firefox', 'Profiles')
  for (const profile of await listDirectories(firefoxRoot)) {
    definitions.push({
      id: `browser:firefox:${path.basename(profile)}`,
      nameKey: 'targets.browserCache.name',
      nameSuffix: `Mozilla Firefox, ${path.basename(profile).replace(/^[a-z0-9]+\./i, '')}`,
      descriptionKey: 'targets.browserCache.description',
      path: profile,
      sources: [
        path.join(profile, 'cache2'),
        path.join(profile, 'startupCache'),
        path.join(profile, 'thumbnails'),
      ],
      category: 'browser',
      risk: 'review',
      kind: 'contents',
      ownerProcesses: ['firefox.exe'],
    })
  }

  return definitions
}

export async function buildDeveloperTargets(): Promise<TargetDefinition[]> {
  const visualStudioRoot = path.join(localAppData, 'Microsoft', 'VisualStudio')
  const instances = await listDirectories(visualStudioRoot, (name) => /^\d+\.\d+_/.test(name))
  if (!instances.length) return []

  return [{
    id: 'dev-visualstudio',
    nameKey: 'targets.visualStudioCache.name',
    descriptionKey: 'targets.visualStudioCache.description',
    path: visualStudioRoot,
    sources: instances.map((instance) => path.join(instance, 'ComponentModelCache')),
    category: 'development',
    risk: 'review',
    kind: 'contents',
    ownerProcesses: ['devenv.exe'],
  }]
}

async function getSteamLibraries(steamPath: string): Promise<string[]> {
  const libraries = [steamPath]
  try {
    const content = await fs.readFile(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8')
    libraries.push(...parseLibraryFolders(content))
  } catch {
    // A missing library file only means that no additional drives are configured.
  }
  return uniquePaths(libraries)
}

export async function buildGameTargets(): Promise<TargetDefinition[]> {
  const definitions: TargetDefinition[] = []
  const steamPath = getSteamPath()

  if (steamPath && await directoryExists(steamPath)) {
    const libraries = await getSteamLibraries(steamPath)
    definitions.push({
      id: 'game-steam-shadercache',
      nameKey: 'targets.steamShaderCache.name',
      descriptionKey: 'targets.steamShaderCache.description',
      path: path.join(steamPath, 'steamapps', 'shadercache'),
      sources: libraries.map((library) => path.join(library, 'steamapps', 'shadercache')),
      category: 'games',
      risk: 'review',
      kind: 'contents',
      ownerProcesses: ['steam.exe'],
    })
    definitions.push({
      id: 'game-steam-htmlcache',
      nameKey: 'targets.steamWebCache.name',
      descriptionKey: 'targets.steamWebCache.description',
      path: path.join(steamPath, 'config', 'htmlcache'),
      sources: [
        path.join(steamPath, 'config', 'htmlcache'),
        path.join(localAppData, 'Steam', 'htmlcache'),
      ],
      category: 'games',
      risk: 'review',
      kind: 'contents',
      ownerProcesses: ['steam.exe'],
    })
  }

  const epicRoot = path.join(localAppData, 'EpicGamesLauncher', 'Saved')
  const epicCaches = await listDirectories(epicRoot, (name) => name.toLocaleLowerCase('en-US').startsWith('webcache'))
  if (epicCaches.length) {
    definitions.push({
      id: 'game-epic',
      nameKey: 'targets.epicCache.name',
      descriptionKey: 'targets.epicCache.description',
      path: epicRoot,
      sources: [...epicCaches, path.join(epicRoot, 'Logs')],
      category: 'games',
      risk: 'review',
      kind: 'contents',
      ownerProcesses: ['EpicGamesLauncher.exe'],
    })
  }

  return definitions
}

export async function buildRecycleBinTarget(): Promise<TargetDefinition | null> {
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const sources: string[] = []
  for (const letter of letters) {
    const candidate = path.join(`${letter}:${path.sep}`, '$Recycle.Bin')
    if (await directoryExists(candidate)) sources.push(candidate)
  }
  if (!sources.length) return null

  return {
    id: 'recycle-bin',
    nameKey: 'targets.recycleBin.name',
    descriptionKey: 'targets.recycleBin.description',
    path: sources[0],
    sources,
    category: 'recycle',
    risk: 'advanced',
    kind: 'contents',
    // Recycle bins of other accounts are not readable and must not block this target.
    tolerateDenied: true,
    cleanAction: 'recycle-bin',
    reason: 'removes-user-files',
  }
}

interface DiskCleanupHandler {
  key: string
  nameKey: string
  descriptionKey: string
  displayPath: string
  sources?: string[]
}

// Only handlers that cannot be measured or removed safely by direct file access.
// Downloads, Recycle Bin, Previous Installations and Delivery Optimization are handled elsewhere.
const diskCleanupHandlers: DiskCleanupHandler[] = [
  {
    key: 'Update Cleanup',
    nameKey: 'targets.updateCleanup.name',
    descriptionKey: 'targets.updateCleanup.description',
    displayPath: path.join(windowsDir, 'SoftwareDistribution', 'Download'),
    sources: [path.join(windowsDir, 'SoftwareDistribution', 'Download')],
  },
  {
    key: 'Device Driver Packages',
    nameKey: 'targets.driverPackages.name',
    descriptionKey: 'targets.driverPackages.description',
    displayPath: path.join(windowsDir, 'System32', 'DriverStore', 'FileRepository'),
  },
  {
    key: 'Windows ESD installation files',
    nameKey: 'targets.esdFiles.name',
    descriptionKey: 'targets.esdFiles.description',
    displayPath: path.join(systemDrive, 'ESD'),
    sources: [path.join(systemDrive, 'ESD')],
  },
  {
    key: 'Downloaded Program Files',
    nameKey: 'targets.downloadedProgramFiles.name',
    descriptionKey: 'targets.downloadedProgramFiles.description',
    displayPath: path.join(windowsDir, 'Downloaded Program Files'),
    sources: [path.join(windowsDir, 'Downloaded Program Files')],
  },
  {
    key: 'Old ChkDsk Files',
    nameKey: 'targets.chkdskFiles.name',
    descriptionKey: 'targets.chkdskFiles.description',
    displayPath: systemDrive,
  },
  {
    key: 'RetailDemo Offline Content',
    nameKey: 'targets.retailDemo.name',
    descriptionKey: 'targets.retailDemo.description',
    displayPath: path.join(systemDrive, 'RetailDemo'),
    sources: [path.join(systemDrive, 'RetailDemo')],
  },
]

export const volumeCachesKey =
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VolumeCaches'

export function getDiskCleanupHandlerKeys(): string[] {
  return diskCleanupHandlers.map((handler) => handler.key)
}

export function buildDiskCleanupTargets(): TargetDefinition[] {
  const available = new Set(querySubKeys(volumeCachesKey))
  if (!available.size) return []

  return diskCleanupHandlers
    .filter((handler) => available.has(handler.key))
    .map((handler) => ({
      id: `disk-cleanup:${handler.key}`,
      nameKey: handler.nameKey,
      descriptionKey: handler.descriptionKey,
      path: handler.displayPath,
      sources: handler.sources,
      category: 'system' as TargetCategory,
      risk: 'advanced' as RiskLevel,
      kind: 'contents' as ScanKind,
      requiresAdmin: true,
      tolerateDenied: true,
      cleanAction: 'disk-cleanup-handler' as CleanAction,
      handlerKey: handler.key,
      sizeUnknown: !handler.sources,
      classification: {
        ...systemClassification,
        contentType: 'updates' as const,
        evidence: ['windowsManaged', 'diskCleanupHandler'],
      },
    }))
}
