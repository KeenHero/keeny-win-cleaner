# KeenyWinCleaner

![Windows 10 und 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows&logoColor=white)
![Version](https://img.shields.io/badge/Version-0.1.0-12845f)
![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)
![Lizenz](https://img.shields.io/badge/Lizenz-MIT-blue)

KeenyWinCleaner ist ein vorsichtiges, transparentes Bereinigungswerkzeug für Windows 10 und Windows 11. Es findet temporäre Dateien, neu erstellbare Caches, alte Windows Installationen, ersetzte Update Komponenten und mögliche Reste deinstallierter Anwendungen.

Das wichtigste Prinzip: Die Anwendung löscht niemals ungefragt. Jeder Treffer wird mit Pfad, Größe, Dateianzahl, Risiko und weiteren Hinweisen angezeigt. Nur ausdrücklich ausgewählte und bestätigte Ziele werden bereinigt.

## Inhalt

- [Hauptfunktionen](#hauptfunktionen)
- [Sicherheitsmodell](#sicherheitsmodell)
- [Risikostufen](#risikostufen)
- [Bereinigungsziele](#bereinigungsziele)
- [AppData Resterkennung](#appdata-resterkennung)
- [Inhaltsklassifizierung](#inhaltsklassifizierung)
- [Windows Update und alte Windows Versionen](#windows-update-und-alte-windows-versionen)
- [Nicht bereinigte Bereiche](#nicht-bereinigte-bereiche)
- [Oberfläche](#oberfläche)
- [Datenschutz](#datenschutz)
- [Architektur](#architektur)
- [Entwicklung](#entwicklung)
- [Tests](#tests)
- [Windows Pakete erstellen](#windows-pakete-erstellen)
- [Bekannte Einschränkungen](#bekannte-einschränkungen)
- [Häufige Fragen](#häufige-fragen)
- [Quellen](#quellen)

## Hauptfunktionen

- Scan bekannter temporärer Windows und Benutzerbereiche
- Größenberechnung vor jeder Auswahl
- Sichere Standardauswahl für neu erstellbare Daten
- Sammelauswahl für Alle, Sicher, Prüfen und Erweitert
- App und Browser Cache Prüfung
- Erkennung möglicher AppData Reste in Local, Roaming und LocalLow
- Aktueller Installationsabgleich über mehrere Windows Quellen
- Lokale Erkennung von Entwicklerwerkzeugen, Spielen und Programmen
- Inhaltsanalyse für Cache, Protokolle, Einstellungen, Nutzdaten und reguläre Dateien
- Getrennte Konfidenz für Anwendungstyp und Dateninhalt
- Prozentuale Inhaltsverteilung und sichtbare Erkennungsindizien
- Erkennung vorhandener `Windows.old` Daten
- DISM Analyse des Windows Komponentenspeichers
- Unterstützte Bereinigung über Windows Autoclean und DISM
- Schutz vor symbolischen Links und Verzeichnisverknüpfungen
- Erneute Pfadprüfung unmittelbar vor dem Löschen
- Bestätigung mit dem Text `CLEAN`
- Direkter Zugriff auf die Windows Speicheroptimierung
- Deutsche und englische Oberfläche
- Helles und dunkles Theme mit gespeicherter Auswahl
- Installer und Portable Build

## Sicherheitsmodell

KeenyWinCleaner behandelt Dateibereinigung als sicherheitskritische Aktion. Ein Scan verändert keine Dateien.

Der Ablauf besteht aus mehreren Schutzschichten:

1. Bekannte Ziele werden im Hauptprozess definiert.
2. AppData Kandidaten werden nur unter festgelegten Wurzelverzeichnissen gesucht.
3. Der Scan misst Größe und Inhalt, ohne Dateiinhalte zu lesen.
4. Nur erfolgreich geprüfte Treffer erhalten den Status `ready`.
5. Der Hauptprozess speichert ausschließlich die Ziele des letzten Scans als zulässig.
6. Vor der Bereinigung muss der Nutzer konkrete Ziele auswählen.
7. Für die endgültige Bereinigung muss `CLEAN` eingegeben werden.
8. Vor jedem Löschvorgang werden Pfad, Typ und Linkstatus erneut geprüft.
9. Pfade außerhalb der zugelassenen Wurzeln werden abgelehnt.
10. Symbolische Links und Verzeichnisverknüpfungen werden nicht verfolgt.
11. Gesperrte oder geschützte Dateien werden übersprungen und als Fehler gemeldet.

Eine Ziel-ID allein reicht nicht für eine Bereinigung. Sie muss aus dem aktuellen Scan stammen und im Hauptprozess freigegeben worden sein.

## Risikostufen

| Stufe | Bedeutung | Standardauswahl |
| --- | --- | --- |
| Sicher | Temporäre oder neu erstellbare Daten mit begrenztem Risiko | Ja |
| Prüfen | App oder Browser Cache. Das betroffene Programm sollte geschlossen sein | Nein |
| Erweitert | AppData Kandidaten und Systembereiche mit möglichem Datenverlust | Nein |

Alle verfügbaren Treffer lassen sich zusätzlich gesammelt nach Risikostufe auswählen oder wieder abwählen.

## Bereinigungsziele

### Sichere Ziele

| Bereich | Pfad | Verhalten |
| --- | --- | --- |
| Benutzer Temp | `%TEMP%` | Inhalt wird entfernt. Gesperrte Dateien werden übersprungen |
| Absturzabbilder | `%LOCALAPPDATA%\CrashDumps` | Diagnoseabbilder abgestürzter Anwendungen |
| DirectX Shadercache | `%LOCALAPPDATA%\D3DSCache` | Neu erstellbare Grafikdaten |
| Windows Fehlerberichte | `%LOCALAPPDATA%\Microsoft\Windows\WER` | Fehlerberichte und Warteschlangen |
| Miniaturansichten | `%LOCALAPPDATA%\Microsoft\Windows\Explorer` | Nur `thumbcache` und `iconcache` Datenbanken |

### Ziele mit Prüfung

| Bereich | Pfad | Hinweis |
| --- | --- | --- |
| Microsoft Edge Cache | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache` | Edge vorher schließen |
| Google Chrome Cache | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache` | Chrome vorher schließen |
| Discord Cache | `%APPDATA%\discord\Cache` | Discord vorher schließen |

### Erweiterte Systemziele

| Bereich | Pfad oder Werkzeug | Administrator | Verhalten |
| --- | --- | --- | --- |
| Windows Temp | `%WINDIR%\Temp` | Ja | Inhalt wird einzeln geprüft und entfernt |
| Übermittlungsoptimierung | `%ProgramData%\Microsoft\Windows\DeliveryOptimization\Cache` | Ja | Heruntergeladener Update Cache |
| Frühere Windows Installation | `%SystemDrive%\Windows.old` | Ja | Bereinigung über Windows Autoclean |
| Windows Komponentenspeicher | DISM Analyse von `%WINDIR%\WinSxS` | Ja | Nur bei ausdrücklicher DISM Empfehlung |

Eine vollständige technische Beschreibung steht in [docs/CLEANING_TARGETS.md](docs/CLEANING_TARGETS.md).

## AppData Resterkennung

AppData darf niemals pauschal geleert werden. Anwendungen speichern dort Profile, Einstellungen, Datenbanken, Sitzungen, Spielstände, lokale Dokumente und Anmeldedaten.

KeenyWinCleaner untersucht ausschließlich direkte Unterordner dieser drei Wurzeln:

- `%LOCALAPPDATA%`
- `%APPDATA%`
- `%USERPROFILE%\AppData\LocalLow`

Ein Ordner wird nur als möglicher Rest angezeigt, wenn alle folgenden Bedingungen erfüllt sind:

1. Der Ordner ist mindestens 14 Tage alt. Der Standardwert beträgt 45 Tage.
2. Sein Name passt nicht zu einem erkannten installierten Programm.
3. Sein Name passt nicht zu einem installierten Microsoft Store Paket.
4. Sein Name passt nicht zu Name oder Pfad eines laufenden Prozesses.
5. Sein Name passt nicht zu einem Eintrag im persönlichen oder systemweiten Startmenü.
6. Er gehört nicht zu einem geschützten Windows Bereich.
7. Er ist weder ein symbolischer Link noch eine Verzeichnisverknüpfung.

### Verwendete Installationsquellen

Die Erkennung kombiniert mehrere lokale Windows Quellen:

- `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`
- `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall`
- `HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`
- Anzeigename, Herausgeber, Installationspfad und Programmsymbol
- Installierte Microsoft Store und MSIX Pakete über `Get-AppxPackage`
- Aktuell laufende Prozesse über `Win32_Process`
- Namen und ausführbare Pfade laufender Prozesse
- Persönliche und systemweite Startmenüeinträge

Die Namen werden normalisiert und mit den AppData Ordnernamen verglichen. Kurze und mehrdeutige Namen werden vorsichtshalber geschützt.

Wichtig: Ein fehlender Treffer beweist nicht, dass eine Anwendung deinstalliert wurde. Portable Programme, ungewöhnliche Installer, Spieleplattformen und manuell verschobene Anwendungen können unvollständige Spuren hinterlassen. AppData Kandidaten sind deshalb immer erweitert und nie automatisch ausgewählt.

## Inhaltsklassifizierung

Jeder mögliche AppData Rest erhält zusätzliche lokale Informationen.

### Anwendungstyp

- Entwicklerwerkzeug
- Spiel
- Programm
- Windows System
- Unbekannt

### Dateninhalt

- Cache
- Protokolle und Absturzberichte
- Einstellungen und Konfiguration
- Mögliche Nutzdaten
- Reguläre Dateien
- Gemischte Daten
- Windows Rollback Daten
- Windows Update Komponenten
- Unbekannt

### Analysierte Merkmale

Die Klassifizierung verwendet ausschließlich Metadaten:

- Ordnernamen
- Dateinamen
- Dateiendungen
- Dateigrößen
- Größenverteilung innerhalb des Ordners
- Typische Strukturen wie `Cache`, `Logs`, `Saves`, `Mods`, `node_modules`, `.git` oder `Settings`
- Typische Programmdateien, Quellcodedateien und Spielstandformate

Dateiinhalte werden nicht geöffnet oder gelesen. Die Oberfläche zeigt für Anwendungstyp und Dateninhalt getrennte Konfidenzen. Zusätzlich werden die wichtigsten Indizien und die prozentuale Inhaltsverteilung angezeigt.

Die Klassifizierung ist eine Heuristik. Auch hohe Konfidenz ist keine Löschfreigabe. Besonders mögliche Nutzdaten und gemischte Ordner sollten vor einer Bereinigung manuell geöffnet und geprüft werden.

## Windows Update und alte Windows Versionen

### Frühere Windows Installation

Wenn `%SystemDrive%\Windows.old` vorhanden ist, erscheint ein erweitertes Ziel. KeenyWinCleaner löscht diesen Ordner nicht direkt. Die Bereinigung verwendet:

```text
cleanmgr.exe /d C: /autoclean
```

Das Entfernen beendet die Möglichkeit, zur vorherigen Windows Version zurückzukehren. Deshalb benötigt das Ziel Administratorrechte und ist nie vorausgewählt.

### Windows Komponentenspeicher

Bei aktiviertem Systemscan analysiert KeenyWinCleaner den Komponentenspeicher mit:

```text
dism.exe /Online /Cleanup-Image /AnalyzeComponentStore /English
```

Das Ziel erscheint nur, wenn DISM `Component Store Cleanup Recommended: Yes` meldet. Die Bereinigung verwendet anschließend:

```text
dism.exe /Online /Cleanup-Image /StartComponentCleanup /English
```

`WinSxS` wird niemals direkt gelöscht.

### Windows Update Download Cache

Der Inhalt von `%WINDIR%\SoftwareDistribution\Download` wird nicht direkt gelöscht. Dieser Ordner wird von Windows Update Diensten verwaltet. KeenyWinCleaner beschränkt sich auf die Übermittlungsoptimierung, die DISM Komponentenbereinigung und die offizielle Windows Speicherverwaltung.

## Nicht bereinigte Bereiche

Folgende Bereiche werden bewusst nicht direkt gelöscht:

- Downloads
- Dokumente, Bilder, Videos und Musik
- OneDrive und andere Cloud Dateien
- Papierkorb
- Windows Update Download Cache außerhalb der Übermittlungsoptimierung
- Wiederherstellungspunkte
- Prefetch
- Registry Einträge
- Treiberpakete
- Gesamte AppData Wurzelverzeichnisse
- `WinSxS` per Dateisystemlöschung
- Unbekannte Pfade außerhalb der festen Zieldefinitionen

Für Downloads, Papierkorb, Cloud Dateien und weitere Windows Bereiche kann die Anwendung direkt die Windows Speicheroptimierung öffnen.

## Oberfläche

Die Oberfläche ist auf schnelle Prüfung und klare Kontrolle ausgelegt.

- Übersicht mit gefundener Größe, Dateianzahl, Auswahl und Scanzeit
- Getrennte Scanoptionen für sichere Ziele, App Caches, AppData Reste und Systembereiche
- Einstellbares Mindestalter für AppData Kandidaten
- Fortschrittsanzeige während des Scans
- Filter für Alle, Sicher, Prüfen und Erweitert
- Sammelauswahl je Risikostufe
- Ergebniszeilen mit Pfad, Größe, Datei und Ordneranzahl
- Direkte Ordneröffnung zur manuellen Prüfung
- Sichtbare Klassifikation und Konfidenz
- Permanenter Bereinigungsbalken mit ausgewählter Gesamtgröße
- Zusätzliche Warnung bei erweiterten Zielen
- Deutsche und englische Texte
- Helles und dunkles Theme
- Persistente Sprachwahl und Theme Auswahl über `localStorage`

## Datenschutz

KeenyWinCleaner arbeitet lokal.

- Keine Telemetrie
- Keine Analyse in der Cloud
- Keine Übertragung von Dateinamen oder Pfaden
- Keine Anmeldung
- Kein Benutzerkonto
- Kein automatischer Upload
- Kein automatischer Updater
- Keine Ausführung heruntergeladener Bereinigungsskripte
- Keine Dateiinhaltsanalyse

PowerShell wird lokal und ohne Profil für die Erkennung installierter Store Pakete und laufender Prozesse verwendet. Windows Systemwerkzeuge werden als lokale Prozesse mit festen Argumentlisten aufgerufen.

## Architektur

### Technologie

| Bereich | Technologie |
| --- | --- |
| Desktop Laufzeit | Electron 43 |
| Oberfläche | Vue 3 |
| Komponenten | Vuetify 4 |
| Icons | Material Design Icons |
| Sprache | TypeScript 5 |
| Build | Vite 8 |
| Tests | Vitest 4 |
| Paketerstellung | electron-builder 26 |

### Prozessaufteilung

```text
Vue Renderer
    |
    | begrenzte Preload API
    v
Electron Preload
    |
    | validierte IPC Aufrufe
    v
Electron Hauptprozess
    |
    + Scanner und Pfadmessung
    + Installationsabgleich
    + Inhaltsklassifizierung
    + Zulässige Ziele des letzten Scans
    + Dateisystembereinigung
    + cleanmgr und DISM
```

Der Renderer besitzt keinen direkten Node.js Zugriff. Das Fenster verwendet:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Blockierte neue Fenster

Die Preload Schnittstelle stellt nur folgende Funktionen bereit:

- Anwendungsinformationen lesen
- Scan starten
- Scanfortschritt empfangen
- Ausgewählte Ziele bereinigen
- Einen Ergebnisordner öffnen
- Windows Speichereinstellungen öffnen

### Projektstruktur

```text
keenandclean/
  electron/
    main/
      classifier.ts     Lokale Inhaltsklassifizierung
      cleaner.ts        Scan, Messung und Bereinigung
      index.ts          Electron Fenster und IPC Handler
      registry.ts       Installationsabgleich
    preload/
      index.ts          Begrenzte Renderer API
  src/
    App.vue             Hauptoberfläche
    i18n.ts             Deutsche und englische Texte
    main.ts             Vue und Vuetify Startpunkt
    styles.scss         Helles und dunkles Theme
    types.ts            Gemeinsame Datentypen
  tests/
    safety.test.ts      Sicherheits und Klassifizierungstests
  docs/
    CLEANING_TARGETS.md Technische Zielbeschreibung
  package.json          Befehle und Buildkonfiguration
```

## Entwicklung

### Voraussetzungen

- Windows 10 oder Windows 11
- Node.js 20 oder neuer
- npm
- PowerShell 5.1 oder neuer
- Administratorrechte nur für erweiterte Systemscans und Systembereinigungen

### Installation

```powershell
git clone <DEINE-REPOSITORY-URL>
cd keenandclean
npm install
```

### Entwicklungsmodus

```powershell
npm run dev
```

Vite startet die Oberfläche und öffnet die Electron Anwendung mit Hot Reload.

### Produktionsbuild

```powershell
npm run build
```

Dieser Befehl führt zuerst die TypeScript Prüfung aus und erstellt anschließend Renderer, Hauptprozess und Preload Bundle.

### Verfügbare Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsmodus mit Hot Reload |
| `npm test` | Alle Tests einmal ausführen |
| `npm run test:watch` | Tests bei Änderungen erneut ausführen |
| `npm run build` | TypeScript prüfen und Produktionsbundle erstellen |
| `npm run build:win` | Produktionsbundle, Installer und Portable Version erstellen |
| `npm run preview` | Gebautes Frontend lokal anzeigen |

## Tests

Die Tests prüfen derzeit:

- Pfadgrenzen innerhalb zulässiger Wurzeln
- Ablehnung ähnlich benannter Nachbarpfade
- Schutz vor Pfadtraversierung
- Normalisierung installierter Programmnamen
- Erkennung installierter Anwendungen
- Schutz kurzer und mehrdeutiger Namen
- Kennzeichnung nicht erkannter alter Ordner
- Auswertung von DISM Größenangaben
- Entwicklerwerkzeug Erkennung
- Spiel und Spielstand Erkennung
- Cache Erkennung
- Erkennung gemischter Daten
- Schutz vor schwachen Fehlklassifizierungen
- Priorisierung bekannter Spielanbieter

Tests starten:

```powershell
npm test
```

## Windows Pakete erstellen

```powershell
npm run build:win
```

Die Ergebnisse werden in `release` erstellt:

```text
release/KeenyWinCleaner-Setup-0.1.0-x64.exe
release/KeenyWinCleaner-Portable-0.1.0-x64.exe
release/win-unpacked/KeenyWinCleaner.exe
```

Der NSIS Installer erlaubt die Auswahl des Installationsordners und erstellt Desktop und Startmenüverknüpfungen. Die Portable Version benötigt keine Installation.

## Bekannte Einschränkungen

- Die AppData Resterkennung ist heuristisch und kann falsch positive oder falsch negative Ergebnisse enthalten.
- Portable Anwendungen erscheinen nicht immer in den Windows Uninstall Schlüsseln.
- Manche Spiele und Launcher verwenden abweichende Namen für Installation und AppData Ordner.
- Ein laufender Prozess beweist nur die aktuelle Nutzung, nicht die vollständige Zugehörigkeit aller Daten.
- Store Paketinformationen können bei beschädigten Paketen unvollständig sein.
- Administratorrechte sind für einige Systempfade und DISM erforderlich.
- Gesperrte Dateien können erst nach dem Schließen der zugehörigen Anwendung bereinigt werden.
- Die Größenanzeige ist eine Momentaufnahme. Anwendungen können Dateien während oder nach dem Scan verändern.
- Autoclean und DISM können tatsächlich freigegebenen Speicher anders berechnen als die vorherige Schätzung.
- Die aktuelle Oberfläche untersucht die Standardprofile von Edge und Chrome. Weitere Browserprofile sind noch nicht einzeln aufgeführt.
- Die aktuelle Windows Paketerstellung zielt auf x64 Systeme.

## Häufige Fragen

### Löscht KeenyWinCleaner AppData vollständig?

Nein. Eine vollständige AppData Löschung würde aktive Profile, Einstellungen und persönliche Daten zerstören. Es werden nur alte, nicht zugeordnete direkte Unterordner als erweiterte Kandidaten angezeigt.

### Werden AppData Kandidaten automatisch ausgewählt?

Nein. Nur sichere Ziele sind standardmäßig ausgewählt. AppData Kandidaten und Systembereiche müssen bewusst ausgewählt und mit `CLEAN` bestätigt werden.

### Bedeutet hohe Konfidenz, dass ein Ordner sicher gelöscht werden kann?

Nein. Die Konfidenz beschreibt nur, wie stark die sichtbaren Metadaten zur Klassifizierung passen. Sie ist keine Garantie für Deinstallation oder Entbehrlichkeit.

### Warum wird ein installiertes Programm als möglicher Rest angezeigt?

Mögliche Ursachen sind ein portables Programm, ein ungewöhnlicher Installer, ein anderer Anzeigename, ein nicht laufender Prozess oder ein Launcher mit getrennten Ordnernamen. Öffne den Ergebnisordner und prüfe ihn vor dem Löschen.

### Warum wird ein deinstalliertes Programm nicht angezeigt?

Der Ordner kann jünger als das eingestellte Mindestalter sein, einen geschützten Namen besitzen oder noch zu einem vorhandenen Installationsmerkmal passen.

### Warum braucht die Systembereinigung Administratorrechte?

Windows schützt System Temp, Delivery Optimization, `Windows.old` und den Komponentenspeicher. KeenyWinCleaner umgeht diese Schutzmechanismen nicht.

### Kann eine frühere Windows Version nach der Bereinigung wiederhergestellt werden?

Nein. Nach dem Entfernen von `Windows.old` über Autoclean steht die Rückkehr zur vorherigen Windows Version nicht mehr zur Verfügung.

### Wird `WinSxS` direkt gelöscht?

Nein. KeenyWinCleaner verwendet ausschließlich die unterstützte DISM Analyse und `StartComponentCleanup`.

### Werden gesperrte Dateien erzwungen gelöscht?

Nein. Nicht zugängliche oder verwendete Dateien werden übersprungen.

## Quellen

Die Zielauswahl orientiert sich an offiziellen Windows Dokumentationen:

- [Microsoft Support: Speicheroptimierung verwalten](https://support.microsoft.com/en-US/Windows/Experience/Storage-FileManagement/manage-drive-space-with-storage-sense)
- [Microsoft Support: Speicherplatz in Windows freigeben](https://support.microsoft.com/en-us/windows/free-up-drive-space-in-windows-85529ccb-c365-490d-b548-831022bc9b32)
- [Microsoft Learn: Speicheroptimierung konfigurieren](https://learn.microsoft.com/en-us/windows/configuration/storage/storage-sense)
- [Microsoft Learn: Windows Known Folder IDs](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)
- [Microsoft Learn: ApplicationData](https://learn.microsoft.com/en-us/uwp/api/windows.storage.applicationdata)
- [Microsoft Learn: Installierte Software über Registrierung prüfen](https://learn.microsoft.com/en-us/powershell/scripting/samples/working-with-software-installations)
- [Microsoft Learn: Get-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/get-appxpackage)
- [Microsoft Learn: cleanmgr](https://learn.microsoft.com/windows-server/administration/windows-commands/cleanmgr)
- [Microsoft Learn: WinSxS bereinigen](https://learn.microsoft.com/en-ie/windows-hardware/manufacture/desktop/clean-up-the-winsxs-folder)
- [Microsoft Support: Frühere Windows Version löschen](https://support.microsoft.com/en-gb/windows/delete-your-previous-version-of-windows-f8b26680-e083-c710-b757-7567d69dbb74)

## Lizenz

Die Projektmetadaten deklarieren die MIT Lizenz. Vor der öffentlichen Veröffentlichung sollte zusätzlich eine vollständige `LICENSE` Datei in das Repository aufgenommen werden.

## Sicherheitshinweis

Dateibereinigung kann Daten dauerhaft entfernen. Prüfe erweiterte Treffer immer manuell und sichere wichtige Daten vor umfangreichen Bereinigungen. Die Software wird ohne Garantie bereitgestellt.
