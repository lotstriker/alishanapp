# v105 handover

ZIP: AlishanApp-v105-Responsive-Settings.zip. Version log entry ALISHAN-CHG-2026-11-20-005. User Guide topic 30 explains when backup and archive records load.

Settings binds local navigation before server work. Backup summary and browser storage estimates are deferred until Data & Backup is opened. Archive records load when Archives opens. A slow or unavailable backup request no longer gates choosing another section. Backup preference controls are enabled after their saved values arrive. The Settings page-ready measurement now marks interactive controls, independently of backup loading.

The regression check opens Settings and changes sections while the backup request is held open. Real Android timings should be compared with the previous Settings visit after deployment.
