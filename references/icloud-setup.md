# iCloud Calendar Setup (CalDAV + vdirsyncer)

## 1) Generate app-specific password
1. Open https://appleid.apple.com/
2. Sign in and go to **Sign-In and Security**.
3. Create an **App-Specific Password** for calendar sync.

## 2) Configure vdirsyncer
1. Install vdirsyncer.
2. Edit config at:
   - `~/.config/vdirsyncer/config`
3. Configure iCloud CalDAV endpoint and credentials:
   - Apple ID email
   - App-specific password
4. Configure local storage path under:
   - `~/.calendars/icloud/`

## 3) Sync calendars
Run:
```bash
vdirsyncer sync icloud_calendar
```

Ensure `.ics` files exist under `~/.calendars/icloud/`.

## 4) Verify agentcal
Run:
```bash
./scripts/today.sh
```
You should see iCloud events with `[iCloud]` labels.
