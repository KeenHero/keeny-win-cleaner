export type Language = 'de' | 'en'
export type RiskLevel = 'safe' | 'review' | 'advanced'
export type ScanKind = 'contents' | 'folder' | 'file'
export type TargetCategory =
  | 'temporary'
  | 'reports'
  | 'cache'
  | 'browser'
  | 'apps'
  | 'development'
  | 'games'
  | 'logs'
  | 'system'
  | 'recycle'
  | 'leftovers'
export type ApplicationType = 'development' | 'game' | 'application' | 'system' | 'unknown'
export type ClassificationConfidence = 'high' | 'medium' | 'low'
export type ContentType = 'cache' | 'logs' | 'settings' | 'savedData' | 'regularFiles' | 'mixed' | 'rollback' | 'updates' | 'unknown'
export type ContentBreakdownType = 'cache' | 'logs' | 'settings' | 'savedData' | 'regularFiles' | 'other'

export interface TargetClassification {
  applicationType: ApplicationType
  applicationConfidence: ClassificationConfidence
  contentType: ContentType
  contentConfidence: ClassificationConfidence
  evidence: string[]
  breakdown: Array<{
    type: ContentBreakdownType
    bytes: number
    files: number
  }>
}

export interface BlockingApp {
  name: string
  executablePath?: string
  processIds: number[]
}

export interface TargetHistory {
  lastCleanedAt: string
  daysSinceCleanup: number
  sizeBefore: number
  freedBytes: number
  refillShare: number
  refillsQuickly: boolean
  refillPerDay?: number
  cleanupCount: number
}

export interface ScanTarget {
  id: string
  nameKey: string
  nameSuffix?: string
  descriptionKey: string
  path: string
  category: TargetCategory
  risk: RiskLevel
  kind: ScanKind
  requiresAdmin: boolean
  selectedByDefault: boolean
  size: number
  sizeUnknown?: boolean
  fileCount: number
  folderCount: number
  minFileAgeDays?: number
  modifiedAt?: string
  reason?: string
  classification?: TargetClassification
  blockingApps?: BlockingApp[]
  history?: TargetHistory
  status: 'ready' | 'missing' | 'denied' | 'protected' | 'error'
}

export interface ScanOptions {
  includeSafe: boolean
  includeApps: boolean
  includeDevelopment: boolean
  includeGames: boolean
  includeOrphans: boolean
  includeSystem: boolean
  minOrphanAgeDays: number
}

export interface ScanSummary {
  targets: ScanTarget[]
  totalSize: number
  totalFiles: number
  scannedAt: string
  partial: boolean
  warnings: string[]
}

export interface CleanRequest {
  targetIds: string[]
  confirmation: string
}

export interface CleanResultItem {
  id: string
  freedBytes: number
  skippedFiles: number
  blockedBy?: BlockingApp[]
  success: boolean
  error?: string
}

export interface CloseAppsResult {
  closed: string[]
  stillRunning: string[]
}

export interface CleanResult {
  items: CleanResultItem[]
  totalFreed: number
  completedAt: string
}

export interface AppInfo {
  version: string
  platform: string
  osRelease: string
  isAdmin: boolean
}

export interface CleanerApi {
  getAppInfo: () => Promise<AppInfo>
  scan: (options: ScanOptions) => Promise<ScanSummary>
  clean: (request: CleanRequest) => Promise<CleanResult>
  closeApps: (processIds: number[]) => Promise<CloseAppsResult>
  openPath: (path: string) => Promise<string>
  openStorageSettings: () => Promise<void>
  onScanProgress: (listener: (progress: number) => void) => () => void
}
