#!/bin/bash
set -e

cat <<'INTRO'
=== agentcal setup wizard ===

This wizard explains how to configure Google Calendar, Microsoft Outlook,
and iCloud so agentcal can read your local synced calendar data.

Data directory used by scripts: ~/.calendars/
Reference docs live in ./references/
INTRO

pause() {
  read -r -p "Press Enter to continue..." _
}

show_google() {
  cat <<'GOOGLE'

[Google Calendar]
1) Go to Google Cloud Console: https://console.cloud.google.com/
2) Create/select a project
3) Enable the Google Calendar API
4) Configure OAuth consent screen
5) Create OAuth client credentials (Desktop app)
6) Run your OAuth/token script to store tokens locally
7) Sync/export events into: ~/.calendars/google/*.json

Detailed steps: references/google-setup.md
GOOGLE
}

show_microsoft() {
  cat <<'MS'

[Microsoft Outlook / Graph]
1) Go to Azure Portal: https://portal.azure.com/
2) App registrations → New registration
3) Add Mobile and desktop redirect URI
4) Enable "Allow public client flows"
5) Add Microsoft Graph delegated permissions (Calendars.Read)
6) Use device code flow to obtain token
7) Sync/export events into: ~/.calendars/outlook/events.json

Detailed steps: references/microsoft-setup.md
MS
}

show_icloud() {
  cat <<'ICLOUD'

[iCloud / CalDAV]
1) Go to https://appleid.apple.com/
2) Generate an app-specific password
3) Configure vdirsyncer with iCloud CalDAV credentials
4) Run: vdirsyncer sync icloud_calendar
5) Ensure ICS files exist under: ~/.calendars/icloud/

Detailed steps: references/icloud-setup.md
ICLOUD
}

while true; do
  echo
  echo "Choose provider setup help:"
  echo "  1) Google"
  echo "  2) Microsoft Outlook"
  echo "  3) iCloud"
  echo "  4) Show all"
  echo "  5) Exit"
  read -r -p "> " choice

  case "$choice" in
    1) show_google; pause ;;
    2) show_microsoft; pause ;;
    3) show_icloud; pause ;;
    4) show_google; show_microsoft; show_icloud; pause ;;
    5) echo "Done."; exit 0 ;;
    *) echo "Invalid choice" ;;
  esac
done
