import type {
  ApplicationType,
  ClassificationConfidence,
  ContentBreakdownType,
  ContentType,
  TargetClassification,
} from '../../src/types'

interface ContentAccumulator {
  bytes: Record<ContentBreakdownType, number>
  files: Record<ContentBreakdownType, number>
  developmentScore: number
  gameScore: number
  applicationScore: number
  evidence: Set<string>
  scoreFlags: Set<string>
  directories: Set<string>
}

export interface ContentAnalyzer {
  addDirectory: (relativePath: string) => void
  addFile: (relativePath: string, size: number) => void
  finish: (totalBytes: number) => TargetClassification
}

export interface ContentSample {
  path: string
  size: number
}

const breakdownTypes: ContentBreakdownType[] = [
  'cache',
  'logs',
  'settings',
  'savedData',
  'regularFiles',
  'other',
]

const cacheFolderPattern = /^(cache|cache2|cacheddata|code cache|gpucache|httpcache|shadercache|temp|tmp|webcache)$/i
const logFolderPattern = /^(crash|crashes|crashdumps|dumps|logs?|reports?)$/i
const settingsFolderPattern = /^(config|configuration|preferences|settings)$/i
const savedDataFolderPattern = /^(profiles?|save|saved|saved games|saves|sessions?|userdata|worlds?)$/i
const developmentFolderPattern = /^(\.git|\.gradle|\.idea|\.nuget|\.vscode|cargo|node_modules|packages|src)$/i
const gameFolderPattern = /^(mods|replays|savegames|screenshots|shadercache|workshop|worlds)$/i
const developmentNamePattern = /(android studio|cargo|docker|github|gitkraken|gradle|insomnia|jetbrains|nodejs|npm|nuget|playwright|pnpm|postman|puppeteer|python|rust|visual studio|vscode)/i
const gameNamePattern = /(amplitude studios|battle\.net|beta.?dwarf|bethesda|blizzard|cd projekt|electronic arts|endnight|epic games|fromsoftware|gentlymad|gog|io interactive|ironmace|kingart|ludeon|minecraft|mojang|nintendo|origin|paradox|remedy|riot games|roblox|rockstar games|steam|the creative assembly|ubisoft|xbox)/i

function emptyCounter(): Record<ContentBreakdownType, number> {
  return {
    cache: 0,
    logs: 0,
    settings: 0,
    savedData: 0,
    regularFiles: 0,
    other: 0,
  }
}

function normalizedSegments(relativePath: string): string[] {
  return relativePath.split(/[\\/]+/).map((part) => part.trim().toLocaleLowerCase('en-US')).filter(Boolean)
}

function addScoreOnce(accumulator: ContentAccumulator, flag: string, type: 'development' | 'game' | 'application', score: number): void {
  if (accumulator.scoreFlags.has(flag)) return
  accumulator.scoreFlags.add(flag)
  if (type === 'development') accumulator.developmentScore += score
  if (type === 'game') accumulator.gameScore += score
  if (type === 'application') accumulator.applicationScore += score
}

function inspectDirectory(accumulator: ContentAccumulator, name: string): void {
  if (cacheFolderPattern.test(name)) {
    accumulator.evidence.add('cacheFolders')
    addScoreOnce(accumulator, 'application-cache', 'application', 1)
  }
  if (logFolderPattern.test(name)) accumulator.evidence.add('logFolders')
  if (settingsFolderPattern.test(name)) {
    accumulator.evidence.add('configuration')
    addScoreOnce(accumulator, 'application-settings', 'application', 1)
  }
  if (savedDataFolderPattern.test(name)) accumulator.evidence.add('savedData')
  if (developmentFolderPattern.test(name)) {
    accumulator.evidence.add(name === 'node_modules' ? 'nodeModules' : 'developmentFolders')
    addScoreOnce(accumulator, `development-folder:${name}`, 'development', name === '.git' || name === 'node_modules' ? 7 : 4)
  }
  if (gameFolderPattern.test(name)) {
    accumulator.evidence.add(name === 'mods' ? 'gameMods' : 'gameData')
    addScoreOnce(accumulator, `game-folder:${name}`, 'game', name === 'mods' || name === 'savegames' ? 5 : 3)
  }
}

function inspectRootName(accumulator: ContentAccumulator, rootName: string): void {
  if (developmentNamePattern.test(rootName)) {
    accumulator.evidence.add('knownDevelopmentName')
    addScoreOnce(accumulator, 'development-root-name', 'development', 8)
  }
  if (gameNamePattern.test(rootName)) {
    accumulator.evidence.add('knownGameName')
    addScoreOnce(accumulator, 'game-root-name', 'game', 14)
  }
}

function categorizeFile(relativePath: string): ContentBreakdownType {
  const segments = normalizedSegments(relativePath)
  const fileName = segments.at(-1) ?? ''
  const folders = segments.slice(0, -1)
  if (folders.some((folder) => cacheFolderPattern.test(folder))) return 'cache'
  if (folders.some((folder) => logFolderPattern.test(folder))) return 'logs'
  if (folders.some((folder) => savedDataFolderPattern.test(folder))) return 'savedData'
  if (folders.some((folder) => settingsFolderPattern.test(folder))) return 'settings'
  if (/\.(cache|tmp|temp)$/i.test(fileName)) return 'cache'
  if (/\.(dmp|log|trace)$/i.test(fileName)) return 'logs'
  if (/\.(cfg|conf|ini|json|toml|xml|yaml|yml)$/i.test(fileName)) return 'settings'
  if (/\.(db|ess|fos|save|sav|sl2|sqlite|sqlite3|world)$/i.test(fileName)) return 'savedData'
  if (/\.(bat|cmd|com|cpp|cs|csproj|dll|exe|go|h|hpp|java|js|jsx|msi|ps1|py|rs|sln|ts|tsx|vcxproj)$/i.test(fileName)) return 'regularFiles'
  return 'other'
}

function inspectFileSignals(accumulator: ContentAccumulator, relativePath: string): void {
  const fileName = normalizedSegments(relativePath).at(-1) ?? ''
  if (/\.(cpp|cs|csproj|go|h|hpp|java|js|jsx|py|rs|sln|ts|tsx|vcxproj)$/i.test(fileName)) {
    accumulator.evidence.add('sourceCode')
    addScoreOnce(accumulator, 'source-code', 'development', 6)
  }
  if (/\.(exe|dll|msi)$/i.test(fileName)) {
    accumulator.evidence.add('executables')
    addScoreOnce(accumulator, 'executables', 'application', 4)
  }
  if (/\.(ess|fos|save|sav|sl2|world)$/i.test(fileName)) {
    accumulator.evidence.add('gameSaves')
    addScoreOnce(accumulator, 'game-save-files', 'game', 6)
  }
}

function confidenceForScore(score: number): ClassificationConfidence {
  if (score >= 8) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}

function getApplicationType(accumulator: ContentAccumulator): { type: ApplicationType; confidence: ClassificationConfidence } {
  const scores: Array<{ type: ApplicationType; score: number }> = [
    { type: 'development', score: accumulator.developmentScore },
    { type: 'game', score: accumulator.gameScore },
    { type: 'application', score: accumulator.applicationScore },
  ]
  scores.sort((left, right) => right.score - left.score)
  const best = scores[0]
  const second = scores[1]
  if (best.score < 4 || best.score - second.score < 2) return { type: 'unknown', confidence: 'low' }
  return { type: best.type, confidence: confidenceForScore(best.score) }
}

function getContentType(accumulator: ContentAccumulator, totalBytes: number): {
  type: ContentType
  confidence: ClassificationConfidence
  breakdown: TargetClassification['breakdown']
} {
  const totalFiles = breakdownTypes.reduce((sum, type) => sum + accumulator.files[type], 0)
  const useBytes = totalBytes > 0
  const denominator = useBytes ? totalBytes : totalFiles
  const breakdown = breakdownTypes
    .map((type) => ({ type, bytes: accumulator.bytes[type], files: accumulator.files[type] }))
    .filter((item) => item.bytes > 0 || item.files > 0)
    .sort((left, right) => (useBytes ? right.bytes - left.bytes : right.files - left.files))
  if (!denominator || !breakdown.length) return { type: 'unknown', confidence: 'low', breakdown }
  const top = breakdown[0]
  const topShare = (useBytes ? top.bytes : top.files) / denominator
  if (topShare < 0.62) return { type: 'mixed', confidence: topShare >= 0.4 ? 'medium' : 'high', breakdown }
  return {
    type: top.type === 'other' ? 'regularFiles' : top.type,
    confidence: topShare >= 0.8 ? 'high' : 'medium',
    breakdown,
  }
}

export function createContentAnalyzer(rootName: string): ContentAnalyzer {
  const accumulator: ContentAccumulator = {
    bytes: emptyCounter(),
    files: emptyCounter(),
    developmentScore: 0,
    gameScore: 0,
    applicationScore: 0,
    evidence: new Set(),
    scoreFlags: new Set(),
    directories: new Set(),
  }
  inspectRootName(accumulator, rootName)

  return {
    addDirectory(relativePath) {
      const normalized = relativePath.toLocaleLowerCase('en-US')
      if (accumulator.directories.has(normalized)) return
      accumulator.directories.add(normalized)
      const name = normalizedSegments(relativePath).at(-1)
      if (name) inspectDirectory(accumulator, name)
    },
    addFile(relativePath, size) {
      const type = categorizeFile(relativePath)
      accumulator.bytes[type] += Math.max(0, size)
      accumulator.files[type] += 1
      inspectFileSignals(accumulator, relativePath)
    },
    finish(totalBytes) {
      const application = getApplicationType(accumulator)
      const content = getContentType(accumulator, totalBytes)
      return {
        applicationType: application.type,
        applicationConfidence: application.confidence,
        contentType: content.type,
        contentConfidence: content.confidence,
        evidence: [...accumulator.evidence].slice(0, 5),
        breakdown: content.breakdown,
      }
    },
  }
}

export function classifyContentSample(rootName: string, entries: ContentSample[]): TargetClassification {
  const analyzer = createContentAnalyzer(rootName)
  let totalBytes = 0
  const seenDirectories = new Set<string>()
  for (const entry of entries) {
    const segments = normalizedSegments(entry.path)
    for (let index = 1; index < segments.length; index += 1) {
      const directory = segments.slice(0, index).join('\\')
      if (!seenDirectories.has(directory)) {
        seenDirectories.add(directory)
        analyzer.addDirectory(directory)
      }
    }
    analyzer.addFile(entry.path, entry.size)
    totalBytes += Math.max(0, entry.size)
  }
  return analyzer.finish(totalBytes)
}
