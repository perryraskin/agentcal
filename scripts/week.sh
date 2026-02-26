#!/usr/bin/env python3
import json
import re
from datetime import datetime, date, time, timedelta
from pathlib import Path

CAL_ROOT = Path.home() / ".calendars"


def parse_dt(value: str):
    if not value:
        return None
    v = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is not None:
            dt = dt.astimezone().replace(tzinfo=None)
        return dt
    except Exception:
        pass
    m = re.match(r"^(\d{8})T(\d{6})", v)
    if m:
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
    m = re.match(r"^(\d{8})$", v)
    if m:
        d = datetime.strptime(m.group(1), "%Y%m%d").date()
        return datetime.combine(d, time.min)
    try:
        d = date.fromisoformat(v[:10])
        return datetime.combine(d, time.min)
    except Exception:
        return None


def load_google(events):
    for f in (CAL_ROOT / "google").glob("*.json"):
        try:
            data = json.loads(f.read_text())
            for item in data.get("items", []):
                start = item.get("start", {})
                dt = parse_dt(start.get("dateTime") or start.get("date") or "")
                if dt:
                    events.append((dt, item.get("summary") or "(No title)", "Google"))
        except Exception:
            continue


def load_outlook(events):
    f = CAL_ROOT / "outlook" / "events.json"
    if not f.exists():
        return
    try:
        data = json.loads(f.read_text())
        for item in data.get("value", []):
            start = item.get("start", {})
            dt = parse_dt(start.get("dateTime") or "")
            if dt:
                events.append((dt, item.get("subject") or "(No title)", "Outlook"))
    except Exception:
        return


def unfold_ics(text: str):
    return re.sub(r"\r?\n[ \t]", "", text)


def load_icloud(events):
    root = CAL_ROOT / "icloud"
    for f in root.rglob("*.ics") if root.exists() else []:
        try:
            txt = unfold_ics(f.read_text(errors="ignore"))
            for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", txt, flags=re.S):
                dtm = re.search(r"^DTSTART(?:;[^:]+)?:([^\r\n]+)", block, flags=re.M)
                summ = re.search(r"^SUMMARY:([^\r\n]+)", block, flags=re.M)
                dt = parse_dt(dtm.group(1)) if dtm else None
                if dt:
                    events.append((dt, summ.group(1).strip() if summ else "(No title)", "iCloud"))
        except Exception:
            continue


def main():
    start = date.today()
    end = start + timedelta(days=6)
    events = []
    load_google(events)
    load_outlook(events)
    load_icloud(events)

    week = [e for e in events if start <= e[0].date() <= end]
    week.sort(key=lambda x: x[0])

    print(f"=== Next 7 Days ({start.isoformat()} to {end.isoformat()}) ===\n")

    if not week:
        print("No events in the next 7 days")
        return

    grouped = {}
    for e in week:
        grouped.setdefault(e[0].date(), []).append(e)

    d = start
    while d <= end:
        print(f"{d.isoformat()} ({d.strftime('%A')})")
        day_events = grouped.get(d, [])
        if not day_events:
            print("  No events")
        else:
            for dt, title, source in day_events:
                print(f"  {dt.strftime('%I:%M %p')}   {title}  [{source}]")
        print()
        d += timedelta(days=1)


if __name__ == "__main__":
    main()
