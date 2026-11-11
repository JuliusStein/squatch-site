// Box score for one finished game: game.html?id=<league game id>.
// Data comes from data/games/<id>.json, written by scripts/update_league_data.py.
(async function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const minutes = (m) => { const [a, b] = String(m).split(":").map(Number); return (a || 0) + (b || 0) / 60; };
  const pct3 = (v) => (v >= 1 ? "1.000" : Number(v || 0).toFixed(3).replace(/^0/, ""));
  // "1" -> "1st", "OT1" -> "OT" (or "OT1" when there was more than one), "SO" stays.
  const periodName = (p, all) => {
    if (/^\d+$/.test(p)) return { 1: "1st", 2: "2nd", 3: "3rd" }[p] || `${p}th`;
    if (/^OT1$/i.test(p) && !all.some((q) => /^OT2$/i.test(q))) return "OT";
    return p;
  };
  const periodTitle = (label) => {
    const p = label.replace(/\s*Period$/i, "");
    if (/^OT1?$/i.test(p)) return "Overtime";
    if (/^OT\d+$/i.test(p)) return `Overtime ${p.slice(2)}`;
    if (/^SO$/i.test(p)) return "Shootout";
    return `${p} Period`;
  };

  document.getElementById("year").textContent = new Date().getFullYear();
  loadRecord();

  const out = document.getElementById("game-out");
  const id = new URLSearchParams(location.search).get("id") || "";
  const fail = (msg) => { out.innerHTML = `<p class="empty">${msg} <a href="./#schedule">Back to the schedule</a>.</p>`; };
  if (!/^\d+$/.test(id)) return fail("No game was picked.");

  const get = (f) => fetch(f, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [game, schedule] = await Promise.all([get(`data/games/${id}.json`), get("data/schedule.json")]);
  if (!game) return fail("The box score for this game isn't available yet. Box scores are added on the Monday after each game.");
  const meta = (schedule?.games || []).find((g) => g.id === id);

  document.getElementById("game-source").href = `https://www.thecohl.com/game/show/${id}`;
  const updated = new Date(game.updated);
  if (!isNaN(updated)) {
    document.getElementById("game-updated").textContent =
      `Updated ${updated.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;
  }

  const teams = game.teams;
  const [away, home] = teams;
  const us = teams.find((t) => t.us) || home;
  const them = teams.find((t) => t !== us);
  const total = (t) => t.goals[t.goals.length - 1];
  const result = total(us) > total(them) ? "W" : total(us) < total(them) ? "L" : "T";
  const shortName = (name) => (name === us.name ? "Salem" : name);

  // ---- Header ----
  const final = `Final${game.note ? `/${game.note}` : ""}`;
  let when = final;
  if (meta) {
    const [y, m, d] = meta.date.split("-").map(Number);
    when = `${final} · ${new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`;
    document.getElementById("game-where").textContent = [meta.time, meta.location].filter(Boolean).join(" · ");
  }
  document.getElementById("game-when").textContent = when;
  document.getElementById("game-title").textContent = `${shortName(away.name)} @ ${shortName(home.name)}`;
  document.title = `${shortName(away.name)} ${total(away)}, ${shortName(home.name)} ${total(home)} · Salem Sasquatch Hockey`;

  const scoreboard = `
    <div class="scoreboard result-${result.toLowerCase()}">
      ${teams.map((t) => `
        <div class="sb-team${t.us ? " is-us" : ""}${total(t) > total(teams.find((o) => o !== t)) ? " is-winner" : ""}">
          <span class="sb-side">${t === home ? "Home" : "Away"}</span>
          <span class="sb-name">${esc(t.name)}</span>
          <span class="sb-score">${total(t)}</span>
          <span class="sb-shots">${t.shots ? `${t.shots[t.shots.length - 1]} shots` : ""}</span>
        </div>`).join("")}
      <div class="sb-final"><span class="score-result">${result}</span>${final}</div>
    </div>`;

  // ---- Tables ----
  const table = (head, rows, cls = "") => `
    <div class="standings-scroll">
      <table class="standings-table stats-table ${cls}">
        <thead><tr>${head.map(([h, c = "", title = ""]) => `<th scope="col" class="${c}"${title ? ` title="${title}"` : ""}>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>`;

  const periods = game.periods.map((p) => periodName(p, game.periods));
  const lineTable = (field, label) => teams[0][field] ? table(
    [[label, "col-team"], ...periods.map((p) => [p]), ["T", "col-pts"]],
    teams.map((t) => `<tr${t.us ? ' class="is-us"' : ""}><th scope="row" class="col-team">${esc(t.name)}</th>${
      t[field].map((v, i) => `<td class="${i === t[field].length - 1 ? "col-pts" : ""}">${v}</td>`).join("")}</tr>`),
    "line-table") : "";

  const special = table(
    [["Team", "col-team"], ["Power play"], ["Penalties", "col-x"]],
    teams.map((t) => `<tr${t.us ? ' class="is-us"' : ""}><th scope="row" class="col-team">${esc(t.name)}</th>
      <td>${esc(t.powerPlay || "–")}</td><td class="col-x">${esc(t.penaltySummary || "–")}</td></tr>`));

  // ---- Scoring and penalty plays, grouped by period ----
  const who = (p) => (p ? `${p.number != null ? `<span class="play-num">#${p.number}</span> ` : ""}${esc(p.name)}` : "");
  const byPeriod = (plays, render) => {
    if (!plays.length) return "";
    const groups = [];
    for (const p of plays) {
      if (!groups.length || groups[groups.length - 1].period !== p.period) groups.push({ period: p.period, plays: [] });
      groups[groups.length - 1].plays.push(p);
    }
    return groups.map((g) => `
      <h4 class="play-period">${esc(periodTitle(g.period))}</h4>
      <ol class="plays">${g.plays.map(render).join("")}</ol>`).join("");
  };
  const usIndex = teams.indexOf(us);
  const goalRow = (g) => {
    const ours = g.team === us.name;
    const [a, b] = g.score || [];
    const mine = usIndex === 0 ? a : b, theirs = usIndex === 0 ? b : a;
    const strength = g.strength && !/^even/i.test(g.strength) ? `<span class="play-tag">${esc(g.strength)}</span>` : "";
    return `
      <li class="play${ours ? " is-us" : ""}">
        <span class="play-clock">${esc(g.clock)}</span>
        <div class="play-main">
          <span class="play-team">${esc(g.team)}</span>
          <span class="play-who">${g.scorer ? who(g.scorer) : esc(g.text)}${strength}</span>
          <span class="play-assists">${g.assists.length ? `Assists: ${g.assists.map(who).join(", ")}` : "Unassisted"}</span>
        </div>
        ${g.score ? `<span class="play-score" title="Salem–${esc(them.name)}">${mine}–${theirs}</span>` : ""}
      </li>`;
  };
  const penaltyRow = (p) => `
    <li class="play${p.team === us.name ? " is-us" : ""}">
      <span class="play-clock">${esc(p.clock)}</span>
      <div class="play-main">
        <span class="play-team">${esc(p.team)}</span>
        <span class="play-who">${p.player ? who(p.player) : "Bench"}</span>
        <span class="play-assists">${esc(p.infraction)}</span>
      </div>
      ${p.minutes != null ? `<span class="play-pim">${p.minutes} min</span>` : ""}
    </li>`;

  // ---- Players: Salem first ----
  const playerTables = [us, them].map((t) => {
    const skaters = [...(t.skaters || [])].sort((a, b) => b.pts - a.pts || b.g - a.g || (a.number ?? 999) - (b.number ?? 999));
    const goalies = (t.goalies || []).filter((g) => minutes(g.min) > 0);
    return `
      <h3 class="stats-subtitle">${esc(t.name)}</h3>
      ${table(
        [["#", "col-rank"], ["Skater", "col-team"], ["G"], ["A"], ["PTS", "col-pts"], ["SOG", "", "Shots on goal"], ["PIM", "", "Penalty minutes"], ["+/−", "col-x", "Plus / minus"]],
        skaters.map((s) => `<tr><td class="col-rank">${s.number ?? ""}</td><th scope="row" class="col-team">${esc(s.name)}</th>
          <td>${s.g ?? 0}</td><td>${s.a ?? 0}</td><td class="col-pts">${s.pts ?? 0}</td><td>${s.sog ?? 0}</td><td>${s.pim ?? 0}</td><td class="col-x">${s.plusMinus ?? 0}</td></tr>`))}
      ${goalies.length ? table(
        [["#", "col-rank"], ["Goalie", "col-team"], ["MIN", "col-x"], ["SA", "", "Shots against"], ["GA", "", "Goals against"], ["SV", "col-x", "Saves"], ["SV%", "col-pts", "Save percentage"]],
        goalies.map((g) => `<tr><td class="col-rank">${g.number ?? ""}</td><th scope="row" class="col-team">${esc(g.name)}</th>
          <td class="col-x">${esc(g.min)}</td><td>${g.sog ?? 0}</td><td>${g.ga ?? 0}</td><td class="col-x">${g.sv ?? 0}</td><td class="col-pts">${pct3(g.svPct)}</td></tr>`),
        "goalie-table") : ""}`;
  }).join("");

  out.innerHTML = `
    ${scoreboard}
    <h2 class="division-title">Line score</h2>
    ${lineTable("goals", "Goals")}
    ${lineTable("shots", "Shots")}
    ${special}
    <h2 class="division-title">Scoring</h2>
    ${byPeriod(game.scoring, goalRow) || '<p class="empty">No goals.</p>'}
    <h2 class="division-title">Penalties</h2>
    ${byPeriod(game.penalties, penaltyRow) || '<p class="empty">No penalties.</p>'}
    <h2 class="division-title">Players</h2>
    ${playerTables}`;
})();
