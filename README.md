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

## Tickets

Home-game tickets are $10, paid with PayPal or Venmo through PayPal's buttons
(`js/payments.js`). Each order carries the game, ticket count and buyer's name.

- **Client ID** (public): `PAYPAL_CLIENT_ID` at the top of `js/payments.js`.
  While it's empty, the ticket dialog says online sales are coming soon.
- **Secret key**: only in the repo's GitHub secrets as `PAYPAL_CLIENT_ID` and
  `PAYPAL_CLIENT_SECRET` (Settings > Secrets and variables > Actions). Never in
  the site's files. For sandbox credentials, add a repo variable `PAYPAL_ENV` = `sandbox`.
- The PayPal app needs **Transaction search** turned on in the PayPal developer dashboard.

The **Sync ticket sales** GitHub Action runs every hour. `scripts/sync_tickets.py`
reads sales from PayPal and writes `data/tickets.json`, which the admin page shows
by game. PayPal can take up to about 3 hours to report a sale. Refunded orders
drop off. Orders whose amount isn't $10 a ticket are flagged.

`data/tickets.json` is public like the rest of the site, so it holds only each
buyer's first initial, last name and ticket count. Emails and payments stay in PayPal.
To change the price, change `TICKET_PRICE` in both `js/payments.js` and `scripts/sync_tickets.py`.
