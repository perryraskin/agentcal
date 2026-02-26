---
name: agentcal
description: "Multi-provider calendar CLI for AI agents. Sync Google Calendar, Microsoft Outlook, and iCloud. Commands: agentcal today, agentcal week, agentcal sync. Use when agent needs to read calendar events or check availability."
homepage: https://github.com/perryraskin/agentcal
metadata:
  openclaw:
    emoji: "📅"
    requires:
      bins: ["python3", "curl"]
---

# agentcal

`agentcal` is a lightweight multi-provider calendar skill for OpenClaw agents.
It reads local synced calendar data from Google Calendar, Microsoft Outlook, and iCloud.

## Commands

- `./scripts/today.sh` — show today's schedule across providers
- `./scripts/week.sh` — show the next 7 days grouped by date
- `./scripts/available.sh "tomorrow 2pm-4pm"` — check if a time range is free
- `./scripts/sync.sh` — trigger provider sync scripts
- `./scripts/setup.sh` — interactive setup helper

## Data locations

All provider data is read from `~/.calendars/`:

- Google JSON exports: `~/.calendars/google/*.json`
- Outlook Graph events: `~/.calendars/outlook/events.json`
- iCloud ICS files: `~/.calendars/icloud/**/*.ics`

## Configuration locations

- Google setup guide: `references/google-setup.md`
- Microsoft setup guide: `references/microsoft-setup.md`
- iCloud setup guide: `references/icloud-setup.md`

Typical related config files:

- Google OAuth credentials/token: user-managed files referenced in `google-setup.md`
- Outlook app/client setup and token cache: user-managed files referenced in `microsoft-setup.md`
- vdirsyncer config: `~/.config/vdirsyncer/config`

## OpenClaw usage

Agents can call:

- `agentcal sync` before reads (or `./scripts/sync.sh` directly)
- `agentcal today` for same-day planning
- `agentcal week` for next-week planning
- `agentcal available "<natural language range>"` for availability checks
