# agentcal

Multi-provider calendar CLI for AI agents.

`agentcal` unifies local calendar data from:
- Google Calendar
- Microsoft Outlook (Graph API)
- iCloud (CalDAV / ICS)

It is designed for OpenClaw workflows where agents need fast, local calendar reads without opening web UIs.

## Features

- Single command view of **today**
- 7-day **week** agenda
- Provider **sync** helper
- Interactive **setup** wizard
- Natural language **availability** checks (`"tomorrow 2pm-4pm"`)

## Install

```bash
git clone https://github.com/perryraskin/agentcal.git
cd agentcal
chmod +x scripts/*.sh
```

Optional: add aliases or a wrapper in your PATH.

## Directory layout

```text
agentcal/
  SKILL.md
  README.md
  scripts/
    today.sh
    week.sh
    sync.sh
    setup.sh
    available.sh
  references/
    google-setup.md
    microsoft-setup.md
    icloud-setup.md
```

## Data sources

`agentcal` reads already-synced local files in `~/.calendars/`:

- Google: `~/.calendars/google/*.json`
  - Expects `items[].start.dateTime` or `items[].start.date`
  - Event title from `items[].summary`
- Outlook: `~/.calendars/outlook/events.json`
  - Expects `value[].start.dateTime`
  - Event title from `value[].subject`
- iCloud: `~/.calendars/icloud/**/*.ics`
  - Parses `DTSTART` and `SUMMARY` from ICS entries

## Usage

### Show today

```bash
./scripts/today.sh
```

Example output:

```text
=== Today's Schedule (2026-02-25) ===

  09:00 AM   Standup  [Outlook]
  03:00 PM   Client call  [Google]
```

### Show next 7 days

```bash
./scripts/week.sh
```

### Sync all providers

```bash
./scripts/sync.sh
```

This calls existing local tooling if available:
- `~/.openclaw/workspace/scripts/calendar/fetch-calendars.sh`
- `~/.openclaw/workspace/scripts/calendar/fetch-outlook-graph.sh`
- `vdirsyncer sync icloud_calendar`

### Setup wizard

```bash
./scripts/setup.sh
```

Interactive guide for:
- Google OAuth app + Calendar API
- Microsoft Entra app + Graph device code flow
- iCloud app-specific password + CalDAV/vdirsyncer

### Availability check

```bash
./scripts/available.sh "tomorrow 2pm-4pm"
./scripts/available.sh "friday 10am-11:30am"
./scripts/available.sh "2026-03-01 09:00-12:00"
```

Output:
- `✓ Available`
- or `✗ Conflict: <event> at <time>`

## Provider setup docs

- [Google setup](references/google-setup.md)
- [Microsoft setup](references/microsoft-setup.md)
- [iCloud setup](references/icloud-setup.md)

## OpenClaw skill usage

This repository includes `SKILL.md` metadata for OpenClaw.

Typical agent flow:
1. Run `scripts/sync.sh`
2. Read schedule with `scripts/today.sh` or `scripts/week.sh`
3. Validate slots via `scripts/available.sh "..."`

## Notes

- Times are normalized to local timezone where possible.
- All-day events render at `12:00 AM` on their date.
- Missing/unconfigured providers are skipped gracefully.
