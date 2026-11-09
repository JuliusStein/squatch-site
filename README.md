# Salem Sasquatch site

Live at https://salemsasquatch.com. The schedule comes from the team's
SportsEngine calendar and refreshes every 3 hours.

## Adding a final score

Edit [`scores.json`](scores.json) on GitHub (pencil icon) and add a line for
the game, keyed by its date:

```json
"2026-11-14": { "salem": 3, "opponent": 2 },
```

- `salem` is our goals, `opponent` is theirs; W/L is worked out from those.
- Optional: `"note": "OT"` or `"note": "SO"`.
- Every line except the last needs a trailing comma.

Commit the change and the site redeploys in a minute or two. If the date
doesn't match a game, the deploy log shows a warning.
