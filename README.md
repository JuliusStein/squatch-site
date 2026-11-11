# Salem Sasquatch site

Live at https://salemsasquatch.com.

## Where the data comes from

The schedule, final scores, standings and stats all come from the Salem
Sasquatch pages on [thecohl.com](https://www.thecohl.com/page/show/9440520-salem-sasquatch).
`scripts/update_league_data.py` reads them and writes:

- `data/schedule.json`: every game, with final scores (and OT/SO) once played
- `data/standings.json`: East and West division standings
- `data/stats.json`: skater, goalie and team stats
- `data/games/<id>.json`: box score for each finished game, shown on `game.html?id=<id>` (click a score on the schedule)

The **Update league data** GitHub Action runs every Monday at 9:00 AM EST
(10:00 AM during daylight saving time). If anything changed, it commits the new
files and redeploys the site. To update right away, open the repo's **Actions**
tab, pick **Update league data** and click **Run workflow**.

If a page can't be read, its file is left as it was and the run fails, so
GitHub emails you. Nothing on the site is replaced with incomplete data.

To fix a wrong score or stat, fix it on thecohl.com; the next update picks it up.

## New season

Update `SUBSEASON`, `SEASON`, `SEASON_START_YEAR` and the team page numbers at
the top of `scripts/update_league_data.py` to match the new season's links on
thecohl.com.

## Roster

The roster is edited by hand in [`roster.json`](roster.json).
