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

## Ziele mit Prüfung

| Bereich | Typischer Pfad | Risiko |
| --- | --- | --- |
| Edge Cache | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache` | Der Browser sollte geschlossen sein. |
| Chrome Cache | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache` | Der Browser sollte geschlossen sein. |
| Discord Cache | `%APPDATA%\discord\Cache` | Discord sollte geschlossen sein. |
| Windows Temp | `%WINDIR%\Temp` | Administratorrechte können nötig sein. Aktive Dateien werden übersprungen. |
| Übermittlungsoptimierung | `%ProgramData%\Microsoft\Windows\DeliveryOptimization\Cache` | Erweiterter Bereich. Die Windows Speicheroptimierung bleibt der bevorzugte Weg. |
| Frühere Windows Installation | `%SystemDrive%\Windows.old` | Wird nur bei vorhandenem Ordner gezeigt. Die unterstützte Autoclean Funktion entfernt die Rückkehrmöglichkeit zur vorherigen Windows Version dauerhaft. |
| Windows Komponentenspeicher | `%WINDIR%\WinSxS` | Wird nur gezeigt, wenn DISM eine Bereinigung empfiehlt. Die Bereinigung verwendet `StartComponentCleanup`. |

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

## Bewusst nicht direkt gelöscht

- Downloads
- Persönliche Dokumente, Bilder, Videos und Musik
- OneDrive Dateien
- Papierkorb
- Windows Update Download Cache außerhalb der Übermittlungsoptimierung
- Wiederherstellungspunkte
- Prefetch
- Registry Einträge
- Treiberpakete

Diese Bereiche können persönliche Daten oder aktive Windows Komponenten enthalten. KeenyWinCleaner öffnet für unterstützte Systemaufgaben die Windows Speichereinstellungen.
