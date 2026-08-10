import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ageCutoff, isPathWithin, parseDismSize, shouldIncludeTarget } from '../electron/main/cleaner'
import { classifyContentSample } from '../electron/main/classifier'
import { isProbablyInstalled, normalizeAppName, parseLibraryFolders } from '../electron/main/registry'
import {
  developerTargets,
  gameTargets,
  getDiskCleanupHandlerKeys,
  standardTargets,
  systemLogTargets,
  targetSources,
  type TargetDefinition,
} from '../electron/main/targets'
import type { ScanOptions } from '../src/types'

describe('path boundary checks', () => {
  const root = path.resolve('C:\\Users\\Example\\AppData\\Local\\Temp')

  it('accepts a path inside an approved root', () => {
    expect(isPathWithin(path.join(root, 'cache', 'file.tmp'), root)).toBe(true)
  })

  it('accepts the approved root itself', () => {
    expect(isPathWithin(root, root)).toBe(true)
  })

  it('rejects sibling paths with a shared prefix', () => {
    expect(isPathWithin(`${root}-backup\\file.tmp`, root)).toBe(false)
  })

  it('rejects parent traversal', () => {
    expect(isPathWithin(path.join(root, '..', 'Secrets'), root)).toBe(false)
  })
})

describe('minimum file age', () => {
  const now = Date.UTC(2026, 7, 10)

  it('returns no cutoff when no age is configured', () => {
    expect(ageCutoff(undefined, now)).toBeUndefined()
    expect(ageCutoff(0, now)).toBeUndefined()
  })

  it('returns a cutoff one day in the past', () => {
    expect(ageCutoff(1, now)).toBe(now - 24 * 60 * 60 * 1000)
  })

  it('protects files that a running installer is still using', () => {
    const cutoff = ageCutoff(1, now) as number
    const recentFile = now - 60 * 60 * 1000
    const oldFile = now - 5 * 24 * 60 * 60 * 1000
    expect(recentFile > cutoff).toBe(true)
    expect(oldFile > cutoff).toBe(false)
  })
})

describe('scan option filtering', () => {
  const options: ScanOptions = {
    includeSafe: false,
    includeApps: false,
    includeDevelopment: true,
    includeGames: false,
    includeOrphans: false,
    includeSystem: false,
    minOrphanAgeDays: 45,
  }

  function target(overrides: Partial<TargetDefinition>): TargetDefinition {
    return {
      id: 'test',
      nameKey: 'test',
      descriptionKey: 'test',
      path: 'C:\\Test',
      category: 'cache',
      risk: 'review',
      kind: 'contents',
      ...overrides,
    }
  }

  it('keeps developer caches out of the app section', () => {
    expect(shouldIncludeTarget(target({ category: 'development' }), options)).toBe(true)
    expect(shouldIncludeTarget(target({ category: 'games' }), options)).toBe(false)
    expect(shouldIncludeTarget(target({ category: 'apps' }), options)).toBe(false)
  })

  it('groups recycle bin, logs and system areas behind the system option', () => {
    for (const category of ['recycle', 'logs', 'system'] as const) {
      expect(shouldIncludeTarget(target({ category }), options)).toBe(false)
      expect(shouldIncludeTarget(target({ category }), { ...options, includeSystem: true })).toBe(true)
    }
  })
})

describe('target definitions', () => {
  const allTargets = [...standardTargets, ...developerTargets, ...gameTargets, ...systemLogTargets]

  it('uses unique identifiers', () => {
    const ids = allTargets.map((definition) => definition.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('falls back to the target path when no sources are defined', () => {
    expect(targetSources({ ...allTargets[0], sources: undefined })).toEqual([allTargets[0].path])
    expect(targetSources({ ...allTargets[0], sources: ['C:\\A', 'C:\\B'] })).toEqual(['C:\\A', 'C:\\B'])
  })

  it('measures a folder only once when a source repeats in a different spelling', () => {
    expect(targetSources({
      ...allTargets[0],
      sources: ['D:\\Steam\\steamapps', 'd:\\steam\\steamapps\\', 'E:\\SteamLibrary\\steamapps'],
    })).toEqual(['D:\\Steam\\steamapps', 'E:\\SteamLibrary\\steamapps'])
  })

  it('requires administrator access for every system log target', () => {
    expect(systemLogTargets.every((definition) => definition.requiresAdmin)).toBe(true)
    expect(systemLogTargets.every((definition) => definition.risk === 'advanced')).toBe(true)
  })

  it('never preselects developer or game caches', () => {
    expect([...developerTargets, ...gameTargets].some((definition) => definition.selectedByDefault)).toBe(false)
  })

  it('keeps personal folders out of the disk cleanup handlers', () => {
    const handlers = getDiskCleanupHandlerKeys()
    expect(handlers).toContain('Update Cleanup')
    expect(handlers).not.toContain('DownloadsFolder')
    expect(handlers).not.toContain('Recycle Bin')
    expect(handlers).not.toContain('Previous Installations')
  })
})

describe('Steam library detection', () => {
  const libraryFile = `"libraryfolders"
{
  "0"
  {
    "path"    "C:\\\\Program Files (x86)\\\\Steam"
  }
  "1"
  {
    "path"    "D:\\\\SteamLibrary"
  }
}`

  it('reads every configured library root', () => {
    expect(parseLibraryFolders(libraryFile)).toEqual([
      'C:\\Program Files (x86)\\Steam',
      'D:\\SteamLibrary',
    ])
  })

  it('returns nothing for an unreadable file', () => {
    expect(parseLibraryFolders('')).toEqual([])
  })
})

describe('installed application matching', () => {
  it('normalizes publisher suffixes and punctuation', () => {
    expect(normalizeAppName('Example Software GmbH (x64)')).toBe('example')
  })

  it('matches an AppData folder to an installed application token', () => {
    expect(isProbablyInstalled('Discord', new Set(['discord']))).toBe(true)
  })

  it('keeps short ambiguous folder names protected', () => {
    expect(isProbablyInstalled('App', new Set())).toBe(true)
  })

  it('marks an old unmatched folder as a possible leftover', () => {
    expect(isProbablyInstalled('AbandonedTool', new Set(['currentbrowser']))).toBe(false)
  })
})

describe('DISM size parsing', () => {
  it('parses decimal gigabytes', () => {
    expect(parseDismSize('1.5 GB')).toBe(1_610_612_736)
  })

  it('parses thousands separated megabytes', () => {
    expect(parseDismSize('1,024 MB')).toBe(1_073_741_824)
  })

  it('rejects unknown values', () => {
    expect(parseDismSize('Not available')).toBe(0)
  })
})

describe('advanced target classification', () => {
  it('recognizes a development tool with mostly cached data', () => {
    const result = classifyContentSample('Visual Studio Code', [
      { path: 'Cache\\index.cache', size: 900 },
      { path: 'User\\settings.json', size: 100 },
    ])
    expect(result.applicationType).toBe('development')
    expect(result.applicationConfidence).toBe('high')
    expect(result.contentType).toBe('cache')
    expect(result.contentConfidence).toBe('high')
  })

  it('recognizes game saves as possible user data', () => {
    const result = classifyContentSample('Steam', [
      { path: 'Saves\\campaign.sav', size: 2_000 },
      { path: 'Screenshots\\match.png', size: 100 },
    ])
    expect(result.applicationType).toBe('game')
    expect(result.contentType).toBe('savedData')
    expect(result.evidence).toContain('gameSaves')
  })

  it('marks balanced content as mixed', () => {
    const result = classifyContentSample('UnknownProduct', [
      { path: 'Cache\\item.cache', size: 500 },
      { path: 'Settings\\profile.json', size: 500 },
    ])
    expect(result.contentType).toBe('mixed')
    expect(result.applicationType).toBe('unknown')
  })

  it('does not classify a single shader cache as a game', () => {
    const result = classifyContentSample('PDF24', [
      { path: 'ShaderCache\\cache.bin', size: 1_000 },
    ])
    expect(result.applicationType).toBe('unknown')
    expect(result.contentType).toBe('cache')
  })

  it('keeps a known game vendor classified as gaming software', () => {
    const result = classifyContentSample('GOG.com', [
      { path: 'Cache\\worker.js', size: 700 },
      { path: 'Tools\\helper.exe', size: 300 },
    ])
    expect(result.applicationType).toBe('game')
    expect(result.applicationConfidence).toBe('high')
  })
})
