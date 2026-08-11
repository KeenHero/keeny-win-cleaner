# KeenyWinCleaner

![Windows 10 and 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows&logoColor=white)
![Version](https://img.shields.io/badge/Version-0.2.0-12845f)
![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

KeenyWinCleaner is a careful and transparent cleanup utility for Windows 10 and Windows 11. It finds temporary files, browser caches of every profile, package manager and build caches, game launcher and shader caches, crash dumps and setup logs, previous Windows installations, superseded update components, and possible leftovers from uninstalled applications.

The main principle is simple: the application never deletes anything without permission. Every result includes its path, size, file count, risk level, and additional details. Only explicitly selected and confirmed targets are cleaned.

Two things set it apart from the usual cleanup tool. Nothing is skipped silently: when a file stays behind, the application names the program behind it and offers to ask that program to close. And nothing is counted twice: every cleanup is recorded locally, so the next scan can say how much of an area came back and how fast.

## Table of contents

- [Key features](#key-features)
- [Safety model](#safety-model)
- [Risk levels](#risk-levels)
- [Cleanup targets](#cleanup-targets)
- [Minimum file age](#minimum-file-age)
- [Windows Disk Cleanup handlers](#windows-disk-cleanup-handlers)
- [Blocking applications](#blocking-applications)
- [Cleanup history and refill rate](#cleanup-history-and-refill-rate)
- [AppData leftover detection](#appdata-leftover-detection)
- [Content classification](#content-classification)
- [Windows Update and previous Windows versions](#windows-update-and-previous-windows-versions)
- [Areas that are not cleaned](#areas-that-are-not-cleaned)
- [User interface](#user-interface)
- [Privacy](#privacy)
- [Architecture](#architecture)
- [Development](#development)
- [Tests](#tests)
- [Building Windows packages](#building-windows-packages)
- [Known limitations](#known-limitations)
- [Frequently asked questions](#frequently-asked-questions)
- [Sources](#sources)

## Key features

- Scans known Windows and user temporary locations
- Calculates sizes before anything is selected
- Selects rebuildable low risk data by default
- Provides group selection for All, Safe, Review, and Advanced
- Scans every browser profile of Edge, Chrome, Brave, Vivaldi, Opera, and Firefox
- Scans package manager and build caches of npm, pnpm, Yarn, pip, NuGet, Gradle, Maven, Cargo, and Go
- Scans launcher and shader caches of Steam, Epic, Battle.net, EA, GOG, NVIDIA, AMD, and Intel
- Reads Steam libraries on every drive from the Steam registry key
- Finds crash dumps, setup logs, and feature update leftovers
- Measures the Recycle Bin of every drive and empties it through the Windows function
- Offers selected Windows Disk Cleanup handlers through the supported sagerun interface
- Keeps files below a configured minimum age untouched
- Names the running application behind every skipped file and can ask it to close
- Records every cleanup locally and reports how fast an area fills up again
- Detects possible AppData leftovers in Local, Roaming, and LocalLow
- Compares candidates against several current Windows installation sources
- Locally identifies developer tools, games, and applications
- Classifies content as cache, logs, settings, user data, or regular files
- Shows separate confidence levels for application type and content type
- Shows percentage based content breakdowns and detection evidence
- Detects existing `Windows.old` data
- Analyzes the Windows component store with DISM
- Uses supported Windows Autoclean and DISM cleanup operations
- Protects symbolic links and directory junctions
- Revalidates paths immediately before deletion
- Requires the confirmation text `CLEAN`
- Opens Windows Storage Sense directly
- Supports English and German
- Includes persistent light and dark themes
- Produces installer and portable builds

## Safety model

KeenyWinCleaner treats file cleanup as a security critical operation. A scan never changes files.

The cleanup flow uses several layers of protection:

1. Known targets are defined in the Electron main process.
2. AppData candidates are searched only inside fixed root directories.
3. The scan measures size and structure without reading file contents.
4. Only successfully inspected results receive the `ready` status.
5. The main process stores only targets approved by the latest scan.
6. The user must explicitly select cleanup targets.
7. The final action requires the text `CLEAN`.
8. Path boundaries, file type, and link status are checked again before deletion.
9. Paths outside approved roots are rejected.
10. Symbolic links and directory junctions are never followed.
11. Locked or protected files are skipped and counted in the result.
12. Targets with a minimum age never touch files below that age.
13. The Recycle Bin, previous Windows versions, update files, and driver packages are only handed to the supported Windows functions.
14. Closing an application is a request, never a forced termination, and happens only for the processes listed in the report.
15. Repeating a blocked cleanup reselects the areas but still requires the typed confirmation.

A target ID alone cannot authorize a cleanup. It must come from the current scan and remain approved inside the main process.

## Risk levels

| Level | Meaning | Selected by default |
| --- | --- | --- |
| Safe | Temporary or rebuildable data with limited risk | Yes |
| Review | Application, browser, developer, or game cache. The related application should be closed | No |
| Advanced | AppData candidates, Recycle Bin, and system areas with possible data loss | No |

Available results can also be selected or cleared as a group by risk level.

## Cleanup targets

### Safe targets

| Area | Path | Behavior |
| --- | --- | --- |
| User temporary files | `%TEMP%` | Contents are removed. Locked files are skipped |
| Crash dumps | `%LOCALAPPDATA%\CrashDumps` | Diagnostic dumps from crashed applications |
| DirectX shader cache | `%LOCALAPPDATA%\D3DSCache` | Rebuildable graphics data |
| Windows error reports | `%LOCALAPPDATA%\Microsoft\Windows\WER` | Error reports and diagnostic queues |
| Thumbnails | `%LOCALAPPDATA%\Microsoft\Windows\Explorer` | Only `thumbcache` and `iconcache` databases |

### Review targets

| Area | Path | Note |
| --- | --- | --- |
| Browser cache per profile | `...\User Data\<profile>\Cache\Cache_Data`, `Code Cache`, `GPUCache`, `ShaderCache`, `Service Worker\CacheStorage` | Close the browser first |
| Browser shader cache | `...\User Data\ShaderCache`, `GrShaderCache`, `GraphiteDawnCache` | Shared across all profiles |
| Firefox cache per profile | `%LOCALAPPDATA%\Mozilla\Firefox\Profiles\<profile>\cache2` | Close the browser first |
| Discord cache | `%APPDATA%\discord\Cache` | Close Discord first |
| Microsoft Teams cache | `%LOCALAPPDATA%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache` | Close Teams first |
| Spotify cache | `%LOCALAPPDATA%\Spotify\Data` | Downloads are fetched again |

### Developer and build caches

| Area | Path |
| --- | --- |
| npm | `%LOCALAPPDATA%\npm-cache` |
| pnpm | `%LOCALAPPDATA%\pnpm\store` |
| Yarn | `%LOCALAPPDATA%\Yarn\Cache` |
| pip | `%LOCALAPPDATA%\pip\Cache` |
| NuGet | `%USERPROFILE%\.nuget\packages` |
| Gradle | `%USERPROFILE%\.gradle\caches` |
| Maven | `%USERPROFILE%\.m2\repository` |
| Cargo | `%USERPROFILE%\.cargo\registry` |
| Go | `%LOCALAPPDATA%\go-build` |
| Electron | `%LOCALAPPDATA%\electron-builder\Cache` |
| Visual Studio Code | `%APPDATA%\Code\Cache` and related folders |
| Visual Studio | `%LOCALAPPDATA%\Microsoft\VisualStudio\<instance>\ComponentModelCache` |
| Unity | `%LOCALAPPDATA%\Unity\cache` |
| Unreal Engine | `%LOCALAPPDATA%\UnrealEngine\Common\DerivedDataCache` |

### Game and shader caches

| Area | Path |
| --- | --- |
| Steam shader cache | `<library>\steamapps\shadercache` on every configured drive |
| Steam web interface | `<Steam>\config\htmlcache` |
| Epic Games Launcher | `%LOCALAPPDATA%\EpicGamesLauncher\Saved\webcache*` |
| Battle.net | `%LOCALAPPDATA%\Battle.net\Cache` |
| EA app | `%LOCALAPPDATA%\Electronic Arts\EA Desktop\cache` |
| GOG Galaxy | `%ProgramData%\GOG.com\Galaxy\webcache` |
| NVIDIA | `%LOCALAPPDATA%\NVIDIA\DXCache`, `GLCache`, `OptixCache` |
| AMD | `%LOCALAPPDATA%\AMD\DxCache`, `DxcCache`, `GLCache`, `VkCache` |
| Intel | `%LOCALAPPDATA%\Intel\ShaderCache` |

Installed games, game saves, and `steamapps\common` are never targets.

### Advanced system targets

| Area | Path or tool | Administrator | Behavior |
| --- | --- | --- | --- |
| Windows Temp | `%WINDIR%\Temp` | Yes | Contents are checked and removed individually |
| Delivery Optimization | `%ProgramData%\Microsoft\Windows\DeliveryOptimization\Cache` | Yes | Downloaded update cache |
| Memory dump | `%WINDIR%\MEMORY.DMP` | Yes | Single file, can be as large as installed memory |
| Stop error minidumps | `%WINDIR%\Minidump` | Yes | Removes later crash analysis |
| System wide error reports | `%ProgramData%\Microsoft\Windows\WER\ReportQueue` and `ReportArchive` | Yes | Diagnostic queues |
| Setup and servicing logs | `%WINDIR%\Panther`, `%WINDIR%\Logs\CBS`, `%WINDIR%\Logs\DISM` | Yes | Only files older than seven days |
| Feature update leftovers | `%SystemDrive%\$WinREAgent`, `%SystemDrive%\ESD\Download` | Yes | Leftovers of interrupted updates |
| Diagnostic traces | `%ProgramData%\Microsoft\Diagnosis\ETLLogs` | Yes | Only files older than seven days |
| Recycle Bin | `$Recycle.Bin` on every drive | No | Emptied through `Clear-RecycleBin` |
| Windows Disk Cleanup | `cleanmgr /sagerun` handlers | Yes | Update cleanup, driver packages, ESD files, and more |
| Previous Windows installation | `%SystemDrive%\Windows.old` | Yes | Cleanup through Windows Autoclean |
| Windows component store | DISM analysis of `%WINDIR%\WinSxS` | Yes | Offered only when DISM explicitly recommends cleanup |

A complete technical description is available in [docs/CLEANING_TARGETS.md](docs/CLEANING_TARGETS.md).

## Minimum file age

Some targets only remove files above a minimum age so that files of a running installer or an active application stay untouched. Newer files are neither counted nor deleted, and folders that still hold files are kept.

| Target | Minimum age |
| --- | --- |
| User temporary files | 1 day |
| Windows Temp | 1 day |
| Setup and servicing logs | 7 days |
| Diagnostic traces | 7 days |

## Windows Disk Cleanup handlers

Windows manages several areas through its own handlers, listed under `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches`. KeenyWinCleaner offers `Update Cleanup`, `Device Driver Packages`, `Windows ESD installation files`, `Downloaded Program Files`, `Old ChkDsk Files`, and `RetailDemo Offline Content`.

A cleanup run resets `StateFlags0099` to `0` for every handler on the system, sets it to `2` for the selected handlers, and then starts a single `cleanmgr.exe /sagerun:99` pass. Freed space is measured from the free disk space before and after the run.

`DownloadsFolder`, `Recycle Bin`, `Previous Installations`, and `Delivery Optimization Files` are deliberately excluded from this list. Windows reports no size for handlers in advance. Where a measurable folder is known, its size is shown as an estimate, otherwise the interface states that the size is unknown.

## Blocking applications

Open programs lock individual files, which is the most common reason for an incomplete cleanup. Instead of only counting skipped files, KeenyWinCleaner names the application behind them.

A running application is associated with an area in two ways:

1. Known targets declare their owner process. A Chrome profile cache belongs to `chrome.exe`, the Discord cache to `Discord.exe`, the Steam shader cache to `steam.exe`.
2. For all other paths, the name of a running executable is matched against the path itself. Generic parts such as `AppData`, `Local`, `Cache`, or `Temp` are ignored, so unrelated processes are not reported.

This is an association, not proof that a specific file handle is held. The interface therefore states that the application is running and uses the area, never that it holds a particular lock.

Running applications are shown twice: as a hint on the result row before a cleanup, and in the cleanup report next to the files that were skipped. Each entry offers a close button that sends a regular close request through `taskkill` without the force flag. An application can ask back, save open work, or refuse to quit, and the report says whether it actually closed. After closing, the blocked areas can be reselected in one click, and the typed confirmation is still required.

## Cleanup history and refill rate

Every cleanup is recorded in `cleanup-history.json` inside the application data directory. A record holds the target identifier, the time, the size before the cleanup, and the freed bytes. Each later scan adds an observation with the current size and the days since the cleanup.

From this the application derives:

- how long ago an area was cleaned
- how much of the previous size is back
- a median refill rate per day across the observations of the current cycle

An area that is back to at least half its previous size within seven days is marked as refilling quickly. The result row says so directly, and the cleanup report repeats it for the areas just cleaned.

The point is honesty about what a cleanup is worth. A shader cache or a package manager cache that returns within days is not a permanent gain, and the application says so instead of advertising the same gigabytes again on the next run.

Only the last five cleanups and twelve observations per target are kept, entries older than 180 days are dropped, and a failed write never blocks a cleanup.

## AppData leftover detection

AppData must never be cleared as a whole. Applications store profiles, settings, databases, sessions, game saves, local documents, and authentication data there.

KeenyWinCleaner inspects only direct child directories of these three roots:

- `%LOCALAPPDATA%`
- `%APPDATA%`
- `%USERPROFILE%\AppData\LocalLow`

A folder is shown as a possible leftover only when all of the following conditions are met:

1. The folder is at least 14 days old. The default is 45 days.
2. Its name does not match a detected installed application.
3. Its name does not match an installed Microsoft Store package.
4. Its name does not match the name or executable path of a running process.
5. Its name does not match a personal or system wide Start menu entry.
6. It is not part of the internal Windows protection list.
7. It is neither a symbolic link nor a directory junction.

### Installation sources

Detection combines several local Windows sources:

- `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`
- `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall`
- `HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`
- Display name, publisher, installation location, and display icon
- Installed Microsoft Store and MSIX packages through `Get-AppxPackage`
- Currently running processes through `Win32_Process`
- Names and executable paths of running processes
- Personal and system wide Start menu entries

Names are normalized and compared with AppData folder names. Short and ambiguous names are protected as a precaution.

Important: a missing match does not prove that an application has been uninstalled. Portable programs, unusual installers, game platforms, and manually moved applications can leave incomplete installation traces. AppData candidates are therefore always Advanced and are never selected automatically.

## Content classification

Every possible AppData leftover receives additional local classification data.

### Application type

- Developer tool
- Game
- Application
- Windows system
- Unknown

### Content type

- Cache
- Logs and crash reports
- Settings and configuration
- Possible user data
- Regular files
- Mixed data
- Windows rollback data
- Windows update components
- Unknown

### Analyzed properties

Classification uses metadata only:

- Folder names
- File names
- File extensions
- File sizes
- Size distribution inside the folder
- Common structures such as `Cache`, `Logs`, `Saves`, `Mods`, `node_modules`, `.git`, or `Settings`
- Common executable, source code, and game save formats

File contents are never opened or read. The interface displays separate confidence levels for the application type and the content type. It also shows the strongest evidence and a percentage based content breakdown.

Classification is heuristic. Even high confidence is not permission to delete a folder. Possible user data and mixed folders should always be opened and reviewed manually before cleanup.

## Windows Update and previous Windows versions

### Previous Windows installation

When `%SystemDrive%\Windows.old` exists, an Advanced target is displayed. KeenyWinCleaner does not delete this folder directly. Cleanup uses:

```text
cleanmgr.exe /d C: /autoclean
```

Removing this data permanently removes the option to return to the previous Windows version. The target therefore requires administrator access and is never selected automatically.

### Windows component store

When the system scan is enabled, KeenyWinCleaner analyzes the component store with:

```text
dism.exe /Online /Cleanup-Image /AnalyzeComponentStore /English
```

The target appears only when DISM reports `Component Store Cleanup Recommended: Yes`. Cleanup then uses:

```text
dism.exe /Online /Cleanup-Image /StartComponentCleanup /English
```

`WinSxS` is never deleted directly.

### Windows Update download cache

The contents of `%WINDIR%\SoftwareDistribution\Download` are not deleted directly. This directory is managed by Windows Update services. KeenyWinCleaner measures it only as a size estimate and hands the actual cleanup to the `Update Cleanup` handler of the Windows Disk Cleanup, next to Delivery Optimization, DISM component cleanup, and the official Windows storage interface.

## Areas that are not cleaned

The following areas are deliberately excluded from direct cleanup:

- Downloads
- Documents, pictures, videos, and music
- OneDrive and other cloud files
- Browser history, cookies, bookmarks, passwords, and sessions
- Installed games, game saves, and game libraries
- Recycle Bin through direct file deletion, only `Clear-RecycleBin` is used
- Windows Update download cache through direct file deletion, only Disk Cleanup is used
- Restore points
- Prefetch
- Registry entries outside the Disk Cleanup handler flags
- Driver packages through direct file deletion, only Disk Cleanup is used
- Complete AppData root directories
- `WinSxS` through direct file deletion
- Unknown paths outside fixed target definitions

The application can open Windows Storage Sense for Downloads, Recycle Bin, cloud files, and other Windows managed areas.

## User interface

The interface is designed for fast review and clear control.

- Dashboard with detected size, file count, selected size, and scan time
- Separate scan options for safe targets, application caches, developer caches, game caches, AppData leftovers, and system areas
- Minimum age hint on every target that keeps recent files
- Explicit warning line on targets that remove rollback options, crash analysis, or deleted files
- Clear label when Windows reports no size in advance
- Hint on every target whose application is currently running
- History line stating how long ago an area was cleaned and how much of it is back
- Cleanup report with freed space per area, skipped files, the applications behind them, and a close button
- Configurable minimum age for AppData candidates
- Progress indicator during scans
- Filters for All, the three risk levels, and every category with results, each with a count
- Categories cover temporary files, Windows caches, error reports, browsers, applications, development, games, logs, Windows system, Recycle Bin, and AppData leftovers
- Group selection follows the active filter, so filtering first and selecting afterwards works as one gesture
- Result rows with path, size, file count, and folder count
- Direct folder access for manual review
- Visible classification and confidence information
- Persistent cleanup bar with selected total size
- Additional warning for Advanced targets
- English and German text
- Light and dark themes
- Persistent language and theme selection through `localStorage`

## Privacy

KeenyWinCleaner operates locally.

- No telemetry
- No cloud analysis
- No transmission of file names or paths
- No sign in
- No user account
- No automatic uploads
- No automatic updater
- No downloaded cleanup scripts
- No file content analysis

PowerShell runs locally without loading a profile and is used for three fixed commands only: `Get-AppxPackage` for installed Store packages, `Get-CimInstance Win32_Process` for running processes, and `Clear-RecycleBin` for emptying the Recycle Bin. Windows system tools such as `reg.exe`, `cleanmgr.exe`, `dism.exe`, `tasklist.exe`, and `taskkill.exe` are started as local processes with fixed argument lists. No command line is built from file contents or from data received over a network.

The application writes exactly two things outside the cleanup itself:

- `cleanup-history.json` in the application data directory. It holds target identifiers, timestamps, sizes, and freed bytes. For AppData leftovers the identifier contains the folder name in encoded form. The file never leaves the device, and deleting it only resets the refill statistics.
- The `StateFlags0099` registry values of the Windows Disk Cleanup handlers, and only during a cleanup run that includes such a handler.

Closing an application happens only when the button in the cleanup report is used, applies only to the processes listed there, and never uses the force flag.

The only registry values the application writes are the `StateFlags0099` entries of the Windows Disk Cleanup handlers, and only during a cleanup run that includes such a handler.

## Architecture

### Technology stack

| Area | Technology |
| --- | --- |
| Desktop runtime | Electron 43 |
| User interface | Vue 3 |
| Components | Vuetify 4 |
| Icons | Material Design Icons |
| Language | TypeScript 5 |
| Build system | Vite 8 |
| Tests | Vitest 4 |
| Packaging | electron-builder 26 |

### Process separation

```text
Vue renderer
    |
    | limited preload API
    v
Electron preload
    |
    | validated IPC calls
    v
Electron main process
    |
    + Target definitions and detection
    + Scanner and parallel path measurement
    + Installed application matching
    + Running application detection
    + Content classification
    + Cleanup history and refill rate
    + Approved targets from the latest scan
    + File system cleanup
    + cleanmgr, DISM, and Clear-RecycleBin
```

### Measurement

A target can cover several folders at once. A browser profile, for example, groups nine cache folders into a single result row. Sources are deduplicated case insensitively, so a folder that appears twice under different spellings is measured and removed only once.

Each folder is walked by a pool of twelve workers over a shared queue. Every accumulated value is order independent, so the result does not depend on how the pool schedules work. On a system with large package manager and browser caches this cuts a full scan from roughly three minutes to about one.

Targets with a minimum file age skip newer files during measurement and during cleanup. A folder that still holds skipped files stays in place.

The list of running processes is read once per scan and reused for every target. After a cleanup it is read again, and only when files were actually skipped.

The renderer has no direct Node.js access. The application window uses:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Blocked new windows

The preload bridge exposes only these operations:

- Read application information
- Start a scan
- Receive scan progress
- Clean selected targets
- Ask listed applications to close
- Open a result folder
- Open Windows storage settings

### Project structure

```text
keenandclean/
  electron/
    main/
      classifier.ts     Local content classification
      cleaner.ts        Scanning, measurement, and cleanup
      history.ts        Cleanup history and refill rate
      index.ts          Electron window and IPC handlers
      locks.ts          Running application detection and close requests
      registry.ts       Installed application matching and registry reads
      targets.ts        Cleanup target definitions and detection
    preload/
      index.ts          Limited renderer API
  src/
    App.vue             Main user interface
    i18n.ts             English and German translations
    main.ts             Vue and Vuetify entry point
    styles.scss         Light and dark themes
    types.ts            Shared data types
  tests/
    safety.test.ts      Safety and classification tests
  docs/
    CLEANING_TARGETS.md Technical cleanup target documentation
  package.json          Commands and build configuration
```

## Development

### Requirements

- Windows 10 or Windows 11
- Node.js 20 or newer
- npm
- PowerShell 5.1 or newer
- Administrator access only for advanced system scans and system cleanup

### Installation

```powershell
git clone <YOUR-REPOSITORY-URL>
cd keenandclean
npm install
```

### Development mode

```powershell
npm run dev
```

Vite starts the user interface and opens the Electron application with hot reload.

### Production build

```powershell
npm run build
```

This command first runs the TypeScript checks and then builds the renderer, main process, and preload bundles.

### Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development mode with hot reload |
| `npm test` | Run all tests once |
| `npm run test:watch` | Rerun tests when files change |
| `npm run build` | Check TypeScript and create production bundles |
| `npm run build:win` | Build the application, installer, and portable package |
| `npm run preview` | Preview the built frontend locally |

## Tests

The current test suite covers:

- Path boundaries inside approved roots
- Rejection of similarly named sibling paths
- Protection against path traversal
- Minimum age cutoffs and protection of recent files
- Scan option routing for developer, game, log, recycle, and system targets
- Unique target identifiers across all definitions
- Case insensitive deduplication of measured sources
- Exclusion of personal folders from the Disk Cleanup handler list
- Owner process matching and grouping of process ids
- Rejection of generic path segments during application matching
- Refill share, quick refill flag, and daily refill rate of the history
- Reading a process id back from tasklist output
- Steam library detection from `libraryfolders.vdf`
- Normalization of installed application names
- Installed application matching
- Protection of short and ambiguous names
- Detection of old unmatched folders
- Parsing of DISM size output
- Developer tool detection
- Game and game save detection
- Cache detection
- Mixed content detection
- Protection against weak false classifications
- Prioritization of known game vendors

Run the tests with:

```powershell
npm test
```

## Building Windows packages

```powershell
npm run build:win
```

Artifacts are created in `release`:

```text
release/KeenyWinCleaner-Setup-0.2.0-x64.exe
release/KeenyWinCleaner-Portable-0.2.0-x64.exe
release/win-unpacked/KeenyWinCleaner.exe
```

The NSIS installer allows the user to choose an installation directory and creates Desktop and Start menu shortcuts. The portable build requires no installation.

## Known limitations

- AppData leftover detection is heuristic and can produce false positives or false negatives.
- Portable applications do not always appear in Windows uninstall registry keys.
- Some games and launchers use different names for their installation and AppData folders.
- A running process proves only current use, not ownership of every related data folder.
- Store package information can be incomplete when packages are damaged.
- Administrator access is required for some system paths and DISM operations.
- Locked files can be cleaned only after the related application is closed.
- A reported application is an association through the target path or a declared owner process, not proof that it holds a specific file handle.
- A close request can be refused by the application, and background helpers of the same product may keep running.
- Refill statistics need at least one earlier cleanup, and a cleanup performed outside the application is not part of the record.
- Size information is a snapshot. Applications can change files during or after a scan.
- Autoclean and DISM can report a different amount of freed space than the initial estimate.
- Windows reports no size for Disk Cleanup handlers before a run.
- All selected Disk Cleanup handlers run in one pass, so the freed space cannot be attributed to a single handler and is reported on the first selected entry.
- Freed space of Autoclean, DISM, Disk Cleanup, and the Recycle Bin is measured on the system drive only.
- Emptying the Recycle Bin permanently removes files that were deleted earlier.
- A full scan of large package manager and browser caches can take a minute or more.
- Current Windows packages target x64 systems.

## Frequently asked questions

### Does KeenyWinCleaner delete all of AppData?

No. Deleting all of AppData would destroy active profiles, settings, and personal data. Only old, unmatched direct child folders are displayed as Advanced candidates.

### Are AppData candidates selected automatically?

No. Only Safe targets are selected by default. AppData candidates and system areas must be selected manually and confirmed with `CLEAN`.

### Does high confidence mean that a folder is safe to delete?

No. Confidence describes only how strongly visible metadata matches a classification. It is not proof that an application was uninstalled or that its data is unnecessary.

### Why is an installed application shown as a possible leftover?

Possible causes include a portable application, an unusual installer, a different display name, a process that is not currently running, or a launcher that uses separate folder names. Open and inspect the result folder before deletion.

### Why is an uninstalled application not shown?

The folder may be newer than the configured minimum age, use a protected name, or still match an existing installation signal.

### Why does system cleanup require administrator access?

Windows protects System Temp, Delivery Optimization, `Windows.old`, and the component store. KeenyWinCleaner does not bypass these protections.

### Can a previous Windows version be restored after cleanup?

No. After `Windows.old` is removed through Autoclean, the option to return to the previous Windows version is no longer available.

### Is `WinSxS` deleted directly?

No. KeenyWinCleaner uses only the supported DISM analysis and `StartComponentCleanup` operation.

### Are locked files deleted forcibly?

No. Inaccessible or currently used files are skipped. The cleanup report shows how many files were skipped per area and which application is behind them.

### Does the close button kill my applications?

No. It sends a regular close request without the force flag. The application can ask back, save open work, or refuse to quit, and the report says whether it actually closed. Nothing happens without a click on that button.

### Why does the application say a cache refills quickly?

Because it compares the current size against the size before the last cleanup. Shader caches and package manager caches often return within days. That gain is not permanent, and saying so is more useful than counting the same gigabytes again on every run.

### Can I delete the history?

Yes. Removing `cleanup-history.json` from the application data directory only resets the refill statistics. Nothing else depends on it.

### Are browser passwords or bookmarks removed?

No. Only cache folders of a profile are targets. History, cookies, bookmarks, passwords, sessions, and `Local Storage` are never touched.

### What happens after developer caches are cleaned?

The next build or package command downloads or rebuilds what it needs. Nothing is lost, but the first run afterwards takes longer.

### Are game files or saves deleted?

No. Only launcher caches and shader caches are targets. Shaders are rebuilt by the game, which can cause brief stutter during the first minutes of play.

### Why does the Recycle Bin need confirmation?

It holds files that were deleted by hand and can still be restored. After emptying they are gone for good, so the target is Advanced and never preselected.

### Why does a Disk Cleanup area show no size?

Windows does not report a size for its handlers before a run. Where a matching folder can be measured, its size is shown as an estimate. Otherwise the freed space is measured after the run.

## Sources

Cleanup target selection is based on official Windows documentation:

- [Microsoft Support: Manage Storage Sense](https://support.microsoft.com/en-US/Windows/Experience/Storage-FileManagement/manage-drive-space-with-storage-sense)
- [Microsoft Support: Free up drive space in Windows](https://support.microsoft.com/en-us/windows/free-up-drive-space-in-windows-85529ccb-c365-490d-b548-831022bc9b32)
- [Microsoft Learn: Configure Storage Sense](https://learn.microsoft.com/en-us/windows/configuration/storage/storage-sense)
- [Microsoft Learn: Windows Known Folder IDs](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)
- [Microsoft Learn: ApplicationData](https://learn.microsoft.com/en-us/uwp/api/windows.storage.applicationdata)
- [Microsoft Learn: Working with software installations](https://learn.microsoft.com/en-us/powershell/scripting/samples/working-with-software-installations)
- [Microsoft Learn: Get-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/get-appxpackage)
- [Microsoft Learn: Clear-RecycleBin](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/clear-recyclebin)
- [Microsoft Learn: Win32_Process](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)
- [Microsoft Learn: taskkill](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)
- [Microsoft Learn: tasklist](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tasklist)
- [Microsoft Learn: cleanmgr](https://learn.microsoft.com/windows-server/administration/windows-commands/cleanmgr)
- [Microsoft Learn: Clean up the WinSxS folder](https://learn.microsoft.com/en-ie/windows-hardware/manufacture/desktop/clean-up-the-winsxs-folder)
- [Microsoft Support: Delete a previous version of Windows](https://support.microsoft.com/en-gb/windows/delete-your-previous-version-of-windows-f8b26680-e083-c710-b757-7567d69dbb74)

## License

MIT License. The full text is available in [LICENSE](LICENSE).

## Safety notice

File cleanup can permanently remove data. Always review Advanced results manually and back up important data before performing extensive cleanup. This software is provided without warranty.
