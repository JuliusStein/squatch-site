// Season record in the header, shared by every page: W–L–OTL, as the league counts it
// (an overtime or shootout loss is an OTL). Pages that already load the schedule call
// showRecord(games) themselves; others call loadRecord() to fetch it.
function showRecord(games) {
  const tally = { W: 0, L: 0, OTL: 0, T: 0 };
  for (const g of games) {
    if (!g.score) continue;
    const r = g.score.result;
    tally[r === "L" && g.score.note ? "OTL" : r]++;
  }
  if (!(tally.W + tally.L + tally.OTL + tally.T)) return;
  const parts = [tally.W, tally.L, tally.OTL].concat(tally.T ? [tally.T] : []);
  const el = document.getElementById("record");
  el.innerHTML = `<span class="record-label">Record</span><span class="record-value">${parts.join("–")}</span>`;
  el.title = `Season record: ${tally.W} wins, ${tally.L} losses, ${tally.OTL} overtime/shootout losses${tally.T ? `, ${tally.T} ties` : ""}`;
  el.hidden = false;
}

async function loadRecord() {
  try {
    const res = await fetch("data/schedule.json", { cache: "no-cache" });
    if (res.ok) showRecord((await res.json()).games);
  } catch (err) {
    console.error("Could not load record:", err);
  }
}
