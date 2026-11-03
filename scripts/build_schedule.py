"""Fetch the team's SportsEngine iCal feed and write it as data/schedule.json.

The feed doesn't send CORS headers, so the browser can't read it directly.
The GitHub Pages workflow runs this before every deploy instead.

Usage: python scripts/build_schedule.py [output_path]
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

FEED_URL = "https://ical.sportngin.com/v3/calendar/ical?team_ids=11f12492-94a3-f992-bfae-92d13fd9be2b"
TEAM = "Salem Sasquatch"
DEFAULT_TZ = "America/New_York"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "squatch-site schedule builder"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8")


def unfold(text):
    # RFC 5545: a line starting with a space or tab continues the previous one.
    return re.sub(r"\r?\n[ \t]", "", text).splitlines()


def unescape(value):
    return (value.replace("\\n", " ").replace("\\N", " ")
            .replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\"))


def parse_events(text):
    events, current = [], None
    for line in unfold(text):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            events.append(current)
            current = None
        elif current is not None and ":" in line:
            key, value = line.split(":", 1)
            name, *params = key.split(";")
            current[name] = (value, dict(p.split("=", 1) for p in params if "=" in p))
    return events


def parse_start(value, params):
    """Return the start as an aware datetime in the event's own time zone."""
    if params.get("VALUE") == "DATE":
        return datetime.strptime(value, "%Y%m%d").replace(tzinfo=ZoneInfo(DEFAULT_TZ))
    if value.endswith("Z"):
        utc = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return utc.astimezone(ZoneInfo(DEFAULT_TZ))
    tz = ZoneInfo(params.get("TZID", DEFAULT_TZ))
    return datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=tz)


def opponent_from(summary):
    # Summaries look like "Boston Gold Kings  at Salem Sasquatch".
    parts = [p.strip() for p in re.split(r"\s+(?:at|vs\.?|@)\s+", summary, maxsplit=1)]
    if len(parts) == 2:
        return parts[1] if parts[0] == TEAM else parts[0]
    return summary.strip()


def to_game(ev):
    if ev.get("STATUS", ("",))[0].upper() == "CANCELLED":
        return None
    start = parse_start(*ev["DTSTART"])
    summary = unescape(ev.get("SUMMARY", ("",))[0])
    return {
        "id": ev.get("UID", (start.isoformat(),))[0],
        "start": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        # Wall-clock date/time at the rink, shown as-is on the site.
        "date": start.strftime("%Y-%m-%d"),
        "time": start.strftime("%I:%M %p").lstrip("0"),
        "location": unescape(ev.get("LOCATION", ("TBA",))[0]).strip(),
        "opponent": opponent_from(summary),
    }


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "data/schedule.json")
    games = [g for g in map(to_game, parse_events(fetch(FEED_URL))) if g]
    games.sort(key=lambda g: g["start"])
    if not games:
        sys.exit("Feed returned no games; refusing to publish an empty schedule.")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "games": games,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(games)} games to {out}")


if __name__ == "__main__":
    main()
