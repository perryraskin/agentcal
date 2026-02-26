# Google Calendar Setup

## 1) Create a Google Cloud project
1. Open https://console.cloud.google.com/
2. Select or create a project.

## 2) Enable Calendar API
1. Go to **APIs & Services → Library**.
2. Search for **Google Calendar API**.
3. Click **Enable**.

## 3) Configure OAuth consent screen
1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (or Internal if Workspace policy allows).
3. Fill app name, support email, and developer contact.
4. Add required scopes (at minimum calendar read scope).
5. Save and publish/testing as needed.

## 4) Create OAuth client
1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Desktop app**.
4. Download client JSON.

## 5) Run OAuth flow to obtain token
1. Use your preferred script/tooling to complete OAuth.
2. Store resulting token securely (do not commit tokens).
3. Use token to fetch events and write JSON exports to:
   - `~/.calendars/google/<calendar>.json`

## 6) Verify agentcal
Run:
```bash
./scripts/today.sh
```
You should see Google events with `[Google]` source labels.
