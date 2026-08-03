import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const UNINSTALL_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
]

function queryValues(key: string): string[] {
  try {
    const output = execFileSync('reg.exe', ['query', key, '/s'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
    })

    return output
      .split(/\r?\n/)
      .map((line) => line.match(/^\s+(DisplayName|Publisher|InstallLocation|DisplayIcon)\s+REG_\w+\s+(.+)$/i)?.[2]?.trim())
      .filter((value): value is string => Boolean(value))
  } catch {
    return []
  }
}

function queryPowerShell<T>(script: string): T[] {
  try {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 25_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    ).trim()
    if (!output) return []
    const parsed = JSON.parse(output) as T | T[]
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

export function normalizeAppName(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(inc|llc|ltd|gmbh|corporation|corp|company|software|application|app|version|x64|x86)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
}

const ignoredPathTokens = new Set([
  'appdata',
  'applications',
  'bin',
  'commonfiles',
  'local',
  'locallow',
  'programfiles',
  'programfilesx86',
  'programs',
  'roaming',
  'users',
  'windows',
])

function addValueTokens(tokens: Set<string>, value: string): void {
  const normalized = normalizeAppName(value)
  if (normalized.length >= 4 && !ignoredPathTokens.has(normalized)) tokens.add(normalized)

  for (const segment of value.split(/[\\/]/)) {
    const segmentToken = normalizeAppName(segment.replace(/\.(exe|lnk|url)$/i, ''))
    if (segmentToken.length >= 4 && !ignoredPathTokens.has(segmentToken)) tokens.add(segmentToken)
  }
}

interface AppxRecord {
  Name?: string
  PackageFamilyName?: string
  InstallLocation?: string
  PublisherId?: string
}

function getAppxTokens(): Set<string> {
  const records = queryPowerShell<AppxRecord>(
    'Get-AppxPackage | Select-Object Name,PackageFamilyName,InstallLocation,PublisherId | ConvertTo-Json -Compress',
  )
  const tokens = new Set<string>()
  for (const record of records) {
    for (const value of Object.values(record)) {
      if (typeof value === 'string') addValueTokens(tokens, value)
    }
  }
  return tokens
}

function getStartMenuTokens(): Set<string> {
  const roots = [
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ]
  const tokens = new Set<string>()

  for (const root of roots) {
    try {
      for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !/\.(lnk|url)$/i.test(entry.name)) continue
        addValueTokens(tokens, entry.name)
      }
    } catch {
      continue
    }
  }
  return tokens
}

export function getInstalledAppTokens(): Set<string> {
  const tokens = new Set<string>()
  for (const key of UNINSTALL_KEYS) {
    for (const value of queryValues(key)) {
      addValueTokens(tokens, value)
    }
  }
  for (const token of getAppxTokens()) tokens.add(token)
  for (const token of getStartMenuTokens()) tokens.add(token)
  return tokens
}

export function getRunningProcessTokens(): Set<string> {
  interface ProcessRecord {
    Name?: string
    ExecutablePath?: string
  }
  const records = queryPowerShell<ProcessRecord>(
    'Get-CimInstance Win32_Process | Select-Object Name,ExecutablePath | ConvertTo-Json -Compress',
  )
  const tokens = new Set<string>()
  for (const record of records) {
    if (record.Name) addValueTokens(tokens, record.Name)
    if (record.ExecutablePath) addValueTokens(tokens, record.ExecutablePath)
  }
  return tokens
}

export function isProbablyInstalled(folderName: string, knownTokens: Set<string>): boolean {
  const candidate = normalizeAppName(folderName)
  if (candidate.length < 4) return true

  for (const token of knownTokens) {
    if (token.includes(candidate) || candidate.includes(token)) return true
  }
  return false
}
