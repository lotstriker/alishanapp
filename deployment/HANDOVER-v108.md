# v108 handover

ZIP: AlishanApp-v108-SPA-Styles.zip. Version log entry: ALISHAN-CHG-2026-11-20-008. User Guide topic 30 describes the fix.

The router previously checked whether a stylesheet was connected to any document. Parsed route styles were still connected to the parsed document, so the router skipped attaching them. It now verifies the live document head is the parent before attaching them. The navigation regression verifies stylesheet loading and reuse.
