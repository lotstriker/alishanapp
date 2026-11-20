# v107 handover

ZIP: AlishanApp-v107-SPA-Navigation.zip. Version log entry ALISHAN-CHG-2026-11-20-007. User Guide topic 30 describes navigation.

Dashboard, Inventory, Reports, Settings, Add Entry, history and pending pages switch within one document. Visited views and scoped scripts stay in the tab. The startup document, authenticated API transport, cache and navigation history are shared. Direct refresh and special-action URLs with a query or fragment use the original routing. Modified clicks still open normally. An authenticated route bundle failure falls back to normal document navigation. Session or release mismatches stop reuse.

The performance report records soft route visits separately. They have tap-to-content and page-ready durations. Document wait and DOM/load event metrics apply to initial document loads. Real-device before/after timing is pending.
