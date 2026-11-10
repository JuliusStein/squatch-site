(async function () {
  const POSITIONS = { F: "Forward", D: "Defense", G: "Goalie" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  document.getElementById("year").textContent = new Date().getFullYear();
  loadRecord();

  const listEl = document.getElementById("player-list");
  let roster;
  try {
    const res = await fetch("roster.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    roster = await res.json();
  } catch (err) {
    console.error("Could not load roster:", err);
    listEl.outerHTML = '<p class="empty">The roster couldn\'t be loaded right now. Please try again shortly.</p>';
    return;
  }

  document.getElementById("roster-season").textContent = `${roster.season} Season`;

  // Sort by number; players without one go last, by name.
  const players = roster.players.map((p) => ({ ...p, positions: p.position ? p.position.split("/") : [] }))
    .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.name.localeCompare(b.name));

  function card(numberHtml, name, sub) {
    return `
      <li class="player">
        <div class="jersey" aria-hidden="true">${numberHtml}</div>
        <div>
          <p class="player-name">${esc(name)}</p>
          <p class="player-pos">${esc(sub)}</p>
        </div>
      </li>`;
  }

  let filter = "all";
  function render() {
    const shown = players.filter((p) => filter === "all" || p.positions.includes(filter));
    listEl.innerHTML = shown.map((p) => card(
      p.number != null ? esc(p.number) : '<span class="jersey-none">–</span>',
      p.name,
      p.positions.map((x) => POSITIONS[x]).join(" / ") || "Player",
    )).join("");
  }

  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      render();
    });
  });

  document.getElementById("staff-list").innerHTML = roster.staff.map((s) => card(
    esc(s.name.split(" ").map((w) => w[0]).join("")),
    s.name,
    s.title,
  )).join("");

  render();
})();
