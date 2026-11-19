# v102 handover

ZIP filename: AlishanApp-v102-Google-Login.zip. Version log entry: ALISHAN-CHG-2026-11-20-002.

Google PKCE is handled on the server with an HTTP-only browser session. Inventory, payments, reports, backups and settings are read and saved under the verified account's workspace. Logout revokes the session and clears device views. The existing workspace remains accessible in the deployed password mode. Enabling Google-only mode for an existing workspace requires its explicitly verified Google owner.

Dashboard, Inventory and Reports are warmed when navigation intent is detected. A confirmed Save primes the changed record and its authoritative payment balance. Lists and affected reports still refresh as needed. Pages still use normal document navigation.

The User Guide adds Google account and sign-out instructions in topic 30. Automated verification covers the sign-in callback, direct cross-user reads and writes, exports, logout and changed-record cache priming. The sign-in test uses a provider fixture. Real Google and Android validation are pending.

## Enabling Google login on Render

1. Enable the Google provider in the project's Supabase Auth settings using a Google Cloud Web OAuth client. Set the Google authorized redirect URI to the Supabase Auth callback.
2. Add the Render app's /auth/callback URL to the Supabase Auth redirect allow list.
3. Identify the existing workspace's verified Google owner. Set LEGACY_OWNER_USER_ID to that user's Supabase Auth UUID. The app checks that the UUID belongs to a Google identity before switching the existing workspace.
4. Configure APP_ORIGIN, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. Deploy with APP_AUTH_MODE=google after checking the provider and owner. Keep APP_PASSWORD as a server-side signing secret.
5. Verify owner access to the existing data, a second account's empty workspace, cross-account API access and logout on the live URL.
