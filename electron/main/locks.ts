import { execFile, execFileSync } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { BlockingApp, CloseAppsResult } from '../../src/types'
import { normalizeAppName, queryPowerShell } from './registry'

export interface ProcessRecord {
  Name?: string
  ExecutablePath?: string
  ProcessId?: number
}

const execFileAsync = promisify(execFile)

// Path parts that say nothing about the owning application.
const genericSegments = new Set([
  'appdata',
  'cache',
  'cachedata',
  'cachestorage',
  'codecache',
  'common',
  'data',
  'default',
  'gpucache',
  'local',
  'locallow',
  'logs',
  'profiles',
  'programdata',
  'programfiles',
  'roaming',
  'scriptcache',
  'serviceworker',
  'shadercache',
  'steamapps',
  'system32',
  'temp',
  'tmp',
  'userdata',
  'users',
  'windows',
])

export function getRunningProcesses(): ProcessRecord[] {
  return queryPowerShell<ProcessRecord>(
    'Get-CimInstance Win32_Process | Select-Object Name,ExecutablePath,ProcessId | ConvertTo-Json -Compress',
  )
}

function pathTokens(candidate: string): Set<string> {
  const tokens = new Set<string>()
  for (const segment of candidate.split(/[\\/]+/)) {
    const token = normalizeAppName(segment.replace(/\.(exe|lnk|url)$/i, ''))
    if (token.length >= 4 && !genericSegments.has(token)) tokens.add(token)
  }
  return tokens
}

/**
 * Reports applications that are running right now and belong to the given paths.
 * A match is either an explicitly declared owner process of the target or a
 * running executable whose name appears inside the target path. This is an
 * association, not a proof that a specific file handle is held.
 */
export function matchBlockingApps(
  processes: ProcessRecord[],
  paths: string[],
  owners: string[] = [],
): BlockingApp[] {
  const ownerNames = new Set(owners.map((owner) => owner.toLocaleLowerCase('en-US')))
  const targetTokens = new Set<string>()
  for (const candidate of paths) {
    for (const token of pathTokens(candidate)) targetTokens.add(token)
  }

  const found = new Map<string, BlockingApp>()
  for (const record of processes) {
    const name = record.Name
    const processId = record.ProcessId
    if (!name || !processId) continue

    const lowerName = name.toLocaleLowerCase('en-US')
    const nameToken = normalizeAppName(name.replace(/\.exe$/i, ''))
    const executableToken = record.ExecutablePath
      ? normalizeAppName(path.basename(path.dirname(record.ExecutablePath)))
      : ''

    const isOwner = ownerNames.has(lowerName)
    const matchesPath = (nameToken.length >= 4 && targetTokens.has(nameToken))
      || (executableToken.length >= 4 && targetTokens.has(executableToken))
    if (!isOwner && !matchesPath) continue

    const existing = found.get(lowerName)
    if (existing) {
      if (!existing.processIds.includes(processId)) existing.processIds.push(processId)
      continue
    }
    found.set(lowerName, {
      name,
      executablePath: record.ExecutablePath ?? undefined,
      processIds: [processId],
    })
  }

  return [...found.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function parseTasklistPid(output: string, processId: number): boolean {
  return new RegExp(`"\\s*${processId}\\s*"`).test(output)
}

function runningProcessIds(): string {
  try {
    return execFileSync('tasklist.exe', ['/NH', '/FO', 'CSV'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch {
    return ''
  }
}

/**
 * Asks the given processes to close. Nothing is forced, so an application can
 * still show a save prompt or refuse to quit.
 */
export async function closeApps(processIds: number[]): Promise<CloseAppsResult> {
  const result: CloseAppsResult = { closed: [], stillRunning: [] }
  const unique = [...new Set(processIds)].filter((processId) => Number.isInteger(processId) && processId > 4)
  if (!unique.length) return result

  const args = unique.flatMap((processId) => ['/PID', String(processId)])
  try {
    await execFileAsync('taskkill.exe', args, { windowsHide: true, timeout: 30_000 })
  } catch {
    // A refused close request is reported through the running check below.
  }

  await new Promise((resolve) => setTimeout(resolve, 2_500))
  const running = runningProcessIds()
  for (const processId of unique) {
    if (running && parseTasklistPid(running, processId)) result.stillRunning.push(String(processId))
    else result.closed.push(String(processId))
  }
  return result
}
