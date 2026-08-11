import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  AppWindow,
  ArrowRight,
  Blocks,
  Brush,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Database,
  FileClock,
  Files,
  FileStack,
  FolderOpen,
  FolderSearch,
  Gamepad2,
  HardDrive,
  History,
  Info,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Moon,
  PackageOpen,
  Radar,
  Recycle,
  RefreshCw,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from './i18n'
import { cn } from './lib/utils'
import type {
  AppInfo,
  BlockingApp,
  CleanResult,
  Language,
  RiskLevel,
  ScanOptions,
  ScanSummary,
  ScanTarget,
  TargetCategory,
  TargetHistory,
} from './types'

type ThemeName = 'dark' | 'light'
type SelectionGroup = 'all' | 'safe' | 'review' | 'advanced'

interface CleanedTargetInfo {
  name: string
  history?: TargetHistory
}

const initialOptions: ScanOptions = {
  includeSafe: true,
  includeApps: true,
  includeDevelopment: true,
  includeGames: true,
  includeOrphans: true,
  includeSystem: false,
  minOrphanAgeDays: 45,
}

const riskFilters: RiskLevel[] = ['safe', 'review', 'advanced']
const selectionGroups: SelectionGroup[] = ['all', 'safe', 'review', 'advanced']
const categoryOrder: TargetCategory[] = [
  'temporary',
  'cache',
  'reports',
  'browser',
  'apps',
  'development',
  'games',
  'logs',
  'system',
  'recycle',
  'leftovers',
]

const categoryIcons: Record<TargetCategory, LucideIcon> = {
  temporary: Clock3,
  cache: RefreshCw,
  reports: FileClock,
  browser: Search,
  apps: AppWindow,
  development: Code2,
  games: Gamepad2,
  logs: ScrollText,
  system: Settings2,
  recycle: Recycle,
  leftovers: FolderSearch,
}

function formatBytes(bytes: number, language: Language): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const locale = language === 'de' ? 'de-DE' : 'en-US'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value)} ${units[exponent]}`
}

function formatDate(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function matchesFilter(target: ScanTarget, filter: string): boolean {
  if (filter === 'all') return true
  const [kind, value] = filter.split(':')
  return kind === 'risk' ? target.risk === value : target.category === value
}

function isSelectable(target: ScanTarget): boolean {
  return target.status === 'ready' && (target.size > 0 || Boolean(target.sizeUnknown))
}

function riskIcon(risk: RiskLevel): ReactNode {
  if (risk === 'safe') return <ShieldCheck />
  if (risk === 'review') return <Search />
  return <AlertTriangle />
}

function applicationIcon(target: ScanTarget): LucideIcon {
  const type = target.classification?.applicationType
  if (type === 'development') return Code2
  if (type === 'game') return Gamepad2
  if (type === 'system') return Settings2
  if (type === 'application') return AppWindow
  return CircleHelp
}

function contentIcon(target: ScanTarget): LucideIcon {
  const type = target.classification?.contentType
  if (type === 'cache') return RefreshCw
  if (type === 'logs') return ScrollText
  if (type === 'settings') return SlidersHorizontal
  if (type === 'savedData') return Database
  if (type === 'rollback') return History
  if (type === 'updates') return PackageOpen
  if (type === 'mixed') return Blocks
  return Files
}

function RiskBadge({ risk, label }: { risk: RiskLevel; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
        risk === 'safe' && 'border-safe/25 bg-safe/10 text-safe',
        risk === 'review' && 'border-review/25 bg-review/10 text-review',
        risk === 'advanced' && 'border-advanced/25 bg-advanced/10 text-advanced',
      )}
    >
      {label}
    </Badge>
  )
}

function MetricCard({ icon: Icon, label, value, accent }: {
  icon: LucideIcon
  label: string
  value: string
  accent: 'primary' | 'review' | 'advanced' | 'neutral'
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/85 shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn(
          'grid size-10 place-items-center rounded-xl border',
          accent === 'primary' && 'border-primary/20 bg-primary/10 text-primary',
          accent === 'review' && 'border-review/20 bg-review/10 text-review',
          accent === 'advanced' && 'border-advanced/20 bg-advanced/10 text-advanced',
          accent === 'neutral' && 'border-border bg-muted text-muted-foreground',
        )}>
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ScanOption({ checked, icon: Icon, title, description, tone, onChange }: {
  checked: boolean
  icon: LucideIcon
  title: string
  description: string
  tone: 'safe' | 'review' | 'advanced' | 'system'
  onChange: (checked: boolean) => void
}) {
  return (
    <Label className={cn(
      'group flex cursor-pointer items-center gap-3 rounded-xl border bg-background/45 p-3.5 transition-colors',
      checked ? 'border-primary/35 bg-primary/[0.045]' : 'border-border/75 hover:border-border hover:bg-muted/35',
    )}>
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg border',
        tone === 'safe' && 'border-safe/20 bg-safe/10 text-safe',
        tone === 'review' && 'border-review/20 bg-review/10 text-review',
        tone === 'advanced' && 'border-advanced/20 bg-advanced/10 text-advanced',
        tone === 'system' && 'border-border bg-muted text-muted-foreground',
      )}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-medium text-foreground">{title}</strong>
        <small className="mt-0.5 block text-xs leading-4 text-muted-foreground">{description}</small>
      </span>
    </Label>
  )
}

export default function App() {
  const { language, setLanguage, t } = useI18n()
  const [theme, setThemeState] = useState<ThemeName>(() => {
    return localStorage.getItem('keeny-theme') === 'keenyLight' ? 'light' : 'dark'
  })
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [scanResult, setScanResult] = useState<ScanSummary | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState('all')
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [reportDialog, setReportDialog] = useState(false)
  const [cleanResult, setCleanResult] = useState<CleanResult | null>(null)
  const [closingApp, setClosingApp] = useState('')
  const [toast, setToast] = useState('')
  const [cleanedTargets, setCleanedTargets] = useState<Map<string, CleanedTargetInfo>>(new Map())
  const [options, setOptions] = useState<ScanOptions>(initialOptions)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('keeny-theme', theme === 'dark' ? 'keenyDark' : 'keenyLight')
  }, [theme])

  useEffect(() => {
    void window.cleaner.getAppInfo().then(setAppInfo)
    return window.cleaner.onScanProgress(setScanProgress)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const filteredTargets = useMemo(() => {
    return (scanResult?.targets ?? []).filter((target) => matchesFilter(target, activeFilter))
  }, [scanResult, activeFilter])

  const categoryFilters = useMemo(() => {
    const targets = scanResult?.targets ?? []
    return categoryOrder.filter((category) => targets.some((target) => target.category === category))
  }, [scanResult])

  const selectedTargets = useMemo(() => {
    return (scanResult?.targets ?? []).filter((target) => selectedIds.has(target.id))
  }, [scanResult, selectedIds])

  const selectedSize = useMemo(() => {
    return selectedTargets.reduce((sum, target) => sum + target.size, 0)
  }, [selectedTargets])

  const hasAdvancedSelection = selectedTargets.some((target) => target.risk === 'advanced')

  const targetName = (target: ScanTarget): string => {
    const name = target.id.startsWith('orphan:') ? target.nameKey : t(target.nameKey)
    return target.nameSuffix ? `${name} · ${target.nameSuffix}` : name
  }

  const targetSize = (target: ScanTarget): string => {
    return target.sizeUnknown ? t('results.sizeUnknown') : formatBytes(target.size, language)
  }

  const ageHint = (target: ScanTarget): string => {
    if (!target.minFileAgeDays) return ''
    return target.minFileAgeDays === 1
      ? t('results.ageFilterSingle')
      : t('results.ageFilter', { days: target.minFileAgeDays })
  }

  const filterCount = (filter: string): number => {
    return (scanResult?.targets ?? []).filter((target) => matchesFilter(target, filter)).length
  }

  const filterLabel = (filter: string): string => {
    if (filter === 'all') return t('results.all')
    const [kind, value] = filter.split(':')
    return kind === 'risk' ? t(`results.${value}`) : t(`category.${value}`)
  }

  const targetsForGroup = (group: SelectionGroup): ScanTarget[] => {
    return filteredTargets.filter((target) => isSelectable(target) && (group === 'all' || target.risk === group))
  }

  const availableGroups = selectionGroups.filter((group) => targetsForGroup(group).length > 0)

  const isGroupSelected = (group: SelectionGroup): boolean => {
    const targets = targetsForGroup(group)
    return targets.length > 0 && targets.every((target) => selectedIds.has(target.id))
  }

  const groupLabel = (group: SelectionGroup): string => {
    if (group === 'all') return activeFilter === 'all' ? t('results.selectAll') : t('results.selectVisible')
    if (group === 'safe') return t('results.selectSafe')
    if (group === 'review') return t('results.selectReview')
    return t('results.selectAdvanced')
  }

  const toggleTarget = (target: ScanTarget) => {
    if (!isSelectable(target)) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(target.id)) next.delete(target.id)
      else next.add(target.id)
      return next
    })
  }

  const toggleGroup = (group: SelectionGroup) => {
    const targets = targetsForGroup(group)
    setSelectedIds((current) => {
      const next = new Set(current)
      const remove = targets.length > 0 && targets.every((target) => next.has(target.id))
      for (const target of targets) {
        if (remove) next.delete(target.id)
        else next.add(target.id)
      }
      return next
    })
  }

  const scan = async () => {
    setIsScanning(true)
    setScanProgress(0)
    setSelectedIds(new Set())
    setActiveFilter('all')
    try {
      const result = await window.cleaner.scan({ ...options })
      setScanResult(result)
      setSelectedIds(new Set(
        result.targets
          .filter((target) => target.risk === 'safe' && isSelectable(target))
          .map((target) => target.id),
      ))
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error))
    } finally {
      setIsScanning(false)
    }
  }

  const clean = async () => {
    if (confirmation !== 'CLEAN') return
    setIsCleaning(true)
    const targetIds = [...selectedIds]
    setCleanedTargets(new Map(
      selectedTargets.map((target) => [target.id, { name: targetName(target), history: target.history }]),
    ))
    try {
      const result = await window.cleaner.clean({ targetIds, confirmation })
      setCleanResult(result)
      setConfirmDialog(false)
      setConfirmation('')
      setReportDialog(true)
      await scan()
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error))
    } finally {
      setIsCleaning(false)
    }
  }

  const reportItems = useMemo(() => {
    return (cleanResult?.items ?? []).map((item) => ({
      ...item,
      name: cleanedTargets.get(item.id)?.name ?? item.id,
      history: cleanedTargets.get(item.id)?.history,
    }))
  }, [cleanResult, cleanedTargets])

  const blockedItems = reportItems.filter((item) => item.blockedBy?.length)

  const closeApp = async (app: BlockingApp) => {
    setClosingApp(app.name)
    try {
      const result = await window.cleaner.closeApps(app.processIds)
      setToast(result.stillRunning.length
        ? t('report.closeFailed', { name: app.name })
        : t('report.closed', { name: app.name }))
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error))
    } finally {
      setClosingApp('')
    }
  }

  const retryBlocked = () => {
    const ids = new Set(blockedItems.map((item) => item.id))
    setSelectedIds(new Set(
      (scanResult?.targets ?? [])
        .filter((target) => ids.has(target.id) && isSelectable(target))
        .map((target) => target.id),
    ))
    setReportDialog(false)
    if (ids.size) setConfirmDialog(true)
  }

  const historyLine = (history: TargetHistory | undefined): string => {
    if (!history) return ''
    const days = Math.round(history.daysSinceCleanup)
    const share = Math.round(history.refillShare * 100)
    if (history.daysSinceCleanup < 1) return t('history.cleanedToday', { share })
    return history.refillsQuickly
      ? t('history.refillsQuickly', { days, share })
      : t('history.lastCleaned', { days, share })
  }

  const blockingAppsLine = (target: ScanTarget): string => {
    const apps = target.blockingApps ?? []
    const names = apps.map((app) => app.name).join(', ')
    return apps.length === 1 ? t('results.appRunning', { apps: names }) : t('results.appsRunning', { apps: names })
  }

  const breakdownText = (target: ScanTarget): string => {
    const items = target.classification?.breakdown ?? []
    if (!items.length) return ''
    const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0)
    const totalFiles = items.reduce((sum, item) => sum + item.files, 0)
    return items.filter((item) => {
      const share = totalBytes > 0 ? item.bytes / totalBytes : item.files / Math.max(1, totalFiles)
      return share >= 0.005
    }).slice(0, 3).map((item) => {
      const share = totalBytes > 0 ? item.bytes / totalBytes : item.files / Math.max(1, totalFiles)
      return `${t(`classification.breakdown.${item.type}`)} ${Math.round(share * 100)} %`
    }).join(', ')
  }

  const navItems = [
    { href: '#overview', label: t('nav.overview'), icon: LayoutDashboard },
    { href: '#cleaner', label: t('nav.cleaner'), icon: Sparkles },
    { href: '#results', label: t('nav.leftovers'), icon: Search },
    { href: '#storage', label: t('nav.system'), icon: HardDrive },
  ]

  const scanOptions = [
    { key: 'includeSafe' as const, icon: ShieldCheck, title: t('scan.safe'), description: t('scan.safeHint'), tone: 'safe' as const },
    { key: 'includeApps' as const, icon: AppWindow, title: t('scan.apps'), description: t('scan.appsHint'), tone: 'review' as const },
    { key: 'includeDevelopment' as const, icon: Code2, title: t('scan.development'), description: t('scan.developmentHint'), tone: 'review' as const },
    { key: 'includeGames' as const, icon: Gamepad2, title: t('scan.games'), description: t('scan.gamesHint'), tone: 'review' as const },
    { key: 'includeOrphans' as const, icon: FolderSearch, title: t('scan.orphans'), description: t('scan.orphansHint'), tone: 'advanced' as const },
    { key: 'includeSystem' as const, icon: Settings2, title: t('scan.system'), description: t('scan.systemHint'), tone: 'system' as const },
  ]

  return (
    <div className="app-background min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[250px] flex-col border-r border-border/75 bg-card/92 p-4 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_28px_color-mix(in_oklch,var(--primary)_22%,transparent)]">
            <Brush className="size-5" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Keeny</div>
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Win Cleaner</div>
          </div>
        </div>

        <Separator className="my-5" />

        <nav className="space-y-1">
          <p className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</p>
          {navItems.map(({ href, label, icon: Icon }, index) => (
            <Button key={href} asChild variant="ghost" className={cn(
              'h-10 w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground',
              index === 0 && 'bg-accent text-accent-foreground',
            )}>
              <a href={href}>
                <Icon className="size-4" />
                {label}
              </a>
            </Button>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <Card className="border-border/70 bg-muted/35 shadow-none">
            <CardContent className="flex items-center gap-2.5 p-3">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium">{t('app.windows')}</p>
                <p className="truncate text-[10px] text-muted-foreground">{appInfo ? `Build ${appInfo.osRelease}` : 'Detecting system'}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex rounded-lg border bg-background/50 p-1">
              {(['de', 'en'] as Language[]).map((item) => (
                <Button
                  key={item}
                  variant={language === item ? 'secondary' : 'ghost'}
                  size="xs"
                  className="h-7 flex-1 uppercase"
                  onClick={() => setLanguage(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <div className="flex rounded-lg border bg-background/50 p-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={theme === 'dark' ? 'secondary' : 'ghost'} size="icon-sm" className="h-7 flex-1" onClick={() => setThemeState('dark')}>
                    <Moon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{language === 'de' ? 'Dunkles Theme' : 'Dark theme'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={theme === 'light' ? 'secondary' : 'ghost'} size="icon-sm" className="h-7 flex-1" onClick={() => setThemeState('light')}>
                    <Sun />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{language === 'de' ? 'Helles Theme' : 'Light theme'}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </aside>

      <main className="ml-[250px] min-h-screen pb-32">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/65 bg-background/82 px-7 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="size-3.5 text-primary" />
            <span>{t('dashboard.ready')}</span>
            <span className="text-border">/</span>
            <span className={appInfo?.isAdmin ? 'text-primary' : ''}>
              {t('dashboard.admin')}: {appInfo?.isAdmin ? t('dashboard.adminYes') : t('dashboard.adminNo')}
            </span>
          </div>
          <Badge variant="outline" className="rounded-md bg-card font-mono text-[10px] text-muted-foreground">
            v{appInfo?.version ?? '0.2.0'}
          </Badge>
        </header>

        <div className="mx-auto max-w-[1280px] space-y-5 p-7">
          <Card id="overview" className="metric-grid relative overflow-hidden border-border/70 bg-card/80 shadow-none">
            <CardContent className="relative flex min-h-[220px] items-center justify-between p-8">
              <div className="max-w-2xl">
                <Badge variant="outline" className="mb-5 gap-1.5 rounded-md border-primary/20 bg-primary/8 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                  <Zap className="size-3" />
                  {t('dashboard.eyebrow')}
                </Badge>
                <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground">
                  {t('dashboard.title')}
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{t('dashboard.subtitle')}</p>
              </div>
              <div className="relative mr-7 grid size-28 place-items-center rounded-[2rem] border border-primary/20 bg-primary/8 text-primary">
                <div className="absolute inset-3 rounded-2xl border border-primary/15" />
                <Brush className="relative size-11" strokeWidth={1.5} />
                <span className="absolute -right-2 -top-2 grid size-8 place-items-center rounded-full border border-border bg-card text-primary shadow-sm">
                  <Sparkles className="size-3.5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <section className="grid grid-cols-4 gap-3">
            <MetricCard icon={Database} label={t('dashboard.scanned')} value={formatBytes(scanResult?.totalSize ?? 0, language)} accent="primary" />
            <MetricCard icon={FileStack} label={t('dashboard.files')} value={new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-US').format(scanResult?.totalFiles ?? 0)} accent="review" />
            <MetricCard icon={CheckCircle2} label={t('dashboard.selected')} value={formatBytes(selectedSize, language)} accent="advanced" />
            <MetricCard icon={Clock3} label={t('dashboard.lastScan')} value={scanResult ? formatDate(scanResult.scannedAt, language) : t('dashboard.never')} accent="neutral" />
          </section>

          <section id="cleaner" className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
            <Card className="scan-glow border-border/75 bg-card/88 shadow-none">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="secondary" className="h-5 rounded-md px-1.5 font-mono text-[9px]">01</Badge>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scan setup</span>
                  </div>
                  <CardTitle className="text-xl tracking-tight">{t('scan.title')}</CardTitle>
                </div>
                <div className="grid size-10 place-items-center rounded-xl border bg-muted/45 text-muted-foreground">
                  <SlidersHorizontal className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {scanOptions.map((item) => (
                    <ScanOption
                      key={item.key}
                      checked={options[item.key]}
                      icon={item.icon}
                      title={item.title}
                      description={item.description}
                      tone={item.tone}
                      onChange={(checked) => setOptions((current) => ({ ...current, [item.key]: checked }))}
                    />
                  ))}
                </div>

                {options.includeOrphans && (
                  <div className="rounded-xl border bg-muted/25 p-4">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{t('scan.orphanAge')}</span>
                      <Badge variant="outline" className="rounded-md font-mono text-[10px]">{options.minOrphanAgeDays} {t('scan.days')}</Badge>
                    </div>
                    <Slider
                      value={[options.minOrphanAgeDays]}
                      min={14}
                      max={180}
                      step={1}
                      onValueChange={([value]) => setOptions((current) => ({ ...current, minOrphanAgeDays: value }))}
                    />
                  </div>
                )}

                <Button className="h-11 w-full gap-2 text-sm" disabled={isCleaning || isScanning} onClick={() => void scan()}>
                  {isScanning ? <LoaderCircle className="animate-spin" /> : <Radar />}
                  {isScanning ? t('scan.scanning') : scanResult ? t('scan.again') : t('scan.start')}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-border/75 bg-card/88 shadow-none">
                <CardHeader className="pb-3">
                  <div className="mb-3 grid size-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <ShieldCheck className="size-5" />
                  </div>
                  <CardTitle className="text-base">{t('dashboard.ready')}</CardTitle>
                  <CardDescription className="text-xs leading-5">{t('dashboard.readyText')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Separator className="mb-3" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('dashboard.admin')}</span>
                    <Badge variant={appInfo?.isAdmin ? 'secondary' : 'outline'} className={cn('rounded-md text-[10px]', appInfo?.isAdmin && 'bg-primary/10 text-primary')}>
                      {appInfo?.isAdmin ? t('dashboard.adminYes') : t('dashboard.adminNo')}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card id="storage" className="border-border/75 bg-card/88 shadow-none">
                <CardContent className="p-5">
                  <div className="mb-3 grid size-10 place-items-center rounded-xl border bg-muted text-muted-foreground">
                    <HardDrive className="size-4" />
                  </div>
                  <h3 className="text-sm font-semibold">{t('storage.title')}</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{t('storage.text')}</p>
                  <Button variant="link" className="mt-2 h-auto gap-1 p-0 text-xs" onClick={() => void window.cleaner.openStorageSettings()}>
                    {t('storage.action')}
                    <ChevronRight />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>

          {isScanning && (
            <Card className="fade-up border-primary/20 bg-card shadow-none">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{t('scan.scanning')}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t('scan.progress')}</p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-primary">{scanProgress} %</span>
                </div>
                <Progress value={scanProgress} className="h-1.5" />
              </CardContent>
            </Card>
          )}

          {scanResult && !isScanning && (
            <Card id="results" className="fade-up border-border/75 bg-card/92 shadow-none">
              <CardHeader className="flex-row items-start justify-between space-y-0 border-b border-border/70 pb-5">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="secondary" className="h-5 rounded-md px-1.5 font-mono text-[9px]">02</Badge>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Review</span>
                  </div>
                  <CardTitle className="text-xl tracking-tight">{t('results.title')}</CardTitle>
                  <CardDescription className="mt-1 text-xs">{t('results.subtitle')}</CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedIds(new Set())}>
                  <X />
                  {t('results.clear')}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="space-y-2">
                  {scanResult.warnings.includes('orphan-detection-is-heuristic') && (
                    <Alert className="border-review/20 bg-review/[0.045] text-review">
                      <Info />
                      <AlertDescription className="text-xs text-muted-foreground">{t('results.heuristic')}</AlertDescription>
                    </Alert>
                  )}
                  {scanResult.warnings.includes('size-unknown-for-windows-handlers') && (
                    <Alert>
                      <CircleHelp />
                      <AlertDescription className="text-xs text-muted-foreground">{t('results.unknownSize')}</AlertDescription>
                    </Alert>
                  )}
                  {scanResult.warnings.includes('applications-are-running') && (
                    <Alert className="border-advanced/20 bg-advanced/[0.045] text-advanced">
                      <AppWindow />
                      <AlertDescription className="text-xs text-muted-foreground">{t('results.applicationsRunning')}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border bg-muted/20 p-1.5">
                  <Button variant={activeFilter === 'all' ? 'secondary' : 'ghost'} size="sm" className="shrink-0 gap-1.5" onClick={() => setActiveFilter('all')}>
                    <ListFilter />
                    {t('results.all')}
                    <span className="font-mono text-[10px] text-muted-foreground">{filterCount('all')}</span>
                  </Button>
                  <Separator orientation="vertical" className="mx-1 h-5" />
                  {riskFilters.map((risk) => (
                    <Button key={risk} variant={activeFilter === `risk:${risk}` ? 'secondary' : 'ghost'} size="sm" className="shrink-0 gap-1.5" onClick={() => setActiveFilter(`risk:${risk}`)}>
                      {riskIcon(risk)}
                      {filterLabel(`risk:${risk}`)}
                      <span className="font-mono text-[10px] text-muted-foreground">{filterCount(`risk:${risk}`)}</span>
                    </Button>
                  ))}
                  {categoryFilters.length > 0 && <Separator orientation="vertical" className="mx-1 h-5" />}
                  {categoryFilters.map((category) => {
                    const Icon = categoryIcons[category]
                    return (
                      <Button key={category} variant={activeFilter === `category:${category}` ? 'secondary' : 'ghost'} size="sm" className="shrink-0 gap-1.5" onClick={() => setActiveFilter(`category:${category}`)}>
                        <Icon />
                        {filterLabel(`category:${category}`)}
                        <span className="font-mono text-[10px] text-muted-foreground">{filterCount(`category:${category}`)}</span>
                      </Button>
                    )
                  })}
                </div>

                {availableGroups.length > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-dashed bg-muted/15 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <CheckCircle2 className="size-4 text-primary" />
                      {t('results.selectGroups')}
                    </div>
                    <div className="flex gap-1.5">
                      {availableGroups.map((group) => (
                        <Button key={group} variant={isGroupSelected(group) ? 'secondary' : 'outline'} size="sm" className={cn('gap-1.5', isGroupSelected(group) && 'text-primary')} onClick={() => toggleGroup(group)}>
                          {isGroupSelected(group) ? <Check /> : <span className="size-3.5 rounded border" />}
                          {groupLabel(group)}
                          <span className="font-mono text-[10px] text-muted-foreground">{targetsForGroup(group).length}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {filteredTargets.length > 0 ? (
                  <div className="space-y-2">
                    {filteredTargets.map((target) => {
                      const selected = selectedIds.has(target.id)
                      const selectable = isSelectable(target)
                      const CategoryIcon = categoryIcons[target.category]
                      const ApplicationIcon = applicationIcon(target)
                      const ContentIcon = contentIcon(target)
                      return (
                        <Card
                          key={target.id}
                          className={cn(
                            'cursor-pointer border-border/70 bg-background/35 shadow-none transition-colors',
                            selected && 'border-primary/35 bg-primary/[0.035]',
                            selectable ? 'hover:border-border hover:bg-muted/25' : 'cursor-default opacity-55',
                          )}
                          onClick={() => toggleTarget(target)}
                        >
                          <CardContent className="grid grid-cols-[24px_38px_minmax(0,1fr)_110px] gap-3 p-3.5">
                            <div className="pt-2" onClick={(event) => event.stopPropagation()}>
                              <Checkbox checked={selected} disabled={!selectable} aria-label={targetName(target)} onCheckedChange={() => toggleTarget(target)} />
                            </div>
                            <div className={cn(
                              'mt-0.5 grid size-9 place-items-center rounded-lg border',
                              target.risk === 'safe' && 'border-safe/20 bg-safe/10 text-safe',
                              target.risk === 'review' && 'border-review/20 bg-review/10 text-review',
                              target.risk === 'advanced' && 'border-advanced/20 bg-advanced/10 text-advanced',
                            )}>
                              <CategoryIcon className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold tracking-tight">{targetName(target)}</h3>
                                <RiskBadge risk={target.risk} label={t(`risk.${target.risk}`)} />
                                {target.status === 'denied' && <Badge variant="destructive" className="h-5 rounded-md text-[10px]">{t('results.denied')}</Badge>}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(target.descriptionKey)}</p>

                              <div className="mt-2 space-y-1">
                                {target.reason && (
                                  <p className="flex items-center gap-1.5 text-[11px] text-advanced"><TriangleAlert className="size-3.5" />{t(`reason.${target.reason}`)}</p>
                                )}
                                {ageHint(target) && (
                                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="size-3.5" />{ageHint(target)}</p>
                                )}
                                {target.blockingApps?.length ? (
                                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-advanced"><AppWindow className="size-3.5" />{blockingAppsLine(target)}</p>
                                ) : null}
                                {target.history && (
                                  <p className={cn('flex items-center gap-1.5 text-[11px] text-muted-foreground', target.history.refillsQuickly && 'text-advanced')}>
                                    {target.history.refillsQuickly ? <RefreshCw className="size-3.5" /> : <History className="size-3.5" />}
                                    {historyLine(target.history)}
                                  </p>
                                )}
                              </div>

                              {target.classification && (
                                <div className="mt-2.5 rounded-lg border bg-muted/20 p-2.5">
                                  <div className="flex flex-wrap gap-1.5">
                                    <Badge variant="outline" className="gap-1 rounded-md bg-background/50 text-[10px] font-medium">
                                      <ApplicationIcon className="size-3" />
                                      {t(`classification.application.${target.classification.applicationType}`)}
                                      <span className="text-muted-foreground">· {t(`classification.confidence.${target.classification.applicationConfidence}`)}</span>
                                    </Badge>
                                    <Badge variant="outline" className="gap-1 rounded-md bg-background/50 text-[10px] font-medium">
                                      <ContentIcon className="size-3" />
                                      {t(`classification.content.${target.classification.contentType}`)}
                                      <span className="text-muted-foreground">· {t(`classification.confidence.${target.classification.contentConfidence}`)}</span>
                                    </Badge>
                                  </div>
                                  {breakdownText(target) && <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{t('classification.distribution')}: {breakdownText(target)}</p>}
                                  {target.classification.evidence.length > 0 && (
                                    <p className="text-[10px] leading-4 text-muted-foreground">{t('classification.evidenceLabel')}: {target.classification.evidence.map((item) => t(`classification.evidence.${item}`)).join(', ')}</p>
                                  )}
                                </div>
                              )}

                              <Button variant="ghost" size="sm" className="mt-2 h-7 max-w-full gap-1.5 px-1.5 font-mono text-[10px] text-muted-foreground" title={target.path} onClick={(event) => { event.stopPropagation(); void window.cleaner.openPath(target.path) }}>
                                <FolderOpen className="size-3.5" />
                                <span className="truncate">{target.path}</span>
                                <ArrowRight className="size-3" />
                              </Button>
                            </div>
                            <div className="pt-1 text-right">
                              <p className={cn('text-sm font-semibold', target.sizeUnknown && 'text-muted-foreground')}>{targetSize(target)}</p>
                              {!target.sizeUnknown && (
                                <div className="mt-1 space-y-0.5 font-mono text-[9px] text-muted-foreground">
                                  <p>{t('results.files', { count: target.fileCount })}</p>
                                  <p>{t('results.folders', { count: target.folderCount })}</p>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center rounded-xl border border-dashed bg-muted/15 text-center">
                    <div>
                      <CheckCircle2 className="mx-auto size-9 text-primary" strokeWidth={1.5} />
                      <p className="mt-3 text-sm text-muted-foreground">{t('results.empty')}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-[270px] right-5 z-40 flex items-center justify-between rounded-2xl border border-primary/20 bg-card/92 p-3 pl-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><CheckCircle2 className="size-4" /></div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{selectedIds.size} {t('dashboard.selected')}</p>
              <p className="text-base font-semibold">{formatBytes(selectedSize, language)}</p>
            </div>
          </div>
          <Button size="lg" className="gap-2 px-5" onClick={() => setConfirmDialog(true)}>
            <Trash2 />
            {t('clean.action', { size: formatBytes(selectedSize, language) })}
            <ArrowRight />
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDialog} onOpenChange={(open) => { setConfirmDialog(open); if (!open) setConfirmation('') }}>
        <AlertDialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <div className="p-5">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive"><Trash2 /></AlertDialogMedia>
              <AlertDialogTitle>{t('clean.title')}</AlertDialogTitle>
              <AlertDialogDescription>{t('clean.subtitle')}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
                <span className="text-xs text-muted-foreground">{t('clean.summary', { count: selectedIds.size, size: formatBytes(selectedSize, language) })}</span>
                <strong className="text-lg">{formatBytes(selectedSize, language)}</strong>
              </div>
              {hasAdvancedSelection && (
                <Alert className="border-advanced/25 bg-advanced/[0.06] text-advanced">
                  <AlertTriangle />
                  <AlertDescription className="text-xs leading-5 text-muted-foreground">{t('clean.advancedWarning')}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="confirmation" className="text-xs">{t('clean.label')}</Label>
                <Input id="confirmation" value={confirmation} autoComplete="off" placeholder="CLEAN" className="font-mono tracking-widest" onChange={(event) => setConfirmation(event.target.value)} />
              </div>
            </div>
          </div>
          <AlertDialogFooter className="px-5 py-4">
            <AlertDialogCancel>{t('clean.cancel')}</AlertDialogCancel>
            <Button disabled={confirmation !== 'CLEAN' || isCleaning} className="gap-2" onClick={() => void clean()}>
              {isCleaning ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {t('clean.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={reportDialog} onOpenChange={setReportDialog}>
        <DialogContent className="max-h-[84vh] overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 py-5">
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><CheckCircle2 className="size-5" /></div>
            <DialogTitle>{t('report.title')}</DialogTitle>
            <DialogDescription>{t('report.subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="px-6">
            <div className="flex items-center justify-between rounded-xl border bg-muted/25 p-4">
              <span className="text-xs text-muted-foreground">{t('report.freed')}</span>
              <strong className="text-2xl tracking-tight text-primary">{formatBytes(cleanResult?.totalFreed ?? 0, language)}</strong>
            </div>
          </div>
          <ScrollArea className="max-h-[46vh] px-6">
            <div className="space-y-2 py-1">
              {reportItems.map((item) => (
                <Card key={item.id} className="border-border/70 bg-muted/20 shadow-none">
                  <CardContent className="p-3.5">
                    <div className="flex items-center gap-2">
                      {item.success ? <CheckCircle2 className="size-4 text-primary" /> : <AlertCircle className="size-4 text-destructive" />}
                      <strong className="min-w-0 flex-1 truncate text-xs">{item.name}</strong>
                      <span className="font-mono text-xs font-semibold">{formatBytes(item.freedBytes, language)}</span>
                    </div>
                    {item.error && <p className="mt-2 text-[11px] text-destructive">{item.error}</p>}
                    {item.skippedFiles > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{t('report.skipped', { count: item.skippedFiles })}</p>}
                    {item.blockedBy?.length ? (
                      <div className="mt-3 rounded-lg border border-advanced/20 bg-advanced/[0.04] p-2.5">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-advanced">{t('report.blockedBy')}</p>
                        <div className="space-y-1.5">
                          {item.blockedBy.map((app) => (
                            <div key={app.name} className="flex items-center gap-2 rounded-md bg-background/60 p-2">
                              <AppWindow className="size-3.5 text-muted-foreground" />
                              <span className="flex-1 text-xs">{app.name}</span>
                              <Badge variant="outline" className="rounded-md font-mono text-[9px]">{app.processIds.length}</Badge>
                              <Button size="xs" variant="outline" disabled={closingApp === app.name} onClick={() => void closeApp(app)}>
                                {closingApp === app.name && <LoaderCircle className="animate-spin" />}
                                {t('report.close')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {item.history?.refillsQuickly && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-advanced">
                        <RefreshCw className="size-3.5" />
                        {t('report.refillHint', { days: Math.round(item.history.daysSinceCleanup), share: Math.round(item.history.refillShare * 100) })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
          <div className="px-6 text-xs text-muted-foreground">
            {blockedItems.length ? t('report.closeHint') : t('report.nothingSkipped')}
          </div>
          <DialogFooter className="border-t bg-muted/25 px-6 py-4">
            {blockedItems.length > 0 && <Button variant="outline" onClick={retryBlocked}>{t('report.retry')}</Button>}
            <Button onClick={() => setReportDialog(false)}>{t('report.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <Alert className="fixed bottom-5 right-5 z-[70] w-auto max-w-md border-border bg-popover pr-12 text-popover-foreground shadow-xl">
          <Info />
          <AlertDescription className="text-xs">{toast}</AlertDescription>
          <Button variant="ghost" size="icon-xs" className="absolute right-2 top-2" onClick={() => setToast('')}><X /></Button>
        </Alert>
      )}
    </div>
  )
}
