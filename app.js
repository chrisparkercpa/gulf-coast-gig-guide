"use strict";

/* ============================================================
   Gulf Coast Gig Guide
   Data source: Google Sheet (edit it from your phone; the site
   updates on the next page load — no GitHub upload needed).

   Sheet columns (first row, any order, case-insensitive):
   Date | Start Time | Artist | Venue | City | State | Genre |
   Cover | Source Link | Notes | Status

   Rows with a date in the past are hidden automatically.
   Rows whose Status contains "cancel" or "hide" are hidden.
   ============================================================ */

const SHEET_ID = "1TsdhW7CM3Xc-32GfzkUrQqn0K6TYrbAySX9z4kJrWRE";

// The sheet must be shared: Share -> Anyone with the link -> Viewer.
const SHEET_CSV_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&cacheBust=${Date.now()}`;

// For local testing you can load any CSV with ?csv=sample.csv
const DATA_URL = new URLSearchParams(location.search).get("csv") || SHEET_CSV_URL;

/* ---------- Regions ----------
   Each page declares its region with <body data-region="...">.
   Adding a market later is a new HTML file, not a code change. */
const REGIONS = {
  gulf: { states: ["FL", "AL", "MS"], label: "the Gulf Coast" },
  la:   { states: ["LA"], label: "Louisiana" }
};
const REGION = REGIONS[document.body.dataset.region] || REGIONS.gulf;

const el = {
  grid: document.getElementById("eventGrid"),
  summary: document.getElementById("summaryText"),
  empty: document.getElementById("emptyState"),
  errorBox: document.getElementById("errorState"),
  updated: document.getElementById("lastUpdated"),
  state: document.getElementById("stateFilter"),
  city: document.getElementById("cityFilter"),
  venue: document.getElementById("venueFilter"),
  genre: document.getElementById("genreFilter"),
  free: document.getElementById("freeFilter"),
  sort: document.getElementById("sortFilter")
};

let events = [];
let activeRange = "all";

/* ---------- CSV parsing (handles quoted fields and commas) ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}

/* ---------- Date handling ---------- */
function parseDate(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // 2026-07-24
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);            // 7/24/2026
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return new Date(y, +m[1] - 1, +m[2], 12, 0, 0);
  }
  const d = new Date(v);                                       // July 24, 2026
  if (!isNaN(d)) { d.setHours(12, 0, 0, 0); return d; }
  return null;
}
function startToday() { const d = new Date(); d.setHours(12, 0, 0, 0); return d; }
function daysFromToday(d) { return Math.round((d - startToday()) / 86400000); }
function formatDate(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/* ---------- Load the sheet ---------- */
function normalizeHeader(h) { return String(h || "").toLowerCase().replace(/[^a-z]/g, ""); }
const COLUMN_ALIASES = {
  date: "date", showdate: "date",
  starttime: "time", time: "time",
  artist: "artist", band: "artist",
  venue: "venue",
  city: "city", cityarea: "city",
  state: "state",
  genre: "genre",
  cover: "cover", covertickets: "cover", price: "cover",
  sourcelink: "source", source: "source", link: "source",
  notes: "notes",
  status: "status"
};

function rowsToEvents(rows) {
  if (!rows.length) return [];
  const map = {};
  rows[0].forEach((h, i) => {
    const key = COLUMN_ALIASES[normalizeHeader(h)];
    if (key && !(key in map)) map[key] = i;
  });
  if (!("date" in map) || !("artist" in map)) return [];
  const get = (row, key) => (key in map ? String(row[map[key]] || "").trim() : "");
  const list = [];
  rows.slice(1).forEach((row, i) => {
    const date = parseDate(get(row, "date"));
    if (!date) return;
    const status = get(row, "status").toLowerCase();
    if (status.includes("cancel") || status.includes("hide")) return;
    if (daysFromToday(date) < 0) return; // expired shows disappear automatically
    const st = get(row, "state").toUpperCase();
    if (st && !REGION.states.includes(st)) return; // other region's guide owns this row
    const cover = get(row, "cover");
    const venue = get(row, "venue"), city = get(row, "city"), state = get(row, "state");
    list.push({
      id: i,
      date, time: get(row, "time"),
      artist: get(row, "artist") || "TBA",
      venue, city, state,
      genre: get(row, "genre"),
      cover,
      free: /free|^\$?0(\.0+)?$|no cover/i.test(cover),
      source: get(row, "source"),
      notes: get(row, "notes"),
      directions: "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent([venue, city, state].filter(Boolean).join(", "))
    });
  });
  return list;
}

async function loadShows() {
  el.summary.textContent = "Loading shows…";
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error("Sheet is not shared publicly yet");
    events = rowsToEvents(parseCsv(text));
    buildFilterOptions();
    applyUrlFilters();
    el.errorBox.hidden = true;
    el.updated.textContent = "Updated " +
      new Date().toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
    render();
  } catch (err) {
    el.summary.textContent = "Couldn't load the show list.";
    el.errorBox.hidden = false;
    console.error(err);
  }
}

/* ---------- Filters ---------- */
function addOptions(select, values) {
  while (select.options.length > 1) select.remove(1);
  [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).forEach(value => {
    const option = document.createElement("option");
    option.value = value; option.textContent = value;
    select.appendChild(option);
  });
}
function buildFilterOptions() {
  addOptions(el.state, events.map(x => x.state));
  addOptions(el.city, events.map(x => x.city));
  addOptions(el.venue, events.map(x => x.venue));
  addOptions(el.genre, events.map(x => x.genre));
}

function dateMatches(date) {
  if (activeRange === "all") return true;
  const diff = daysFromToday(date);
  if (activeRange === "today") return diff === 0;
  if (activeRange === "tomorrow") return diff === 1;
  if (activeRange === "7days") return diff >= 0 && diff <= 6;
  if (activeRange === "weekend") {
    const today = startToday();
    const day = today.getDay();
    const daysToFriday = (5 - day + 7) % 7;
    const friday = new Date(today); friday.setDate(today.getDate() + daysToFriday);
    const monday = new Date(friday); monday.setDate(friday.getDate() + 3);
    return date >= friday && date < monday;
  }
  return true;
}
function selected(select) { return select.value === "all" ? null : select.value; }

/* ---------- Shareable / QR deep links ----------
   Filters live in the URL, so any view can be linked to directly:
     ?venue=Sharky%27s%20Beachfront%20Restaurant
     ?city=Grayton%20Beach&when=today
     ?free=1&when=weekend
   To make a QR target: set the filters on the page, then copy the URL. */
const VALID_RANGES = ["all", "today", "tomorrow", "weekend", "7days"];

function applyUrlFilters() {
  const p = new URLSearchParams(location.search);
  const set = (sel, v) => {
    if (v && Array.from(sel.options).some(o => o.value === v)) sel.value = v;
  };
  set(el.state, p.get("state"));
  set(el.city, p.get("city"));
  set(el.venue, p.get("venue"));
  set(el.genre, p.get("genre"));
  if (p.get("free") === "1") el.free.checked = true;
  const sort = p.get("sort");
  if (sort && Array.from(el.sort.options).some(o => o.value === sort)) el.sort.value = sort;
  const when = p.get("when");
  if (when && VALID_RANGES.includes(when)) {
    activeRange = when;
    document.querySelectorAll("button[data-range]")
      .forEach(x => x.classList.toggle("active", x.dataset.range === when));
  }
}

function syncUrl() {
  const p = new URLSearchParams();
  const csv = new URLSearchParams(location.search).get("csv");
  if (csv) p.set("csv", csv);            // keep local-testing override intact
  if (el.state.value !== "all") p.set("state", el.state.value);
  if (el.city.value !== "all") p.set("city", el.city.value);
  if (el.venue.value !== "all") p.set("venue", el.venue.value);
  if (el.genre.value !== "all") p.set("genre", el.genre.value);
  if (el.free.checked) p.set("free", "1");
  if (el.sort.value !== "date") p.set("sort", el.sort.value);
  if (activeRange !== "all") p.set("when", activeRange);
  const qs = p.toString();
  history.replaceState(null, "", qs ? location.pathname + "?" + qs : location.pathname);
}
function getFiltered() {
  const f = { state: selected(el.state), city: selected(el.city), venue: selected(el.venue), genre: selected(el.genre) };
  const list = events.filter(x =>
    dateMatches(x.date) &&
    (!f.state || x.state === f.state) &&
    (!f.city || x.city === f.city) &&
    (!f.venue || x.venue === f.venue) &&
    (!f.genre || x.genre === f.genre) &&
    (!el.free.checked || x.free));
  const byDate = (a, b) => a.date - b.date || String(a.time).localeCompare(String(b.time));
  list.sort((a, b) =>
    el.sort.value === "city" ? a.city.localeCompare(b.city) || byDate(a, b) :
    el.sort.value === "venue" ? a.venue.localeCompare(b.venue) || byDate(a, b) :
    byDate(a, b));
  return list;
}

/* ---------- Rendering ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(u) {
  try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : ""; }
  catch { return ""; }
}
function card(x) {
  const article = document.createElement("article");
  article.className = "event-card";
  const source = safeUrl(x.source);
  article.innerHTML =
    `<div class="event-top"><div class="date">${escapeHtml(formatDate(x.date))}${x.time ? " • " + escapeHtml(x.time) : ""}</div>` +
    `<h3>${escapeHtml(x.artist)}</h3></div>` +
    `<div class="event-body">` +
    `<p class="venue">${escapeHtml(x.venue)}</p>` +
    `<p class="meta">${escapeHtml([x.city, x.state].filter(Boolean).join(", "))}</p>` +
    `<div class="badges">` +
    (x.genre ? `<span class="badge">${escapeHtml(x.genre)}</span>` : "") +
    (x.free ? `<span class="badge">Free</span>` : (x.cover ? `<span class="badge">${escapeHtml(x.cover)}</span>` : "")) +
    `</div>` +
    (x.notes ? `<p class="meta">${escapeHtml(x.notes)}</p>` : "") +
    `<div class="card-actions">` +
    (source ? `<a class="details" href="${source}" target="_blank" rel="noopener">Source</a>` : "") +
    `<a class="directions" href="${x.directions}" target="_blank" rel="noopener">Directions</a>` +
    `</div></div>`;
  return article;
}

/* ---------- Compact list view (narrow screens) ----------
   Below 620px the card grid becomes a day-grouped list: the date
   moves into a divider so each row only carries the time, and the
   whole row is the link. Desktop and tablet keep the card grid. */
const compactMQ = window.matchMedia("(max-width: 620px)");
const PIN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" ' +
  'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
  '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>';

function dayBar(d, count) {
  const div = document.createElement("div");
  div.className = "daybar";
  const diff = daysFromToday(d);
  const label = diff === 0 ? "Tonight" : diff === 1 ? "Tomorrow"
    : d.toLocaleDateString(undefined, { weekday: "long" });
  div.innerHTML =
    `<span class="dow">${escapeHtml(label)}</span>` +
    `<span class="dnum">${escapeHtml(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</span>` +
    `<span class="cnt">${count} show${count === 1 ? "" : "s"}</span>`;
  return div;
}

function listRow(x) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  const source = safeUrl(x.source);
  const t = String(x.time || "").trim();
  const m = t.match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i);
  const hm = m ? m[1] : (t || "—");
  const ap = m ? m[2].toUpperCase() : "";
  const badge =
    (x.genre ? `<span class="badge">${escapeHtml(x.genre)}</span>` : "") +
    (x.free ? `<span class="badge">Free</span>`
            : (x.cover ? `<span class="badge">${escapeHtml(x.cover)}</span>` : ""));
  const title = source
    ? `<a class="act" href="${source}" target="_blank" rel="noopener">${escapeHtml(x.artist)}</a>`
    : `<span class="act">${escapeHtml(x.artist)}</span>`;
  wrap.innerHTML =
    `<span class="when"><span class="h">${escapeHtml(hm)}</span>` +
    (ap ? `<span class="ap">${escapeHtml(ap)}</span>` : "") + `</span>` +
    `<span class="what">${title}` +
    `<span class="loc">${escapeHtml([x.venue, x.city].filter(Boolean).join(" · "))}</span>` +
    (badge ? `<span class="tags">${badge}</span>` : "") +
    `</span>` +
    `<a class="pin" href="${x.directions}" target="_blank" rel="noopener" ` +
    `aria-label="Directions to ${escapeHtml(x.venue || "venue")}">${PIN_SVG}</a>`;
  return wrap;
}

function render() {
  const list = getFiltered();
  const compact = compactMQ.matches;
  el.grid.classList.toggle("list-mode", compact);

  if (!compact) {
    el.grid.replaceChildren(...list.map(card));
  } else {
    // Only group by day when the list is actually in date order.
    const group = el.sort.value === "date";
    const counts = {};
    if (group) list.forEach(x => {
      const k = x.date.toDateString();
      counts[k] = (counts[k] || 0) + 1;
    });
    const nodes = [];
    let current = "";
    list.forEach(x => {
      if (group) {
        const k = x.date.toDateString();
        if (k !== current) { current = k; nodes.push(dayBar(x.date, counts[k])); }
      }
      nodes.push(listRow(x));
    });
    el.grid.replaceChildren(...nodes);
  }

  el.summary.textContent = `Showing ${list.length} of ${events.length} upcoming shows`;
  el.empty.hidden = list.length !== 0 || events.length === 0;
  syncUrl();
}

// Re-render when crossing the breakpoint (rotation, resize).
if (compactMQ.addEventListener) compactMQ.addEventListener("change", render);
else if (compactMQ.addListener) compactMQ.addListener(render);

/* ---------- Events ---------- */
document.getElementById("dateButtons").addEventListener("click", e => {
  const b = e.target.closest("button[data-range]");
  if (!b) return;
  activeRange = b.dataset.range;
  document.querySelectorAll("button[data-range]").forEach(x => x.classList.toggle("active", x === b));
  render();
});
[el.state, el.city, el.venue, el.genre, el.free, el.sort].forEach(c => c.addEventListener("change", render));
document.getElementById("resetButton").addEventListener("click", () => {
  activeRange = "all";
  document.querySelectorAll("button[data-range]").forEach(x => x.classList.toggle("active", x.dataset.range === "all"));
  [el.state, el.city, el.venue, el.genre].forEach(x => x.value = "all");
  el.free.checked = false;
  el.sort.value = "date";
  render();
});
document.getElementById("refreshButton").addEventListener("click", loadShows);

loadShows();
