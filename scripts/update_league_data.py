"""Read the Salem Sasquatch pages on thecohl.com and write the site's data files.

  data/schedule.json   every game, with final scores (and OT/SO) for finished ones
  data/standings.json  Northeast East and West division standings
  data/stats.json      player stats (skaters, goalies) and team stats

thecohl.com is the source of truth. The "Update league data" GitHub Action runs this
every Monday and commits whatever changed, which redeploys the site.

A file is only rewritten when its page was read and looked complete, so a bad read
never replaces good data. The script exits with an error if any page failed.

Usage: python scripts/update_league_data.py [data_dir]
"""
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

SITE = "https://www.thecohl.com"
SUBSEASON = "960828"        # the subseason=... number in the 2026-27 links
SEASON = "2026–27"
SEASON_START_YEAR = 2026    # Aug-Dec games are in this year, Jan-Jul in the next
TZ = ZoneInfo("America/New_York")

TEAM = "Salem Sasquatch"
TEAM_INSTANCE = "10522691"  # /schedule/team_instance/... and /stats/team_instance/...
TEAM_PAGE = "9440520"       # /standings/show/...
STATS_TOOL = "5816987"
# Each team's standings page shows its own division; Salem's is the East.
DIVISION_PAGES = {"East": "9440520", "West": "9440531"}  # Salem, Connecticut

MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}


def fetch(path):
    req = urllib.request.Request(SITE + path, headers={"User-Agent": "squatch-site data updater"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8")


def clean(fragment):
    fragment = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def tables(page):
    """{table id (or index): [[cell text, ...], ...]} for every table on the page."""
    page = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", page, flags=re.S | re.I)
    found = {}
    for i, (attrs, body) in enumerate(re.findall(r"<table([^>]*)>(.*?)</table>", page, re.S | re.I)):
        m = re.search(r'id="([^"]+)"', attrs)
        rows = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S | re.I):
            cells = re.findall(r"<t([dh])[^>]*>(.*?)</t[dh]>", tr, re.S | re.I)
            if cells:
                rows.append({"cells": [clean(c) for _, c in cells], "raw": tr})
        found[m.group(1) if m else i] = rows
    return found


def records(rows):
    """Header row + data rows -> list of dicts keyed by header."""
    head = rows[0]["cells"]
    return [dict(zip(head, r["cells"])) for r in rows[1:] if len(r["cells"]) == len(head)]


def num(v):
    v = v.strip()
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    if re.fullmatch(r"-?\d*\.\d+", v):
        return float(v)
    return v


# ---------------------------------------------------------------- schedule

def game_date(text):
    m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b", text, re.I)
    month = MONTHS[m.group(1).lower()]
    year = SEASON_START_YEAR if month >= 8 else SEASON_START_YEAR + 1
    return year, month, int(m.group(2))


def overtime_note(gid):
    page = clean(fetch(f"/game/show/{gid}?subseason={SUBSEASON}"))
    m = re.search(r"FINAL\s*/\s*(OT|SO)", page, re.I)
    if m:
        return m.group(1).upper()
    if re.search(r"Shootout Summary|shootout won", page, re.I):
        return "SO"
    return "OT" if re.search(r"\b1 2 3 OT", page) else ""


def build_schedule(old_games):
    rows = next(iter(tables(fetch(f"/schedule/team_instance/{TEAM_INSTANCE}?subseason={SUBSEASON}")).values()))
    head = [c.lower() for c in rows[0]["cells"]]
    col = {name: head.index(name) for name in ("date", "result", "opponent", "location", "status")}
    old = {g["id"]: g for g in old_games}
    old_by_date = {g["date"]: g for g in old_games}
    games = []
    for r in rows[1:]:
        cells = r["cells"]
        gid = re.search(r"/game/show/(\d+)", r["raw"])
        if len(cells) < len(head) or not gid:
            continue
        gid = gid.group(1)
        status = cells[col["status"]]
        if re.search(r"cancel", status, re.I):
            continue
        opponent = cells[col["opponent"]]
        home = not opponent.startswith("@")
        y, mo, d = game_date(cells[col["date"]])
        t = re.search(r"(\d{1,2}):(\d{2})\s*([AP]M)", status, re.I)
        if t:
            hour = int(t.group(1)) % 12 + (12 if t.group(3).upper() == "PM" else 0)
            start = datetime(y, mo, d, hour, int(t.group(2)), tzinfo=TZ)
            time = f"{int(t.group(1))}:{t.group(2)} {t.group(3).upper()}"
        else:
            # Finished games don't list a start time; keep the one we saw before it was played.
            prev = old.get(gid) or old_by_date.get(f"{y}-{mo:02d}-{d:02d}")
            start = datetime.fromisoformat(prev["start"].replace("Z", "+00:00")) if prev else datetime(y, mo, d, 19, 0, tzinfo=TZ)
            time = prev.get("time") if prev else None
        game = {
            "id": gid,
            "start": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "date": f"{y}-{mo:02d}-{d:02d}",
            "time": time,
            "location": cells[col["location"]] or "TBA",
            "opponent": opponent.lstrip("@ ").strip(),
            "home": home,
        }
        res = re.match(r"([WLT])\s+(\d+)\s*[-–]\s*(\d+)", cells[col["result"]])
        if res:
            prev_score = (old.get(gid) or {}).get("score")
            us, them = int(res.group(2)), int(res.group(3))
            same = prev_score and (prev_score["salem"], prev_score["opponent"]) == (us, them)
            game["score"] = {"salem": us, "opponent": them, "result": res.group(1),
                             "note": prev_score.get("note", "") if same else overtime_note(gid)}
        elif not t and status and status.lower() not in ("", "-"):
            game["status"] = status  # e.g. "Postponed"
        games.append(game)
    if not games:
        raise ValueError("schedule page had no games")
    return {"games": sorted(games, key=lambda g: g["start"])}


# ---------------------------------------------------------------- standings

def build_standings():
    divisions = []
    for name, page in DIVISION_PAGES.items():
        rows = next(iter(tables(fetch(f"/standings/show/{page}?subseason={SUBSEASON}")).values()))
        # Header is "Team | Team | GP | W | ..." (full name, then short name).
        head = ["name", "short"] + [c.lower() for c in rows[0]["cells"][2:]]
        teams = []
        for r in rows[1:]:
            if len(r["cells"]) != len(head):
                continue
            t = {k: num(v) for k, v in zip(head, r["cells"])}
            t.pop("short", None)
            t["diff"] = t["gf"] - t["ga"]
            # "Division" is the in-division record as W-L-T-OTL-SOL.
            t["divRecord"] = t.pop("division", "")
            teams.append(t)
        if not teams:
            raise ValueError(f"{name} standings page had no teams")
        divisions.append({"name": name, "teams": teams})
    return {"season": SEASON, "divisions": divisions}


# ---------------------------------------------------------------- stats

STAT_KEYS = {"#": "number", "Name": "name", "SV %": "svPct", "AVG PTS": "ptsPerGame", "PP %": "ppPct", "PK %": "pkPct"}


def stat_rows(rows):
    out = []
    for rec in records(rows):
        out.append({STAT_KEYS.get(k, k.lower()): (num(v) if k != "Name" else v) for k, v in rec.items()})
    return out


def build_stats():
    base = f"/stats/team_instance/{TEAM_INSTANCE}?subseason={SUBSEASON}&tool={STATS_TOOL}"
    players = tables(fetch(base + "&tab=team_instance_player_stats"))
    team = tables(fetch(base + "&tab=team_instance_team_stats"))
    skaters = stat_rows(players["player-sm-ice_hockey_skater-table"])
    goalies = stat_rows(players["player-sm-ice_hockey_goalie-table"])
    for p in skaters + goalies:
        if p["number"] == "":
            p["number"] = None
    if not skaters:
        raise ValueError("player stats page had no skaters")

    def team_table(key):
        return {r["Team"]: {STAT_KEYS.get(k, k.lower()): num(v) for k, v in r.items() if k != "Team"}
                for r in records(team[key])}

    scoring_rows = team["team-sm-ice_hockey_team_scoring-table"]
    periods = {}
    for r in scoring_rows[1:]:  # Team | 1 | 2 | 3 | OT | Total
        c = r["cells"]
        periods[c[0]] = {"p1": num(c[1]), "p2": num(c[2]), "p3": num(c[3]), "ot": num(c[4]), "total": num(c[5])}
    totals = team_table("team-sm-ice_hockey_skater-table")
    goaltending = team_table("team-sm-ice_hockey_goalie-table")
    special = team_table("team-sm-ice_hockey_team_stats-table")
    side = lambda name: {"scoring": periods.get(name, {}), "skaters": totals.get(name, {}),
                         "goalies": goaltending.get(name, {}), "special": special.get(name, {})}
    return {"season": SEASON, "skaters": skaters, "goalies": goalies,
            "team": {"us": side(TEAM), "opponents": side("Opponent")}}


# ---------------------------------------------------------------- main

def main():
    data_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "data")
    data_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    def load(name):
        p = data_dir / name
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

    jobs = {
        "schedule.json": lambda: build_schedule(load("schedule.json").get("games", [])),
        "standings.json": build_standings,
        "stats.json": build_stats,
    }
    failed = []
    for name, build in jobs.items():
        try:
            data = build()
        except Exception as err:
            print(f"error: couldn't update {name}: {err!r}", file=sys.stderr)
            failed.append(name)
            continue
        path = data_dir / name
        old = load(name)
        # Only bump "updated" when something actually changed, so unchanged weeks make no commit.
        if {k: v for k, v in old.items() if k != "updated"} == data:
            print(f"{name}: no changes")
            continue
        path.write_text(json.dumps({"updated": now, **data}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{name}: updated")
    if failed:
        sys.exit(f"Failed: {', '.join(failed)} (left as they were)")


if __name__ == "__main__":
    main()
