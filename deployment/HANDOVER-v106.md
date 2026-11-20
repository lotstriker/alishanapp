# v106 handover

ZIP: AlishanApp-v106-Faster-Startup.zip. Version log entry ALISHAN-CHG-2026-11-20-006. User Guide topic 30 describes the changes.

Dashboard and Inventory render independent sections in parallel and avoid the duplicate startup render. Page bundles warm on navigation intent instead of preloading Reports and Inventory during the current page's initial load. Settings now participates in app shell warming.

The private performance dashboard shows release-specific filters and groups by page and release. It shows median, p90, sample count, and the slowest visit's largest recorded phase. That phase is evidence of where time accumulated. It cannot attribute a delay to the phone, network carrier or hosting layer on its own. Real Android before/after measurements remain pending.
