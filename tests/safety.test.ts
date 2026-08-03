import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathWithin, parseDismSize } from '../electron/main/cleaner'
import { classifyContentSample } from '../electron/main/classifier'
import { isProbablyInstalled, normalizeAppName } from '../electron/main/registry'

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
