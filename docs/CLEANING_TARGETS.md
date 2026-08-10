# Windows Bereinigungsziele

Stand: 3. August 2026

## Grundsatz

Windows und Anwendungen unterscheiden zwischen kurzlebigen Dateien, neu erstellbaren Caches und dauerhaftem Anwendungszustand. Nur die ersten beiden Gruppen sind allgemeine Bereinigungsziele. Microsoft beschreibt die Speicheroptimierung für Windows 10 und Windows 11 als unterstützten Weg für temporäre Dateien, Papierkorb und lokal verfügbare Cloud Inhalte.

Quellen:

- [Microsoft Support: Speicheroptimierung verwalten](https://support.microsoft.com/en-US/Windows/Experience/Storage-FileManagement/manage-drive-space-with-storage-sense)
- [Microsoft Support: Speicherplatz in Windows freigeben](https://support.microsoft.com/en-us/windows/free-up-drive-space-in-windows-85529ccb-c365-490d-b548-831022bc9b32)
- [Microsoft Learn: Speicheroptimierung konfigurieren](https://learn.microsoft.com/en-us/windows/configuration/storage/storage-sense)

## Automatisch auswählbare Ziele

| Bereich | Typischer Pfad | Verhalten |
| --- | --- | --- |
| Benutzer Temp | `%TEMP%` | Inhalt wird gescannt. Gesperrte Dateien werden übersprungen. |
| Absturzabbilder | `%LOCALAPPDATA%\CrashDumps` | Diagnoseabbilder können nach eigener Prüfung gelöscht werden. |
| DirectX Shadercache | `%LOCALAPPDATA%\D3DSCache` | Grafikdaten werden bei Bedarf neu erzeugt. |
| Windows Fehlerberichte | `%LOCALAPPDATA%\Microsoft\Windows\WER` | Gesammelte Berichte und Warteschlangen. |
| Miniaturansichten | `%LOCALAPPDATA%\Microsoft\Windows\Explorer` | Nur Dateien mit `thumbcache` oder `iconcache` und der Endung `.db`. |

Microsoft dokumentiert `%LOCALAPPDATA%` als benutzerspezifischen Ordner und `%APPDATA%` als Roaming Ordner. Diese Ordner selbst sind keine Bereinigungsziele.

Quelle: [Microsoft Learn: Windows Known Folder IDs](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)

## Mindestalter für Dateien

Einzelne Ziele löschen nur Dateien ab einem Mindestalter. Damit bleiben Arbeitsdateien laufender Installationsprogramme und aktiver Anwendungen unberührt.

| Ziel | Mindestalter |
| --- | --- |
| Benutzer Temp | 1 Tag |
| Windows Temp | 1 Tag |
| Setup und Wartungsprotokolle | 7 Tage |
| Diagnoseablaufverfolgungen | 7 Tage |

Neuere Dateien werden weder in der Größe gezählt noch gelöscht. Ordner, die danach noch Dateien enthalten, bleiben bestehen.

## Ziele mit Prüfung

| Bereich | Typischer Pfad | Risiko |
| --- | --- | --- |
| Browsercache je Profil | `...\User Data\<Profil>\Cache\Cache_Data`, `Code Cache`, `GPUCache`, `ShaderCache`, `Service Worker\CacheStorage` | Der Browser sollte geschlossen sein. |
| Browser Shadercache | `...\User Data\ShaderCache`, `GrShaderCache`, `GraphiteDawnCache` | Profilübergreifend. |
| Firefox Cache je Profil | `%LOCALAPPDATA%\Mozilla\Firefox\Profiles\<Profil>\cache2` | Der Browser sollte geschlossen sein. |
| Discord Cache | `%APPDATA%\discord\Cache` | Discord sollte geschlossen sein. |
| Microsoft Teams Cache | `%LOCALAPPDATA%\Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams` | Teams sollte geschlossen sein. |
| Spotify Cache | `%LOCALAPPDATA%\Spotify\Data` | Heruntergeladene Titel werden neu geladen. |
| Windows Temp | `%WINDIR%\Temp` | Administratorrechte können nötig sein. Aktive Dateien werden übersprungen. |
| Übermittlungsoptimierung | `%ProgramData%\Microsoft\Windows\DeliveryOptimization\Cache` | Erweiterter Bereich. Die Windows Speicheroptimierung bleibt der bevorzugte Weg. |
| Frühere Windows Installation | `%SystemDrive%\Windows.old` | Wird nur bei vorhandenem Ordner gezeigt. Die unterstützte Autoclean Funktion entfernt die Rückkehrmöglichkeit zur vorherigen Windows Version dauerhaft. |
| Windows Komponentenspeicher | `%WINDIR%\WinSxS` | Wird nur gezeigt, wenn DISM eine Bereinigung empfiehlt. Die Bereinigung verwendet `StartComponentCleanup`. |

Erkannt werden die Profile `Default`, `Profile 1` bis `Profile n` sowie `Guest Profile` von Edge, Chrome, Brave, Vivaldi, Opera und Opera GX, dazu alle Firefox Profile. Verlauf, Cookies, Lesezeichen, Passwörter, Sitzungen und `Local Storage` sind keine Ziele.

## Entwickler und Buildcaches

| Bereich | Typischer Pfad |
| --- | --- |
| npm | `%LOCALAPPDATA%\npm-cache` |
| pnpm | `%LOCALAPPDATA%\pnpm\store` |
| Yarn | `%LOCALAPPDATA%\Yarn\Cache` |
| pip | `%LOCALAPPDATA%\pip\Cache` |
| NuGet | `%USERPROFILE%\.nuget\packages`, `%LOCALAPPDATA%\NuGet\v3-cache` |
| Gradle | `%USERPROFILE%\.gradle\caches` |
| Maven | `%USERPROFILE%\.m2\repository` |
| Cargo | `%USERPROFILE%\.cargo\registry` |
| Go | `%LOCALAPPDATA%\go-build` |
| Electron | `%LOCALAPPDATA%\electron-builder\Cache`, `%LOCALAPPDATA%\electron\Cache` |
| Visual Studio Code | `%APPDATA%\Code\Cache`, `CachedData`, `GPUCache`, `logs` |
| Visual Studio | `%LOCALAPPDATA%\Microsoft\VisualStudio\<Instanz>\ComponentModelCache` |
| Unity | `%LOCALAPPDATA%\Unity\cache` |
| Unreal Engine | `%LOCALAPPDATA%\UnrealEngine\Common\DerivedDataCache` |

Alle Inhalte werden beim nächsten Build oder Befehl neu geladen oder neu erzeugt. Diese Ziele sind niemals vorausgewählt, weil der nächste Build danach länger dauert.

## Spiele und Shadercaches

| Bereich | Typischer Pfad |
| --- | --- |
| Steam Shadercache | `<Bibliothek>\steamapps\shadercache` |
| Steam Weboberfläche | `<Steam>\config\htmlcache`, `%LOCALAPPDATA%\Steam\htmlcache` |
| Epic Games Launcher | `%LOCALAPPDATA%\EpicGamesLauncher\Saved\webcache*` |
| Battle.net | `%LOCALAPPDATA%\Battle.net\Cache` |
| EA App | `%LOCALAPPDATA%\Electronic Arts\EA Desktop\cache` |
| GOG Galaxy | `%ProgramData%\GOG.com\Galaxy\webcache` |
| NVIDIA | `%LOCALAPPDATA%\NVIDIA\DXCache`, `GLCache`, `OptixCache` |
| AMD | `%LOCALAPPDATA%\AMD\DxCache`, `DxcCache`, `GLCache`, `VkCache` |
| Intel | `%LOCALAPPDATA%\Intel\ShaderCache` |

Der Steam Pfad stammt aus `HKCU\Software\Valve\Steam\SteamPath`. Weitere Bibliotheken auf anderen Laufwerken werden aus `steamapps\libraryfolders.vdf` gelesen. Installierte Spiele, Spielstände und `steamapps\common` sind keine Ziele.

## Absturzabbilder, Protokolle und Updatereste

| Bereich | Typischer Pfad | Hinweis |
| --- | --- | --- |
| Speicherabbild | `%WINDIR%\MEMORY.DMP` | Kann so groß sein wie der Arbeitsspeicher. |
| Minidumps | `%WINDIR%\Minidump` | Danach ist keine Bluescreen Analyse mehr möglich. |
| Systemweite Fehlerberichte | `%ProgramData%\Microsoft\Windows\WER\ReportQueue`, `ReportArchive` | Ergänzt das Benutzerziel. |
| Setup und Wartungsprotokolle | `%WINDIR%\Panther`, `%WINDIR%\Logs\CBS`, `%WINDIR%\Logs\DISM` | Erst ab 7 Tagen Alter. |
| Reste von Funktionsupdates | `%SystemDrive%\$WinREAgent`, `%SystemDrive%\ESD\Download` | Reste unterbrochener Updates. |
| Diagnoseablaufverfolgungen | `%ProgramData%\Microsoft\Diagnosis\ETLLogs` | Erst ab 7 Tagen Alter. |

Alle Ziele dieser Gruppe sind erweitert und benötigen Administratorrechte.

## Papierkorb

Der Papierkorb jedes festen Laufwerks wird gemessen, aber nicht direkt gelöscht. Die Leerung verwendet die unterstützte Windows Funktion:

```text
Clear-RecycleBin -Force
```

Der Papierkorb enthält vom Benutzer gelöschte Dateien. Das Ziel ist erweitert, niemals vorausgewählt und trägt einen eigenen Warnhinweis. Papierkörbe anderer Benutzerkonten sind nicht lesbar und werden übersprungen.

## Windows Datenträgerbereinigung

Windows verwaltet mehrere Bereiche über eigene Handler. Die Liste steht unter:

```text
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches
```

KeenyWinCleaner bietet nur diese Handler an:

| Handler | Bedeutung |
| --- | --- |
| `Update Cleanup` | Ersetzte Windows Update Dateien |
| `Device Driver Packages` | Von Windows ersetzte Treiberversionen |
| `Windows ESD installation files` | Installationsabbilder für Zurücksetzen und Neuinstallation |
| `Downloaded Program Files` | Alte ActiveX und Java Komponenten |
| `Old ChkDsk Files` | Von der Datenträgerprüfung gerettete Fragmente |
| `RetailDemo Offline Content` | Inhalte des Vorführmodus |

Ablauf einer Bereinigung:

1. Für jeden vorhandenen Handler wird `StateFlags0099` auf `0` gesetzt. Damit kann kein Flag aus einem früheren Lauf aktiv bleiben.
2. Für die ausgewählten Handler wird `StateFlags0099` auf `2` gesetzt.
3. Ein einziger Durchlauf startet mit `cleanmgr.exe /sagerun:99`.
4. Der freigegebene Platz wird über den freien Speicher vor und nach dem Lauf gemessen.

`DownloadsFolder`, `Recycle Bin`, `Previous Installations`, `Temporary Files` und `Delivery Optimization Files` sind bewusst nicht Teil dieser Liste. Für einige dieser Bereiche gibt es eigene Ziele, der Downloads Ordner wird niemals angeboten.

Windows meldet für Handler vorab keine Größe. Ist ein messbarer Ordner bekannt, zeigt die Oberfläche dessen Größe als Schätzung an, andernfalls den Hinweis, dass die Größe unbekannt ist.

`Windows.old` und `WinSxS` werden niemals direkt gelöscht. KeenyWinCleaner verwendet dafür ausschließlich `cleanmgr /autoclean` und DISM. Beide Ziele sind erweitert, benötigen Administratorrechte und sind nicht vorausgewählt.

Quellen:

- [Microsoft Learn: cleanmgr](https://learn.microsoft.com/windows-server/administration/windows-commands/cleanmgr)
- [Microsoft Learn: WinSxS bereinigen](https://learn.microsoft.com/en-ie/windows-hardware/manufacture/desktop/clean-up-the-winsxs-folder)
- [Microsoft Support: Frühere Windows Version löschen](https://support.microsoft.com/en-gb/windows/delete-your-previous-version-of-windows-f8b26680-e083-c710-b757-7567d69dbb74)

## AppData Reste

Geprüft werden nur direkte Unterordner dieser drei Wurzeln:

- `%LOCALAPPDATA%`
- `%APPDATA%`
- `%USERPROFILE%\AppData\LocalLow`

Ein Ordner wird nur als möglicher Rest gezeigt, wenn alle Bedingungen erfüllt sind:

1. Der Ordner ist mindestens 14 Tage alt. Standard sind 45 Tage.
2. Sein Name passt nicht zu einem erkannten installierten Programm.
3. Sein Name passt nicht zu einem installierten Microsoft Store Paket.
4. Sein Name passt nicht zu Name oder Pfad eines laufenden Prozesses.
5. Sein Name passt nicht zu einem Eintrag im systemweiten oder persönlichen Startmenü.
6. Er gehört nicht zur internen Schutzliste von Windows Bereichen.
7. Er ist weder ein symbolischer Link noch eine Verzeichnisverknüpfung.

Die Windows Dokumentation beschreibt Local, LocalCache und Roaming als Speicher für dauerhafte Anwendungsdaten. Deshalb ist eine vollständige automatische Löschung von AppData technisch nicht vertretbar.

Quelle: [Microsoft Learn: ApplicationData](https://learn.microsoft.com/en-us/uwp/api/windows.storage.applicationdata)

Weitere Quellen zur Installationserkennung:

- [Microsoft Learn: Installierte Software über Registrierung prüfen](https://learn.microsoft.com/en-us/powershell/scripting/samples/working-with-software-installations)
- [Microsoft Learn: Installierte Microsoft Store Pakete mit Get-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/get-appxpackage)

## Inhaltsklassifizierung

Jeder mögliche AppData Rest wird zusätzlich lokal untersucht. Die Erkennung bewertet typische Ordnerstrukturen wie Cache, Logs, Saves, Mods, Konfiguration, Entwicklungsordner und ausführbare Dateien. Daraus entstehen zwei getrennte Ergebnisse:

1. Vermuteter Anwendungstyp: Entwicklerwerkzeug, Spiel, Programm oder unbekannt.
2. Vermuteter Dateninhalt: Cache, Protokolle, Einstellungen, Nutzdaten, reguläre Dateien oder gemischte Daten.

Zu beiden Ergebnissen wird eine Konfidenz angezeigt. Zusätzlich zeigt die Oberfläche Größenanteile und die wichtigsten Indizien. Die Analyse liest keine Dateiinhalte. Auch eine hohe Konfidenz beweist nicht, dass ein Ordner sicher gelöscht werden kann.

Microsoft unterscheidet ausdrücklich zwischen temporären Daten, persistentem lokalem Cache, Einstellungen und dauerhaften Nutzdaten. Diese Unterscheidung ist der Grund, warum mögliche Nutzdaten niemals automatisch ausgewählt werden.

Quelle: [Microsoft Learn: ApplicationData](https://learn.microsoft.com/en-us/uwp/api/windows.storage.applicationdata)

## Laufende Anwendungen

Geöffnete Programme sperren einzelne Dateien. Zu jedem Bereich wird deshalb geprüft, ob die zugehörige Anwendung gerade läuft.

Die Zuordnung erfolgt auf zwei Wegen:

1. Bekannte Ziele nennen ihren Besitzerprozess, etwa `chrome.exe` für ein Chrome Profil, `Discord.exe` für den Discord Cache, `steam.exe` für den Steam Shadercache.
2. Für alle übrigen Pfade wird der Name eines laufenden Programms mit dem Zielpfad verglichen. Allgemeine Bestandteile wie `AppData`, `Local`, `Cache` oder `Temp` bleiben dabei außen vor.

Das ist eine Zuordnung, kein Nachweis über ein konkretes Dateihandle. Die Oberfläche sagt deshalb, dass die Anwendung läuft und diesen Bereich verwendet, nicht dass sie eine bestimmte Datei sperrt.

Der Bereinigungsbericht zeigt die zugeordnete Anwendung neben der Zahl der übersprungenen Dateien und bietet einen Knopf zum Beenden. Gesendet wird eine normale Schließen-Anfrage über `taskkill` ohne Erzwingen. Die Anwendung darf nachfragen, ungespeicherte Daten sichern oder das Beenden ablehnen. Anschließend meldet der Bericht, ob sie tatsächlich beendet wurde.

## Bereinigungsverlauf

Jede Bereinigung wird lokal in `cleanup-history.json` im Anwendungsdatenordner festgehalten, mit Zielkennung, Zeitpunkt, Größe vor der Bereinigung und freigegebenen Bytes. Jeder spätere Scan ergänzt eine Beobachtung mit der aktuellen Größe und dem Abstand in Tagen.

Daraus entstehen drei Angaben:

1. Wie lange die letzte Bereinigung her ist.
2. Welcher Anteil der damaligen Größe wieder da ist.
3. Eine mittlere Rückkehr pro Tag über die Beobachtungen des laufenden Zyklus.

Ein Bereich, der innerhalb von sieben Tagen wieder mindestens die Hälfte seiner damaligen Größe erreicht, wird als schnell wiederkehrend markiert.

Gespeichert werden höchstens fünf Bereinigungen und zwölf Beobachtungen je Ziel. Einträge älter als 180 Tage entfallen. Ein fehlgeschlagener Schreibvorgang blockiert niemals eine Bereinigung.

## Bewusst nicht direkt gelöscht

- Downloads
- Persönliche Dokumente, Bilder, Videos und Musik
- OneDrive Dateien
- Papierkorb, dieser wird ausschließlich über `Clear-RecycleBin` geleert
- Windows Update Download Cache, dieser läuft ausschließlich über die Windows Datenträgerbereinigung
- Wiederherstellungspunkte
- Prefetch
- Registry Einträge außerhalb der Handler Flags der Datenträgerbereinigung
- Treiberpakete, diese laufen ausschließlich über die Windows Datenträgerbereinigung
- Browserverlauf, Cookies, Lesezeichen, Passwörter und Sitzungen
- Installierte Spiele, Spielstände und Spielbibliotheken

Diese Bereiche können persönliche Daten oder aktive Windows Komponenten enthalten. KeenyWinCleaner öffnet für unterstützte Systemaufgaben die Windows Speichereinstellungen.
