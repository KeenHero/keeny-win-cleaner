<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from './i18n'
import type { AppInfo, RiskLevel, ScanOptions, ScanSummary, ScanTarget } from './types'

const { language, t } = useI18n()
const vuetifyTheme = useTheme()
const themeName = ref<'keenyDark' | 'keenyLight'>(
  localStorage.getItem('keeny-theme') === 'keenyLight' ? 'keenyLight' : 'keenyDark',
)

const appInfo = ref<AppInfo | null>(null)
const scanResult = ref<ScanSummary | null>(null)
const isScanning = ref(false)
const isCleaning = ref(false)
const scanProgress = ref(0)
const selectedIds = ref(new Set<string>())
const riskFilter = ref<'all' | RiskLevel>('all')
const confirmDialog = ref(false)
const confirmation = ref('')
const snackbar = ref(false)
const snackbarText = ref('')
const options = ref<ScanOptions>({
  includeSafe: true,
  includeApps: true,
  includeOrphans: true,
  includeSystem: false,
  minOrphanAgeDays: 45,
})

const filteredTargets = computed(() => {
  const targets = scanResult.value?.targets ?? []
  if (riskFilter.value === 'all') return targets
  return targets.filter((target) => target.risk === riskFilter.value)
})

const selectedTargets = computed(() => {
  return (scanResult.value?.targets ?? []).filter((target) => selectedIds.value.has(target.id))
})

const selectedSize = computed(() => selectedTargets.value.reduce((sum, target) => sum + target.size, 0))
const hasAdvancedSelection = computed(() => selectedTargets.value.some((target) => target.risk === 'advanced'))
const selectionGroups = ['all', 'safe', 'review', 'advanced'] as const
type SelectionGroup = typeof selectionGroups[number]

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${new Intl.NumberFormat(language.value, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value)} ${units[exponent]}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(language.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function targetName(target: ScanTarget): string {
  return target.id.startsWith('orphan:') ? target.nameKey : t(target.nameKey)
}

function toggleTarget(target: ScanTarget): void {
  if (target.status !== 'ready' || target.size === 0) return
  const next = new Set(selectedIds.value)
  if (next.has(target.id)) next.delete(target.id)
  else next.add(target.id)
  selectedIds.value = next
}

function selectSafe(): void {
  selectedIds.value = new Set(
    (scanResult.value?.targets ?? [])
      .filter((target) => target.risk === 'safe' && target.status === 'ready' && target.size > 0)
      .map((target) => target.id),
  )
}

function targetsForGroup(group: SelectionGroup): ScanTarget[] {
  return (scanResult.value?.targets ?? []).filter((target) => {
    const selectable = target.status === 'ready' && target.size > 0
    return selectable && (group === 'all' || target.risk === group)
  })
}

function isGroupSelected(group: SelectionGroup): boolean {
  const targets = targetsForGroup(group)
  return targets.length > 0 && targets.every((target) => selectedIds.value.has(target.id))
}

function toggleGroup(group: SelectionGroup): void {
  const targets = targetsForGroup(group)
  const next = new Set(selectedIds.value)
  const remove = targets.length > 0 && targets.every((target) => next.has(target.id))
  for (const target of targets) {
    if (remove) next.delete(target.id)
    else next.add(target.id)
  }
  selectedIds.value = next
}

function groupLabel(group: SelectionGroup): string {
  if (group === 'all') return t('results.selectAll')
  if (group === 'safe') return t('results.selectSafe')
  if (group === 'review') return t('results.selectReview')
  return t('results.selectAdvanced')
}

function setTheme(name: 'keenyDark' | 'keenyLight'): void {
  themeName.value = name
  vuetifyTheme.global.name.value = name
  localStorage.setItem('keeny-theme', name)
}

async function scan(): Promise<void> {
  isScanning.value = true
  scanProgress.value = 0
  selectedIds.value = new Set()
  try {
    scanResult.value = await window.cleaner.scan({ ...options.value })
    selectSafe()
  } catch (error) {
    snackbarText.value = error instanceof Error ? error.message : String(error)
    snackbar.value = true
  } finally {
    isScanning.value = false
  }
}

async function clean(): Promise<void> {
  if (confirmation.value !== 'CLEAN') return
  isCleaning.value = true
  try {
    const result = await window.cleaner.clean({
      targetIds: [...selectedIds.value],
      confirmation: confirmation.value,
    })
    const failed = result.items.filter((item) => !item.success).length
    snackbarText.value = `${t('clean.success', { size: formatBytes(result.totalFreed) })}${failed ? ` ${t('clean.partial')}` : ''}`
    snackbar.value = true
    confirmDialog.value = false
    confirmation.value = ''
    await scan()
  } catch (error) {
    snackbarText.value = error instanceof Error ? error.message : String(error)
    snackbar.value = true
  } finally {
    isCleaning.value = false
  }
}

function riskIcon(risk: RiskLevel): string {
  if (risk === 'safe') return 'mdi-shield-check-outline'
  if (risk === 'review') return 'mdi-eye-outline'
  return 'mdi-alert-outline'
}

function applicationIcon(target: ScanTarget): string {
  const type = target.classification?.applicationType
  if (type === 'development') return 'mdi-code-tags'
  if (type === 'game') return 'mdi-gamepad-variant-outline'
  if (type === 'system') return 'mdi-microsoft-windows'
  if (type === 'application') return 'mdi-application-outline'
  return 'mdi-help-circle-outline'
}

function contentIcon(target: ScanTarget): string {
  const type = target.classification?.contentType
  if (type === 'cache') return 'mdi-cached'
  if (type === 'logs') return 'mdi-text-box-search-outline'
  if (type === 'settings') return 'mdi-tune-variant'
  if (type === 'savedData') return 'mdi-content-save-outline'
  if (type === 'rollback') return 'mdi-backup-restore'
  if (type === 'updates') return 'mdi-update'
  if (type === 'mixed') return 'mdi-shape-outline'
  return 'mdi-file-multiple-outline'
}

function breakdownText(target: ScanTarget): string {
  const items = target.classification?.breakdown ?? []
  if (!items.length) return ''
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0)
  const totalFiles = items.reduce((sum, item) => sum + item.files, 0)
  const visibleItems = items.filter((item) => {
    const share = totalBytes > 0 ? item.bytes / totalBytes : item.files / Math.max(1, totalFiles)
    return share >= 0.005
  }).slice(0, 3)
  return visibleItems.map((item) => {
    const share = totalBytes > 0 ? item.bytes / totalBytes : item.files / Math.max(1, totalFiles)
    return `${t(`classification.breakdown.${item.type}`)} ${Math.round(share * 100)} %`
  }).join(', ')
}

function openStorageSettings(): void {
  void window.cleaner.openStorageSettings()
}

function openFolder(folderPath: string): void {
  void window.cleaner.openPath(folderPath)
}

let stopProgressListener: (() => void) | undefined
onMounted(async () => {
  vuetifyTheme.global.name.value = themeName.value
  appInfo.value = await window.cleaner.getAppInfo()
  stopProgressListener = window.cleaner.onScanProgress((progress) => {
    scanProgress.value = progress
  })
})
onBeforeUnmount(() => stopProgressListener?.())
</script>

<template>
  <v-app>
    <div class="app-shell" :class="{ 'theme-light': themeName === 'keenyLight' }">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">
            <v-icon icon="mdi-broom" size="22" />
          </div>
          <div>
            <div class="brand-name">Keeny</div>
            <div class="brand-product">WIN CLEANER</div>
          </div>
        </div>

        <nav class="nav-list">
          <a class="nav-item active" href="#overview">
            <v-icon icon="mdi-view-dashboard-outline" />
            <span>{{ t('nav.overview') }}</span>
          </a>
          <a class="nav-item" href="#cleaner">
            <v-icon icon="mdi-auto-fix" />
            <span>{{ t('nav.cleaner') }}</span>
          </a>
          <a class="nav-item" href="#results">
            <v-icon icon="mdi-folder-search-outline" />
            <span>{{ t('nav.leftovers') }}</span>
          </a>
          <a class="nav-item" href="#storage">
            <v-icon icon="mdi-harddisk" />
            <span>{{ t('nav.system') }}</span>
          </a>
        </nav>

        <div class="sidebar-spacer" />

        <div class="system-badge">
          <div class="status-pulse" />
          <div>
            <strong>{{ t('app.windows') }}</strong>
            <span v-if="appInfo">Build {{ appInfo.osRelease }}</span>
          </div>
        </div>

        <div class="language-switch" role="group" aria-label="Language">
          <button :class="{ active: language === 'de' }" @click="language = 'de'">DE</button>
          <button :class="{ active: language === 'en' }" @click="language = 'en'">EN</button>
        </div>
        <div class="theme-switch" role="group" aria-label="Theme">
          <button :class="{ active: themeName === 'keenyDark' }" aria-label="Dark theme" @click="setTheme('keenyDark')">
            <v-icon icon="mdi-weather-night" size="17" />
          </button>
          <button :class="{ active: themeName === 'keenyLight' }" aria-label="Light theme" @click="setTheme('keenyLight')">
            <v-icon icon="mdi-white-balance-sunny" size="17" />
          </button>
        </div>
      </aside>

      <main class="main-content">
        <section id="overview" class="hero-section">
          <div class="hero-copy">
            <div class="eyebrow">
              <span />
              {{ t('dashboard.eyebrow') }}
            </div>
            <h1>{{ t('dashboard.title') }}</h1>
            <p>{{ t('dashboard.subtitle') }}</p>
          </div>
          <div class="hero-orbit" aria-hidden="true">
            <div class="orbit orbit-one" />
            <div class="orbit orbit-two" />
            <div class="hero-icon"><v-icon icon="mdi-windows" size="50" /></div>
          </div>
        </section>

        <section class="stats-grid">
          <article class="stat-card mint">
            <div class="stat-icon"><v-icon icon="mdi-database-search-outline" /></div>
            <div>
              <span>{{ t('dashboard.scanned') }}</span>
              <strong>{{ formatBytes(scanResult?.totalSize ?? 0) }}</strong>
            </div>
          </article>
          <article class="stat-card violet">
            <div class="stat-icon"><v-icon icon="mdi-file-multiple-outline" /></div>
            <div>
              <span>{{ t('dashboard.files') }}</span>
              <strong>{{ new Intl.NumberFormat(language).format(scanResult?.totalFiles ?? 0) }}</strong>
            </div>
          </article>
          <article class="stat-card amber">
            <div class="stat-icon"><v-icon icon="mdi-checkbox-marked-circle-outline" /></div>
            <div>
              <span>{{ t('dashboard.selected') }}</span>
              <strong>{{ formatBytes(selectedSize) }}</strong>
            </div>
          </article>
          <article class="stat-card neutral">
            <div class="stat-icon"><v-icon icon="mdi-clock-outline" /></div>
            <div>
              <span>{{ t('dashboard.lastScan') }}</span>
              <strong class="date-value">{{ scanResult ? formatDate(scanResult.scannedAt) : t('dashboard.never') }}</strong>
            </div>
          </article>
        </section>

        <section id="cleaner" class="content-grid">
          <div class="panel scan-panel">
            <div class="panel-heading">
              <div>
                <span class="section-number">01</span>
                <h2>{{ t('scan.title') }}</h2>
              </div>
              <v-icon icon="mdi-tune-variant" />
            </div>

            <div class="option-list">
              <label class="scan-option">
                <v-checkbox v-model="options.includeSafe" color="primary" hide-details />
                <span class="option-icon safe"><v-icon icon="mdi-shield-check-outline" /></span>
                <span class="option-copy"><strong>{{ t('scan.safe') }}</strong><small>{{ t('scan.safeHint') }}</small></span>
              </label>
              <label class="scan-option">
                <v-checkbox v-model="options.includeApps" color="primary" hide-details />
                <span class="option-icon review"><v-icon icon="mdi-application-braces-outline" /></span>
                <span class="option-copy"><strong>{{ t('scan.apps') }}</strong><small>{{ t('scan.appsHint') }}</small></span>
              </label>
              <label class="scan-option">
                <v-checkbox v-model="options.includeOrphans" color="primary" hide-details />
                <span class="option-icon advanced"><v-icon icon="mdi-folder-question-outline" /></span>
                <span class="option-copy"><strong>{{ t('scan.orphans') }}</strong><small>{{ t('scan.orphansHint') }}</small></span>
              </label>
              <label class="scan-option">
                <v-checkbox v-model="options.includeSystem" color="primary" hide-details />
                <span class="option-icon system"><v-icon icon="mdi-cog-outline" /></span>
                <span class="option-copy"><strong>{{ t('scan.system') }}</strong><small>{{ t('scan.systemHint') }}</small></span>
              </label>
            </div>

            <div v-if="options.includeOrphans" class="age-control">
              <span>{{ t('scan.orphanAge') }}</span>
              <v-slider v-model="options.minOrphanAgeDays" :min="14" :max="180" :step="1" color="primary" hide-details />
              <strong>{{ options.minOrphanAgeDays }} {{ t('scan.days') }}</strong>
            </div>

            <v-btn
              class="scan-button"
              color="primary"
              size="large"
              :loading="isScanning"
              :disabled="isCleaning"
              prepend-icon="mdi-radar"
              @click="scan"
            >
              {{ scanResult ? t('scan.again') : t('scan.start') }}
            </v-btn>
          </div>

          <div class="side-stack">
            <article class="panel readiness-card">
              <div class="readiness-visual"><v-icon icon="mdi-check-decagram-outline" size="42" /></div>
              <h3>{{ t('dashboard.ready') }}</h3>
              <p>{{ t('dashboard.readyText') }}</p>
              <div class="admin-line">
                <span>{{ t('dashboard.admin') }}</span>
                <strong :class="appInfo?.isAdmin ? 'positive' : ''">
                  {{ appInfo?.isAdmin ? t('dashboard.adminYes') : t('dashboard.adminNo') }}
                </strong>
              </div>
            </article>

            <article id="storage" class="panel storage-card">
              <div class="storage-icon"><v-icon icon="mdi-microsoft-windows" /></div>
              <div>
                <h3>{{ t('storage.title') }}</h3>
                <p>{{ t('storage.text') }}</p>
                <button class="text-action" @click="openStorageSettings">
                  {{ t('storage.action') }}
                  <v-icon icon="mdi-arrow-right" size="17" />
                </button>
              </div>
            </article>
          </div>
        </section>

        <section v-if="isScanning" class="panel progress-panel">
          <div class="progress-head">
            <div>
              <h3>{{ t('scan.scanning') }}</h3>
              <p>{{ t('scan.progress') }}</p>
            </div>
            <strong>{{ scanProgress }}%</strong>
          </div>
          <v-progress-linear :model-value="scanProgress" color="primary" height="8" rounded />
        </section>

        <section v-if="scanResult && !isScanning" id="results" class="panel results-panel">
          <div class="results-header">
            <div>
              <span class="section-number">02</span>
              <h2>{{ t('results.title') }}</h2>
              <p>{{ t('results.subtitle') }}</p>
            </div>
            <div class="result-actions">
              <v-btn variant="text" size="small" @click="selectedIds = new Set()">{{ t('results.clear') }}</v-btn>
            </div>
          </div>

          <div v-if="scanResult.warnings.length" class="heuristic-note">
            <v-icon icon="mdi-information-outline" />
            <span>{{ t('results.heuristic') }}</span>
          </div>

          <div class="group-selection">
            <span class="group-selection-label">{{ t('results.selectGroups') }}</span>
            <div class="group-selection-actions">
              <button
                v-for="group in selectionGroups"
                :key="group"
                :class="{ active: isGroupSelected(group) }"
                @click="toggleGroup(group)"
              >
                <v-icon :icon="isGroupSelected(group) ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'" size="17" />
                <span>{{ groupLabel(group) }}</span>
                <small>{{ targetsForGroup(group).length }}</small>
              </button>
            </div>
          </div>

          <div class="filter-row">
            <button
              v-for="filter in ['all', 'safe', 'review', 'advanced'] as const"
              :key="filter"
              :class="{ active: riskFilter === filter }"
              @click="riskFilter = filter"
            >
              {{ t(`results.${filter}`) }}
            </button>
          </div>

          <div v-if="filteredTargets.length" class="target-list">
            <article
              v-for="target in filteredTargets"
              :key="target.id"
              class="target-row"
              :class="{ selected: selectedIds.has(target.id), unavailable: target.status !== 'ready' || target.size === 0 }"
              @click="toggleTarget(target)"
            >
              <input
                class="target-checkbox"
                type="checkbox"
                :checked="selectedIds.has(target.id)"
                :disabled="target.status !== 'ready' || target.size === 0"
                :aria-label="targetName(target)"
                @click.stop="toggleTarget(target)"
              />
              <div class="target-risk" :class="target.risk"><v-icon :icon="riskIcon(target.risk)" /></div>
              <div class="target-main">
                <div class="target-title-line">
                  <strong>{{ targetName(target) }}</strong>
                  <span class="risk-pill" :class="target.risk">{{ t(`risk.${target.risk}`) }}</span>
                  <span v-if="target.status === 'denied'" class="denied-pill">{{ t('results.denied') }}</span>
                </div>
                <p>{{ t(target.descriptionKey) }}</p>
                <div v-if="target.classification" class="classification-block">
                  <div class="classification-chips">
                    <span class="classification-chip">
                      <v-icon :icon="applicationIcon(target)" size="13" />
                      {{ t(`classification.application.${target.classification.applicationType}`) }}
                      <small>{{ t(`classification.confidence.${target.classification.applicationConfidence}`) }}</small>
                    </span>
                    <span class="classification-chip">
                      <v-icon :icon="contentIcon(target)" size="13" />
                      {{ t(`classification.content.${target.classification.contentType}`) }}
                      <small>{{ t(`classification.confidence.${target.classification.contentConfidence}`) }}</small>
                    </span>
                  </div>
                  <div v-if="breakdownText(target)" class="classification-detail">
                    {{ t('classification.distribution') }}: {{ breakdownText(target) }}
                  </div>
                  <div v-if="target.classification.evidence.length" class="classification-detail">
                    {{ t('classification.evidenceLabel') }}:
                    {{ target.classification.evidence.map((item) => t(`classification.evidence.${item}`)).join(', ') }}
                  </div>
                </div>
                <button class="path-button" :title="target.path" @click.stop="openFolder(target.path)">
                  <v-icon icon="mdi-folder-outline" size="15" />
                  <span>{{ target.path }}</span>
                  <v-icon icon="mdi-open-in-new" size="14" />
                </button>
              </div>
              <div class="target-meta">
                <strong>{{ formatBytes(target.size) }}</strong>
                <span>{{ t('results.files', { count: target.fileCount }) }}</span>
                <span>{{ t('results.folders', { count: target.folderCount }) }}</span>
              </div>
            </article>
          </div>
          <div v-else class="empty-state">
            <v-icon icon="mdi-check-circle-outline" size="42" />
            <p>{{ t('results.empty') }}</p>
          </div>
        </section>
      </main>

      <div v-if="selectedIds.size" class="clean-bar">
        <div>
          <span>{{ selectedIds.size }} {{ t('dashboard.selected') }}</span>
          <strong>{{ formatBytes(selectedSize) }}</strong>
        </div>
        <v-btn color="primary" size="large" append-icon="mdi-arrow-right" @click="confirmDialog = true">
          {{ t('clean.action', { size: formatBytes(selectedSize) }) }}
        </v-btn>
      </div>
    </div>

    <v-dialog v-model="confirmDialog" width="600">
      <v-card class="confirm-card">
        <div class="confirm-icon"><v-icon icon="mdi-delete-sweep-outline" size="34" /></div>
        <v-card-title>{{ t('clean.title') }}</v-card-title>
        <v-card-subtitle>{{ t('clean.subtitle') }}</v-card-subtitle>
        <v-card-text>
          <div class="confirm-summary">{{ t('clean.summary', { count: selectedIds.size, size: formatBytes(selectedSize) }) }}</div>
          <v-alert v-if="hasAdvancedSelection" type="warning" variant="tonal" density="compact" class="mb-4">
            {{ t('clean.advancedWarning') }}
          </v-alert>
          <v-text-field v-model="confirmation" :label="t('clean.label')" variant="outlined" autocomplete="off" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmDialog = false">{{ t('clean.cancel') }}</v-btn>
          <v-btn color="primary" :disabled="confirmation !== 'CLEAN'" :loading="isCleaning" @click="clean">
            {{ t('clean.confirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" color="surface" :timeout="6000">
      {{ snackbarText }}
      <template #actions><v-btn icon="mdi-close" @click="snackbar = false" /></template>
    </v-snackbar>
  </v-app>
</template>
