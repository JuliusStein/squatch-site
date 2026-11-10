// Season record in the header, shared by every page.
// Pages that already load the schedule call showRecord(games) themselves;
// others call loadRecord() to fetch it.
function showRecord(games) {
  const tally = { W: 0, L: 0, T: 0 };
  for (const g of games) if (g.score) tally[g.score.result]++;
  if (!(tally.W + tally.L + tally.T)) return;
  const parts = [tally.W, tally.L].concat(tally.T ? [tally.T] : []);
  const el = document.getElementById("record");
  el.innerHTML = `<span class="record-label">Record</span><span class="record-value">${parts.join("–")}</span>`;
  el.title = `Season record: ${tally.W} wins, ${tally.L} losses${tally.T ? `, ${tally.T} ties` : ""}`;
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
