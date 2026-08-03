export type Language = 'de' | 'en'
export type RiskLevel = 'safe' | 'review' | 'advanced'
export type ScanKind = 'contents' | 'folder'
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

export interface ScanTarget {
  id: string
  nameKey: string
  descriptionKey: string
  path: string
  category: string
  risk: RiskLevel
  kind: ScanKind
  requiresAdmin: boolean
  selectedByDefault: boolean
  size: number
  fileCount: number
  folderCount: number
  modifiedAt?: string
  reason?: string
  classification?: TargetClassification
  status: 'ready' | 'missing' | 'denied' | 'protected' | 'error'
}

export interface ScanOptions {
  includeSafe: boolean
  includeApps: boolean
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
  success: boolean
  error?: string
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
  openPath: (path: string) => Promise<string>
  openStorageSettings: () => Promise<void>
  onScanProgress: (listener: (progress: number) => void) => () => void
}
