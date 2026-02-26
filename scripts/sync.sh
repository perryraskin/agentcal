#!/bin/bash
# Sync all calendar providers
echo "Syncing Google Calendar..."
~/.openclaw/workspace/scripts/calendar/fetch-calendars.sh 2>/dev/null || echo "Google: skipped (not configured)"

echo "Syncing Outlook..."
~/.openclaw/workspace/scripts/calendar/fetch-outlook-graph.sh 2>/dev/null || echo "Outlook: skipped (not configured)"

echo "Syncing iCloud..."
vdirsyncer sync icloud_calendar 2>/dev/null || echo "iCloud: skipped (not configured)"

echo "✓ Sync complete"
