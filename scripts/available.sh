#!/usr/bin/env python3
import json
import re
import sys
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


def load_events():
    events = []
    # Google
    for f in (CAL_ROOT / "google").glob("*.json"):
        try:
            data = json.loads(f.read_text())
            for item in data.get("items", []):
                start = item.get("start", {})
                dt = parse_dt(start.get("dateTime") or start.get("date") or "")
                if dt:
                    events.append((dt, item.get("summary") or "(No title)", "Google"))
        except Exception:
            pass

    # Outlook
    of = CAL_ROOT / "outlook" / "events.json"
    if of.exists():
        try:
            data = json.loads(of.read_text())
            for item in data.get("value", []):
                dt = parse_dt((item.get("start") or {}).get("dateTime") or "")
                if dt:
                    events.append((dt, item.get("subject") or "(No title)", "Outlook"))
        except Exception:
            pass

    # iCloud
    root = CAL_ROOT / "icloud"
    if root.exists():
        for f in root.rglob("*.ics"):
            try:
                txt = re.sub(r"\r?\n[ \t]", "", f.read_text(errors="ignore"))
                for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", txt, flags=re.S):
                    dtm = re.search(r"^DTSTART(?:;[^:]+)?:([^\r\n]+)", block, flags=re.M)
                    summ = re.search(r"^SUMMARY:([^\r\n]+)", block, flags=re.M)
                    dt = parse_dt(dtm.group(1)) if dtm else None
                    if dt:
                        events.append((dt, summ.group(1).strip() if summ else "(No title)", "iCloud"))
            except Exception:
                pass

    return sorted(events, key=lambda x: x[0])


def parse_range(expr: str):
    expr = expr.strip()
    try:
        from dateutil import parser as dparser  # type: ignore
        m = re.search(r"(.+?)(?:\s+)(\d{1,2}(:\d{2})?\s*[ap]m?)\s*-\s*(\d{1,2}(:\d{2})?\s*[ap]m?)$", expr, flags=re.I)
        if m:
            day, s, _, e, _ = m.groups()
            base = dparser.parse(day, fuzzy=True)
            start = dparser.parse(f"{base.date()} {s}")
            end = dparser.parse(f"{base.date()} {e}")
            if end <= start:
                end += timedelta(days=1)
            return start, end
        parts = re.split(r"\s*-\s*", expr)
        if len(parts) == 2:
            start = dparser.parse(parts[0], fuzzy=True)
            end = dparser.parse(parts[1], fuzzy=True)
            if end <= start:
                end += timedelta(days=1)
            return start, end
    except Exception:
        pass

    # Basic fallback parser
    lower = expr.lower()
    base_date = date.today()
    if "tomorrow" in lower:
        base_date += timedelta(days=1)
    elif "today" in lower:
        base_date = date.today()
    else:
        wd = {"monday":0,"tuesday":1,"wednesday":2,"thursday":3,"friday":4,"saturday":5,"sunday":6}
        for name, idx in wd.items():
            if name in lower:
                delta = (idx - date.today().weekday()) % 7
                base_date = date.today() + timedelta(days=delta)
                break

    m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*([ap]m?)\s*-\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m?)", lower)
    if not m:
        raise ValueError("Could not parse time range. Example: 'tomorrow 2pm-4pm'")

    sh, sm, sap, eh, em, eap = m.groups()
    sh, sm, eh, em = int(sh), int(sm or 0), int(eh), int(em or 0)

    if sap.startswith("p") and sh != 12:
        sh += 12
    if sap.startswith("a") and sh == 12:
        sh = 0
    if eap.startswith("p") and eh != 12:
        eh += 12
    if eap.startswith("a") and eh == 12:
        eh = 0

    start = datetime.combine(base_date, time(sh, sm))
    end = datetime.combine(base_date, time(eh, em))
    if end <= start:
        end += timedelta(days=1)
    return start, end


def main():
    if len(sys.argv) < 2:
        print('Usage: ./scripts/available.sh "tomorrow 2pm-4pm"')
        sys.exit(1)

    expr = " ".join(sys.argv[1:])
    try:
        start, end = parse_range(expr)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    events = load_events()

    for dt, title, source in events:
        event_end = dt + timedelta(hours=1)
        if dt < end and event_end > start:
            print(f"✗ Conflict: {title} at {dt.strftime('%Y-%m-%d %I:%M %p')} [{source}]")
            return

    print("✓ Available")


if __name__ == "__main__":
    main()
