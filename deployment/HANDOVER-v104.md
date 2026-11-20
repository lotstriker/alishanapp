# v104 handover

ZIP: AlishanApp-v104-Page-Performance.zip. Version log entry ALISHAN-CHG-2026-11-20-004. User Guide topic 30 describes automatic page performance.

Apply deployment/performance.sql before deployment. The report at /performance.html requires Alishan sign-in. The business pages send one bounded record per document visit. An offline tab retains up to twelve unsent visits and retries when it is online. Navigation taps count when they lead to a supported page in the same tab.

Page, account and device filters apply to the latest 500 visits within 30 days. Existing password mode is one account, and the browser device ID distinguishes its browsers. Google mode assigns records to the authenticated account. Only the configured legacy owner can see across accounts. There is no automatic identity inference from a phone or an IP address.

API processing measurements and database round-trip measurements refer to the slowest initial request batch by response wait. Database time includes pool wait and DB round trips, not pure SQL execution. Outside-server estimates include transit and infrastructure overhead. Last API to UI includes time until the measured content-ready marker. The report excludes form data, inventory, full URLs, identity emails and client IP addresses.

Alishan’s browser reports need a real-device visit after rollout. Google provider activation and full SPA navigation remain separate.
