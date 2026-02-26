# Microsoft Outlook Setup (Graph + Device Code)

## 1) Register app in Azure
1. Open https://portal.azure.com/
2. Go to **Microsoft Entra ID → App registrations → New registration**.
3. Name the app (e.g., `agentcal`).
4. Account type: single-tenant or multi-tenant as needed.
5. Create app.

## 2) Configure mobile/desktop platform
1. In app: **Authentication**.
2. Add platform: **Mobile and desktop applications**.
3. Add redirect URI for public client flow (default native URI works).
4. Enable **Allow public client flows**.

## 3) API permissions
1. Go to **API permissions**.
2. Add **Microsoft Graph** delegated permissions:
   - `Calendars.Read`
3. Grant admin consent if required by tenant policy.

## 4) Use device code flow
1. Implement/run a script using Graph OAuth device code flow.
2. Authorize in browser with provided code.
3. Store token securely (never commit token files).

## 5) Export/sync events
Fetch events from Graph and store at:
- `~/.calendars/outlook/events.json`

Expected shape:
- `value[].start.dateTime`
- `value[].subject`

## 6) Verify agentcal
Run:
```bash
./scripts/today.sh
```
You should see Outlook events with `[Outlook]` labels.
