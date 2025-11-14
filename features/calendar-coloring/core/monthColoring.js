// LOCKED CALENDAR COLORING FEATURE - DO NOT MODIFY
// This module contains the month view coloring functionality
// All changes to calendar coloring should be made here only

// Month view painter
// Colors the grid cells ([role="gridcell"]) by mapping the 7 columns → weekdays.
// Safe for locales / Monday-or-Sunday week start. No event-chip dependency.

let monthMo = null;
let resizeBound = false;

// idempotent clear - only clear div.MGaLHf.ChfiMc elements (NOT gridcells)
function clearMonthColors() {
  document.querySelectorAll('div.MGaLHf.ChfiMc[data-gce-month-painted="1"]').forEach((el) => {
    el.style.backgroundColor = '';
    el.removeAttribute('data-gce-month-painted');
  });
  console.log('CC3 Month Coloring: Cleared div.MGaLHf.ChfiMc elements only');
}

function isLikelyMonthViewRoot() {
  // The month grid is a [role="grid"] with many [role="gridcell"] entries.
  const grid = document.querySelector('div[role="grid"]');
  if (!grid) return null;
  const cells = grid.querySelectorAll('[role="gridcell"]');
  if (cells.length >= 35) return grid; // month usually 35-42 cells
  return null;
}

function selectMonthCells() {
  // Target ONLY the div.MGaLHf.ChfiMc elements (day squares) - NOT gridcells
  const daySquares = Array.from(document.querySelectorAll('div.MGaLHf.ChfiMc')).filter((c) => c.offsetParent !== null);
  console.log(`CC3 Month Coloring: Found ${daySquares.length} div.MGaLHf.ChfiMc elements`);

  // Handle both 5-column (weekends hidden) and 7-column (weekends shown) layouts
  // 5 columns = ~25 cells, 7 columns = ~35 cells
  const minCells = daySquares.length >= 25 ? 25 : 35;
  return daySquares.length >= minCells ? daySquares : [];
}

function getDaySquare(cell) {
  // Since we're now targeting div.MGaLHf.ChfiMc directly, return the cell itself
  return cell;
}

// -------- NEW: Column headers → weekday map (most reliable) -----------------
function textToWeekdayIndex(txt) {
  if (!txt) return null;
  const t = txt.trim().toLowerCase();
  // Try English/short forms first; aria-labels are usually full day names in locale.
  const map = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };
  if (t in map) return map[t];
  // For other locales, rely on Date parsing trick: find next occurrence of that label in aria-label if possible.
  // If we can't confidently map, return null and let fallback handle it.
  return null;
}

function headerColumnWeekdayMap() {
  // Month grid usually has 7 column headers with role="columnheader".
  const headers = Array.from(document.querySelectorAll('[role="columnheader"]')).filter((h) => h.offsetParent !== null);
  if (headers.length < 7) return null;

  // Sort by x-position to get visual order
  const items = headers
    .map((h) => {
      const r = h.getBoundingClientRect();
      return { el: h, center: (r.left + r.right) / 2 };
    })
    .sort((a, b) => a.center - b.center)
    .slice(0, 7);

  const arr = new Array(7).fill(null);
  for (let i = 0; i < items.length; i++) {
    const h = items[i].el;
    const w = textToWeekdayIndex(h.getAttribute('aria-label')) ?? textToWeekdayIndex(h.textContent || '');
    if (w === null) return null; // unknown locale → bail and let fallback handle it
    arr[i] = w;
  }
  return arr.every((v) => v !== null) ? arr : null;
}

// --- NEW: Robust weekday extraction per gridcell -----------------------------
function parseDateFromAriaLabel(aria) {
  // Works for many locales (e.g., "Tuesday, September 2, 2025" or without year).
  // Let Date try first:
  const d1 = new Date(aria);
  if (!Number.isNaN(d1.getTime())) return d1;
  // Fallback: pick numeric pieces "dd", "mm" (month name not guaranteed parseable)
  // Common GCal aria-label often includes an ISO-like "2025" — try regex:
  const m = aria.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/); // dd .. mm .. yyyy
  if (m) {
    // Ambiguous order; try two orders safely:
    const [_, a, b, y] = m;
    const try1 = new Date(Number(y), Number(b) - 1, Number(a));
    if (!Number.isNaN(try1.getTime())) return try1;
    const try2 = new Date(Number(y), Number(a) - 1, Number(b));
    if (!Number.isNaN(try2.getTime())) return try2;
  }
  return null;
}

function getCellWeekday(cell) {
  // 0..6 Sun..Sat or null if unknown
  // 1) aria-label on gridcell
  const aria = cell.getAttribute('aria-label');
  if (aria) {
    const d = parseDateFromAriaLabel(aria);
    if (d && !Number.isNaN(d.getTime())) return d.getDay();
  }
  // 2) time[datetime] descendant (ISO)
  const t = cell.querySelector('time[datetime]');
  if (t && t.getAttribute('datetime')) {
    const d2 = new Date(t.getAttribute('datetime'));
    if (!Number.isNaN(d2.getTime())) return d2.getDay();
  }
  // 3) common data attributes Google sometimes emits
  // Try milliseconds since epoch if present
  const msAttr =
    cell.getAttribute('data-date') || cell.getAttribute('data-time') || cell.getAttribute('data-timestamp');
  if (msAttr && /^\d{10,13}$/.test(msAttr)) {
    const ms = msAttr.length === 13 ? Number(msAttr) : Number(msAttr) * 1000;
    const d3 = new Date(ms);
    if (!Number.isNaN(d3.getTime())) return d3.getDay();
  }
  return null;
}

// --- NEW: Get the day number from a cell -----------------------------
function getCellDayNumber(cell) {
  // Extract the day number (1-31) from the cell content
  const daySquare = getDaySquare(cell);
  const text = daySquare.textContent?.trim();

  // Try to extract a number from the text
  if (text) {
    const match = text.match(/^(\d{1,2})/);
    if (match) {
      const dayNum = parseInt(match[1], 10);
      if (dayNum >= 1 && dayNum <= 31) {
        return dayNum;
      }
    }
  }

  // Fallback to data attributes
  const aria = cell.getAttribute('aria-label');
  if (aria) {
    const match = aria.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
    if (match) {
      const dayNum = parseInt(match[1], 10);
      if (dayNum >= 1 && dayNum <= 31) {
        return dayNum;
      }
    }
  }

  return null;
}

function clusterColumns(cells) {
  // Use centerX and adaptive tolerance based on median column width
  const points = cells
    .map((c) => {
      const r = getDaySquare(c).getBoundingClientRect();
      return { c, left: r.left, right: r.right, center: (r.left + r.right) / 2 };
    })
    .sort((a, b) => a.center - b.center);

  // Estimate typical column width using median
  const widths = [];
  for (let i = 1; i < points.length; i++) {
    // only same-row neighbors; rough filter using similar top
    if (
      Math.abs(
        getDaySquare(points[i].c).getBoundingClientRect().top -
          getDaySquare(points[i - 1].c).getBoundingClientRect().top,
      ) < 4
    ) {
      widths.push(points[i].left - points[i - 1].left);
    }
  }
  const median = (arr) => {
    if (!arr.length) return 100; // sane default
    const s = [...arr].sort((x, y) => x - y);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const approxColWidth = Math.max(40, Math.min(400, median(widths) || 100));
  const tolerance = Math.max(4, Math.round(approxColWidth * 0.25)); // 25% of width

  const cols = [];
  for (const p of points) {
    const hit = cols.find((col) => Math.abs(col.center - p.center) <= tolerance);
    if (hit) hit.members.push(p.c);
    else cols.push({ center: p.center, members: [p.c] });
  }
  cols.sort((a, b) => a.center - b.center);
  // Return all columns found (could be 5 for weekends hidden, or 7 for weekends shown)
  return cols;
}

// --- NEW: Assign column position based on user's week start setting --------
function computeColumnPositionMap(cols, startWeekDay) {
  // Create a mapping from column index to weekday (0-6, Sun-Sat) based on user's week start setting
  const map = new Array(cols.length).fill(0);

  console.log(
    'CC3 Month Coloring: Computing column position map with startWeekDay:',
    startWeekDay,
    'for',
    cols.length,
    'columns',
  );

  if (cols.length === 5) {
    // When weekends are hidden, Google Calendar always shows Monday-Friday (weekdays 1-5)
    // Map columns 0-4 to weekdays 1-5 (Monday-Friday)
    for (let colIndex = 0; colIndex < 5; colIndex++) {
      const weekday = colIndex + 1; // Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5
      map[colIndex] = weekday;
      console.log(
        `CC3 Month Coloring: Column ${colIndex} -> Weekday ${weekday} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]}) - weekends hidden`,
      );
    }
  } else if (cols.length === 7) {
    // When weekends are shown, use the user's week start setting
    // startWeekDay: 0=Sunday, 1=Monday, 6=Saturday
    for (let colIndex = 0; colIndex < 7; colIndex++) {
      const weekday = (colIndex + startWeekDay) % 7;
      map[colIndex] = weekday;
      console.log(
        `CC3 Month Coloring: Column ${colIndex} -> Weekday ${weekday} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]}) based on user setting`,
      );
    }
  }

  console.log('CC3 Month Coloring: Final column mapping:', map);
  return map;
}

// Helper function to convert hex color to rgba with opacity
function hexToRgba(hex, alpha) {
  if (!hex || hex === '#ffffff') return `rgba(255, 255, 255, ${alpha})`;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyMonthViewColors(userColors, opts) {
  const startWeekDay = opts?.assumeWeekStartsOn ?? 0; // 0=Sunday, 1=Monday, 6=Saturday
  const userOpacity = opts?.opacity || {};

  const paint = () => {
    clearMonthColors();
    const cells = selectMonthCells();
    if (!cells.length) return;
    const cols = clusterColumns(cells);

    // Handle both 5-column (weekends hidden) and 7-column (weekends shown) layouts
    if (cols.length !== 5 && cols.length !== 7) {
      console.log(`CC3 Month Coloring: Unexpected column count: ${cols.length}, expected 5 or 7`);
      return;
    }

    console.log(
      `CC3 Month Coloring: Found ${cols.length} columns (weekends ${cols.length === 5 ? 'hidden' : 'shown'})`,
    );

    // Compute column position map based on day numbers
    const colToPosition = computeColumnPositionMap(cols, startWeekDay);

    cols.forEach((col, cIdx) => {
      const weekday = colToPosition[cIdx];
      const color = userColors[weekday];
      const opacity = userOpacity[weekday] || 30; // Default to 30% if not set
      console.log(
        `CC3 Month Coloring: Column ${cIdx} (weekday ${weekday} - ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]}) -> color:`,
        color,
        'opacity:',
        opacity,
      );
      if (!color) return;

      // Convert hex color to rgba with opacity
      const rgba = hexToRgba(color, opacity / 100);

      for (const cell of col.members) {
        // Apply color with opacity to the div.MGaLHf.ChfiMc background
        cell.style.setProperty('background-color', rgba, 'important');
        cell.setAttribute('data-gce-month-painted', '1');
      }
    });
  };

  // Paint now
  // Double-RAF to avoid painting during GCal's transition frame
  requestAnimationFrame(() => requestAnimationFrame(paint));

  // Observe DOM churn inside the month grid (navigation, redraws)
  const root = isLikelyMonthViewRoot() ?? document.body;
  if (monthMo) monthMo.disconnect();
  monthMo = new MutationObserver(() => {
    cancelAnimationFrame(paint.__raf || 0);
    paint.__raf = requestAnimationFrame(() => {
      // settle one more frame after layout
      requestAnimationFrame(paint);
    });
  });
  monthMo.observe(root, { childList: true, subtree: true, attributes: true });

  // Repaint on resize (column positions shift)
  if (!resizeBound) {
    window.addEventListener(
      'resize',
      () => {
        cancelAnimationFrame(paint.__raf || 0);
        paint.__raf = requestAnimationFrame(paint);
      },
      { passive: true },
    );
    resizeBound = true;
  }
}

function teardownMonthPainter() {
  if (monthMo) {
    monthMo.disconnect();
    monthMo = null;
  }
  clearMonthColors();
}

// Export functions for use in the feature system
window.cc3MonthColoring = {
  applyMonthViewColors,
  teardownMonthPainter,
  clearMonthColors,
};
