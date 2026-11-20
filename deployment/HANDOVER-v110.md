# v110 handover

ZIP: AlishanApp-v110-SPA-Icons.zip. Version log entry: ALISHAN-CHG-2026-11-20-010.

Opening Page Performance directly previously skipped the shared SVG renderer. SPA navigation then reused the document without loading scripts from the destination page. Page Performance now includes the renderer. The navigation regression starts there and verifies icons after entering the Dashboard, switching to Inventory and going Back. No telemetry changes.
