# Day Coloring Feature - Complete Analysis

**Generated**: 2025-11-29
**Purpose**: Comprehensive analysis of the day coloring feature implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Flow](#data-flow)
4. [Component Breakdown](#component-breakdown)
5. [How It Works](#how-it-works)
6. [Storage Schema](#storage-schema)
7. [User Interface](#user-interface)
8. [Technical Implementation Details](#technical-implementation-details)
9. [Edge Cases & Reliability](#edge-cases--reliability)
10. [Performance Considerations](#performance-considerations)

---

## Overview

### What It Does

The day coloring feature applies customizable background tints to weekday columns in Google Calendar, making it easier to visually distinguish days at a glance.

**Key Capabilities**:
- ✅ Color each weekday (Sun-Sat) independently
- ✅ Adjust opacity per weekday (0-100%)
- ✅ Works across all calendar views (Day, Week, Month)
- ✅ Supports different week start settings (Sun/Mon/Sat)
- ✅ Real-time preview in popup UI
- ✅ Survives Google Calendar navigation/DOM changes
- ✅ Multi-locale support

### File Structure

```
features/calendar-coloring/
├── index.js                    # Entry point (mostly comments, delegates to core)
├── core/
│   ├── dayColoring.js          # Main coloring logic (1178 lines)
│   └── monthColoring.js        # Month view specific logic (359 lines)
└── utils/
    └── dateUtils.js            # Date parsing utilities (437 lines)

lib/storage.js                  # Storage API for weekday colors/opacity
popup/popup.js                  # UI controls for day coloring
popup/popup.html                # UI markup (7 day-color-item sections)
content/featureRegistry.js      # Feature lifecycle management
```

---

## Architecture

### High-Level Flow

```
User Sets Color/Opacity in Popup
         ↓
  Storage (Chrome Sync)
         ↓
  Feature Registry detects change
         ↓
  dayColoring.onSettingsChanged()
         ↓
  Apply colors via CSS + Direct DOM
         ↓
  MutationObservers watch for changes
         ↓
  Reapply colors when needed
```

### Three Rendering Strategies

The feature uses **different strategies** for different calendar views:

1. **Week View**: CSS-based (nth-child selectors)
2. **Day View**: CSS + Direct DOM styling (aggressive persistence)
3. **Month View**: JavaScript-based direct painting (div.MGaLHf.ChfiMc elements)

---

## Data Flow

### 1. User Changes Color in Popup

**File**: `popup/popup.js`

```javascript
// User clicks color swatch in palette
colorSwatch.onclick = async (e) => {
  const color = e.target.dataset.color;
  const dayIndex = parseInt(paletteEl.dataset.day);

  // Save to storage (triggers sync across tabs)
  settings = await window.cc3Storage.setWeekdayColor(dayIndex, color);

  // Also reset opacity to 100% when new color selected
  settings = await window.cc3Storage.setWeekdayOpacity(dayIndex, 100);

  // Update local preview
  updatePreview(dayIndex, color, 100);

  // Notify all calendar tabs
  await saveSettings(); // Triggers chrome.storage.sync.set()
};
```

### 2. Storage Layer Persists Data

**File**: `lib/storage.js`

```javascript
async function setWeekdayColor(weekdayIndex, color) {
  const key = String(weekdayIndex); // "0" through "6"
  return setSettings({ weekdayColors: { [key]: color } });
}

async function setWeekdayOpacity(weekdayIndex, opacity) {
  const key = String(weekdayIndex);
  return setSettings({ weekdayOpacity: { [key]: opacity } });
}

// Deep merge prevents overwriting other settings
async function setSettings(partial) {
  const current = await getSettings();
  const next = deepMerge(current, partial); // Preserves all other keys
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings: next }, () => resolve(next));
  });
}
```

**Stored Format**:
```javascript
{
  "settings": {
    "enabled": true,
    "weekdayColors": {
      "0": "#ffd5d5",  // Sunday
      "1": "#e8deff",  // Monday
      "2": "#d5f5e3",  // Tuesday
      "3": "#ffe8d5",  // Wednesday
      "4": "#d5f0ff",  // Thursday
      "5": "#fff5d5",  // Friday
      "6": "#f0d5ff"   // Saturday
    },
    "weekdayOpacity": {
      "0": 30, "1": 30, "2": 30, "3": 30,
      "4": 30, "5": 30, "6": 30
    },
    "weekStart": 0  // 0=Sunday, 1=Monday, 6=Saturday
  }
}
```

### 3. Content Script Detects Change

**File**: `content/featureRegistry.js`

```javascript
// Storage listener in content script
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    const newSettings = changes.settings.newValue;

    // Notify the dayColoring feature
    window.cc3Features.updateFeature('dayColoring', newSettings);
  }
});
```

### 4. Feature Applies Colors

**File**: `features/calendar-coloring/core/dayColoring.js`

```javascript
// Feature lifecycle hook
const feature = {
  id: 'dayColoring',

  onSettingsChanged: (settings) => {
    if (settings && settings.enabled) {
      // Apply colors based on current view
      applyDayColoring(settings);

      // Set up observers to maintain colors
      setupDOMObserver(settings);
      setupURLObserver(settings);
      setupDayViewStyleMonitor(settings); // Day view only
    } else {
      // Clean up when disabled
      removeStyles();
      removeDirectStyling();
      // Disconnect all observers
    }
  }
};
```

---

## Component Breakdown

### Core Module: dayColoring.js

**Lines**: 1178
**Purpose**: Main coloring logic for day/week views

#### Key Functions

**1. `applyDayColoring(settings)`** (Lines 599-694)
- **Purpose**: Main entry point to apply colors
- **Strategy**:
  - Month view → Delegates to `monthColoring.js`
  - Day view → CSS + Direct DOM + Aggressive monitoring
  - Week view → CSS only

```javascript
function applyDayColoring(settings) {
  const currentView = detectCurrentView(); // 'day', 'week', 'month'

  if (currentView === 'month') {
    // Use new month painter (targets div.MGaLHf.ChfiMc only)
    window.cc3MonthColoring.applyMonthViewColors(userColors, {
      assumeWeekStartsOn: settings.weekStart,
      opacity: userOpacity
    });
    return;
  }

  // Generate CSS for day/week views
  const css = generateCalendarCSS(settings);
  ensureStyleElement().textContent = css;

  // Day view needs extra direct styling
  if (currentView === 'day') {
    applyDayViewDirectStyling(settings);
  }
}
```

**2. `generateCalendarCSS(settings)`** (Lines 248-362)
- **Purpose**: Generate dynamic CSS based on column→weekday mapping
- **Returns**: CSS string with nth-child selectors
- **Key Logic**:
  - Detects which column corresponds to which weekday
  - Handles different week starts (Sun/Mon/Sat)
  - Converts hex colors to rgba with per-day opacity

```javascript
function generateCalendarCSS(settings) {
  const columnMapping = detectColumnToWeekdayMapping(); // {0: 1, 1: 2, ...}
  let css = '';

  for (let col = 0; col < 7; col++) {
    const weekday = columnMapping[col]; // 0=Sun, 1=Mon, etc.
    const color = settings.weekdayColors?.[String(weekday)];
    const opacity = settings.weekdayOpacity?.[String(weekday)] || 30;

    if (!color) continue;

    const rgba = hexToRgba(color, opacity / 100);

    // Generate CSS selectors for this column
    css += `[role='grid'] [data-column-index="${col}"] {
      background-color: ${rgba} !important;
    }\n`;
  }

  return css;
}
```

**3. `detectColumnToWeekdayMapping()`** (Lines 365-432)
- **Purpose**: Determine which visual column corresponds to which weekday
- **Why Needed**: Week start varies by user settings (Sun/Mon) and locale
- **Methods**:
  1. **Date-based detection**: Reads `data-date` attributes from cells, calculates day of week
  2. **Header detection**: Reads column header text (e.g., "Mon", "Tue")
  3. **Fallback**: Uses `detectStartWeek()` to calculate mapping

```javascript
function detectColumnToWeekdayMapping() {
  const mapping = {}; // columnIndex -> weekday

  // Method 1: Find cells with data-date attribute
  const dateElements = document.querySelectorAll('[data-date]');
  for (const dateEl of dateElements) {
    const dateStr = dateEl.getAttribute('data-date'); // "2025-11-29"
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay(); // 0=Sunday

    // Find which column this cell is in
    const cell = dateEl.closest('[role="gridcell"]');
    const row = cell.closest('[role="row"]');
    const cells = row.querySelectorAll('[role="gridcell"]');
    const cellIndex = Array.from(cells).indexOf(cell);

    mapping[cellIndex] = dayOfWeek;
  }

  return mapping; // {0: 1, 1: 2, 2: 3, ...} = Mon-Sun
}
```

**4. Day View Direct Styling** (Lines 543-596)
- **Purpose**: Apply colors directly to DOM elements (CSS fallback)
- **Why Needed**: Google Calendar's aggressive style resets in day view
- **Target**: Only `div.QIYAPb` elements (event column background)

```javascript
function applyDayViewDirectStyling(settings) {
  const currentDate = getCurrentDateInDayView();
  const dayOfWeek = currentDate.getDay();
  const color = settings.weekdayColors?.[String(dayOfWeek)];
  const opacity = settings.weekdayOpacity?.[String(dayOfWeek)] || 30;
  const rgba = hexToRgba(color, opacity / 100);

  // Target ONLY QIYAPb elements (event column)
  const qiyapbElements = document.querySelectorAll('div.QIYAPb');
  qiyapbElements.forEach((element) => {
    element.style.setProperty('background-color', rgba, 'important');

    // Apply to children, but skip event elements
    for (let child of element.children) {
      if (!child.classList.contains('feMFof') ||
          !child.classList.contains('A3o4Oe')) {
        child.style.setProperty('background-color', rgba, 'important');
      }
    }
  });
}
```

**5. Observers** (Lines 724-969)

Three types of observers maintain colors:

**a) DOM Observer** (Lines 724-810)
- Watches for DOM mutations (new grids, navigation)
- Reapplies colors after debounce (100ms or 300ms for view changes)

**b) URL Observer** (Lines 812-842)
- Polls window.location.href every 500ms
- Detects SPA navigation (Google Calendar doesn't fire popstate)

**c) Day View Style Monitor** (Lines 844-969)
- **Most aggressive** - only for day view
- Watches for style attribute changes on QIYAPb elements
- Re-applies colors if Google Calendar resets them
- **Periodic reapplication**: Every 2 seconds as final fallback

```javascript
function setupDayViewStyleMonitor(settings) {
  dayViewStyleMonitor = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'style') {
        const target = mutation.target;
        // If our color was removed, reapply immediately
        if (target.matches('.QIYAPb')) {
          applyDayColoring(settings);
          applyDayViewDirectStyling(settings);
        }
      }
    }
  });

  // Monitor entire document for style changes
  dayViewStyleMonitor.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style']
  });

  // Periodic reapplication every 2 seconds
  dayViewPeriodicReapply = setInterval(() => {
    if (currentSettings?.enabled && detectCurrentView() === 'day') {
      applyDayColoring(currentSettings);
      applyDayViewDirectStyling(currentSettings);
    }
  }, 2000);
}
```

---

### Month View Module: monthColoring.js

**Lines**: 359
**Purpose**: Month-specific coloring via direct DOM painting

**Why Separate?**
- Month view has different DOM structure (no data-column-index)
- Needs to handle 5-column (weekends hidden) vs 7-column layouts
- Uses clustering algorithm to group cells by visual column

#### Key Functions

**1. `applyMonthViewColors(userColors, opts)`** (Lines 269-343)
- **Purpose**: Main entry point for month view coloring
- **Strategy**: Direct style.backgroundColor manipulation
- **Target**: `div.MGaLHf.ChfiMc` elements only (NOT gridcells)

```javascript
function applyMonthViewColors(userColors, opts) {
  const startWeekDay = opts?.assumeWeekStartsOn ?? 0;
  const userOpacity = opts?.opacity || {};

  const paint = () => {
    clearMonthColors(); // Remove existing colors
    const cells = selectMonthCells(); // Find all div.MGaLHf.ChfiMc
    const cols = clusterColumns(cells); // Group by visual column

    // Handle 5-column (weekends hidden) or 7-column layouts
    const colToPosition = computeColumnPositionMap(cols, startWeekDay);

    cols.forEach((col, cIdx) => {
      const weekday = colToPosition[cIdx];
      const color = userColors[weekday];
      const opacity = userOpacity[weekday] || 30;
      const rgba = hexToRgba(color, opacity / 100);

      // Apply color to all cells in this column
      for (const cell of col.members) {
        cell.style.setProperty('background-color', rgba, 'important');
        cell.setAttribute('data-gce-month-painted', '1');
      }
    });
  };

  // Paint after layout settles
  requestAnimationFrame(() => requestAnimationFrame(paint));

  // Watch for DOM changes and repaint
  monthMo = new MutationObserver(() => {
    requestAnimationFrame(() => requestAnimationFrame(paint));
  });
  monthMo.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });
}
```

**2. `clusterColumns(cells)`** (Lines 177-217)
- **Purpose**: Group cells into visual columns based on x-coordinate
- **Why Needed**: No data-column-index in month view
- **Algorithm**:
  1. Get center x-coordinate of each cell
  2. Sort by x-coordinate
  3. Calculate median column width
  4. Group cells within 25% tolerance of each other

```javascript
function clusterColumns(cells) {
  // Map each cell to its center x-coordinate
  const points = cells.map((c) => {
    const r = c.getBoundingClientRect();
    return { c, center: (r.left + r.right) / 2 };
  }).sort((a, b) => a.center - b.center);

  // Calculate adaptive tolerance based on median column width
  const approxColWidth = median(widths) || 100;
  const tolerance = Math.round(approxColWidth * 0.25); // 25%

  // Cluster cells by x-coordinate
  const cols = [];
  for (const p of points) {
    const hit = cols.find((col) => Math.abs(col.center - p.center) <= tolerance);
    if (hit) {
      hit.members.push(p.c);
    } else {
      cols.push({ center: p.center, members: [p.c] });
    }
  }

  return cols.sort((a, b) => a.center - b.center);
}
```

**3. `computeColumnPositionMap(cols, startWeekDay)`** (Lines 220-256)
- **Purpose**: Map visual column index to weekday (0-6)
- **Handles**:
  - 5 columns (weekends hidden) → Always Mon-Fri (1-5)
  - 7 columns (weekends shown) → Based on user's week start setting

```javascript
function computeColumnPositionMap(cols, startWeekDay) {
  const map = new Array(cols.length).fill(0);

  if (cols.length === 5) {
    // Weekends hidden: columns are always Mon-Fri
    for (let colIndex = 0; colIndex < 5; colIndex++) {
      map[colIndex] = colIndex + 1; // 1=Mon, 2=Tue, ..., 5=Fri
    }
  } else if (cols.length === 7) {
    // Weekends shown: use user's week start setting
    for (let colIndex = 0; colIndex < 7; colIndex++) {
      map[colIndex] = (colIndex + startWeekDay) % 7;
    }
  }

  return map;
}
```

---

### Date Utils Module: dateUtils.js

**Lines**: 437
**Purpose**: Date parsing and month/year detection

**Why Needed**:
- Google Calendar uses different date formats in different views
- Need to extract current month/year for month view calculations
- Handle multilingual month names

#### Key Functions

**1. `getCurrentMonthYear()`** (Lines 138-281)
- **Purpose**: Extract current month/year from URL or DOM
- **Methods**:
  1. URL parsing: `/month/2025/11/29` → {year: 2025, month: 10}
  2. DOM element search: Look for month name + year in headings
  3. Fallback: Current date

```javascript
function getCurrentMonthYear() {
  // Method 1: URL
  const urlMatch = window.location.href.match(/\/month\/(\d{4})\/(\d{1,2})/);
  if (urlMatch) {
    return { year: parseInt(urlMatch[1]), month: parseInt(urlMatch[2]) - 1 };
  }

  // Method 2: DOM - search for "November 2025" in headings
  const monthNames = {
    january: 0, february: 1, march: 2, april: 3,
    may: 4, june: 5, july: 6, august: 7,
    september: 8, october: 9, november: 10, december: 11
  };

  const elements = document.querySelectorAll('[role="heading"], h1, h2');
  for (const el of elements) {
    const text = el.textContent?.toLowerCase();
    const yearMatch = text.match(/\b(20\d{2})\b/);

    if (yearMatch) {
      for (const [monthName, monthIndex] of Object.entries(monthNames)) {
        if (text.includes(monthName)) {
          return { year: parseInt(yearMatch[1]), month: monthIndex };
        }
      }
    }
  }

  // Fallback
  return { year: new Date().getFullYear(), month: new Date().getMonth() };
}
```

**2. `tryParseDate(text)`** (Lines 284-428)
- **Purpose**: Extract date from aria-label or text content
- **Supports**: ISO, US format, European format, natural language
- **Used**: To detect which weekday a cell represents

---

## How It Works

### Initialization Sequence

```
1. Page Load (calendar.google.com)
   ↓
2. Content script loads (content/index.js)
   ↓
3. Feature registry initializes (content/featureRegistry.js)
   ↓
4. dayColoring.js self-registers via window.cc3Features.register()
   ↓
5. Registry calls feature.init(settings) if enabled
   ↓
6. applyDayColoring() runs
   ↓
7. Observers set up to maintain colors
```

### User Adjusts Color/Opacity

```
1. User clicks day in popup (e.g., Monday)
   ↓
2. Expanded view shows:
   - Color picker (4 palettes: Vibrant, Pastel, Dark, Custom)
   - Hex input
   - Opacity presets (10%, 20%, 30%, 40%, 50%, 100%)
   - Opacity slider (0-100%)
   ↓
3. User selects color → saves to chrome.storage.sync
   ↓
4. User adjusts opacity slider:
   - oninput: Updates preview in real-time (no save)
   - onchange/onmouseup: Saves to storage
   ↓
5. Storage change detected by content script
   ↓
6. feature.onSettingsChanged() called
   ↓
7. Colors reapplied to calendar
```

### Navigation Handling

```
User navigates: Week → Day view
   ↓
URL Observer detects change (500ms poll)
   ↓
Wait 200ms for DOM to settle
   ↓
applyDayColoring() runs
   ↓
Detects view = 'day'
   ↓
Applies CSS + Direct DOM styling
   ↓
Sets up aggressive day view monitors
```

---

## Storage Schema

### Chrome Sync Storage

**Key**: `settings` (Object)
**Max Size**: 100KB total (Chrome Sync limit)

```javascript
{
  "enabled": true,  // Master toggle

  "weekdayColors": {
    "0": "#ffd5d5",  // Sunday - Light coral
    "1": "#e8deff",  // Monday - Light lavender
    "2": "#d5f5e3",  // Tuesday - Light mint
    "3": "#ffe8d5",  // Wednesday - Light peach
    "4": "#d5f0ff",  // Thursday - Light sky blue
    "5": "#fff5d5",  // Friday - Light yellow
    "6": "#f0d5ff"   // Saturday - Light lilac
  },

  "weekdayOpacity": {
    "0": 30,  // Sunday - 30%
    "1": 30,  // Monday - 30%
    "2": 30,  // Tuesday - 30%
    "3": 30,  // Wednesday - 30%
    "4": 30,  // Thursday - 30%
    "5": 30,  // Friday - 30%
    "6": 30   // Saturday - 30%
  },

  "weekStart": 0,  // 0=Sunday, 1=Monday, 6=Saturday

  "dateColors": {},  // UNUSED - future feature for specific date colors

  "presetColors": [  // Day coloring palette (not used by feature itself)
    "#FDE68A", "#BFDBFE", "#C7D2FE", "#FBCFE8", "#BBF7D0",
    "#FCA5A5", "#A7F3D0", "#F5D0FE", "#FDE68A", "#E9D5FF"
  ]
}
```

### Storage API Functions

**File**: `lib/storage.js`

```javascript
// Setters
await setEnabled(true);
await setWeekdayColor(1, '#ff0000');  // Monday = red
await setWeekdayOpacity(1, 50);       // Monday = 50% opacity
await setWeekStart(1);                // Week starts on Monday

// Getters
const settings = await getSettings();
const color = settings.weekdayColors['1'];     // Get Monday color
const opacity = settings.weekdayOpacity['1'];  // Get Monday opacity
```

---

## User Interface

### Popup Structure

**File**: `popup/popup.html` (Lines 3103-3700+)

**Layout**:
```
┌─────────────────────────────────────┐
│  Day Coloring Section               │
├─────────────────────────────────────┤
│  [Toggle Switch] Enabled            │
├─────────────────────────────────────┤
│  Week Start: [Dropdown: Sun/Mon/Sat]│
├─────────────────────────────────────┤
│  Weekdays (7 expandable cards):     │
│  ┌──────────────────────────────┐   │
│  │ Sun [Color Preview]          │   │
│  │   [Expanded View]            │   │
│  │   ┌──────────────────────┐   │   │
│  │   │ Color Tabs:          │   │   │
│  │   │ [Vibrant] [Pastel]   │   │   │
│  │   │ [Dark] [Custom]      │   │   │
│  │   ├──────────────────────┤   │   │
│  │   │ [Color Picker] [Hex] │   │   │
│  │   ├──────────────────────┤   │   │
│  │   │ 🎚️ Opacity: 30%      │   │   │
│  │   │ [10%][20%][30%][40%] │   │   │
│  │   │ [50%][100%]          │   │   │
│  │   │ ▬▬▬▬▬▬▬●▬▬▬▬▬▬▬      │   │   │
│  │   └──────────────────────┘   │   │
│  └──────────────────────────────┘   │
│  [Mon card...]                      │
│  [Tue card...]                      │
│  ...                                │
└─────────────────────────────────────┘
```

### Color Selection UI

Each day card contains:

**1. Color Picker Tabs** (4 palettes)
```javascript
// Vibrant palette (31 colors)
const vibrantColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
  // ... 21 more
];

// Pastel palette (35 colors)
const pastelColors = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
  '#E0BBE4', '#FFDFD3', '#FEC8D8', '#D4F1F4', '#FFE156',
  // ... 25 more
];

// Dark palette (36 colors)
const darkColors = [
  '#8B4513', '#2F4F4F', '#556B2F', '#8B0000', '#483D8B',
  '#2E8B57', '#800000', '#191970', '#8B008B', '#B8860B',
  // ... 26 more
];

// Custom palette (user saved colors)
const customColors = settings.customDayColors || [];
```

**2. Opacity Controls**

```html
<!-- Presets -->
<div class="opacity-presets">
  <button data-opacity="10">10%</button>
  <button data-opacity="20">20%</button>
  <button data-opacity="30" class="active">30%</button>
  <button data-opacity="40">40%</button>
  <button data-opacity="50">50%</button>
  <button data-opacity="100">100%</button>
</div>

<!-- Slider -->
<input type="range" id="opacity0" min="0" max="100" value="30" />
<div class="opacity-value-display">30%</div>
```

### Preview Mechanism

**File**: `popup/popup.js`

```javascript
function updatePreview(dayIndex, color, opacity) {
  const alpha = opacity / 100;
  const rgba = hexToRgba(color, alpha);

  // Update preview swatch in collapsed view
  const preview = document.getElementById(`preview${dayIndex}`);
  if (preview) {
    preview.style.backgroundColor = rgba;
  }

  // Update color picker preview
  const colorPreview = document.getElementById(`colorPreview${dayIndex}`);
  if (colorPreview) {
    colorPreview.style.backgroundColor = color;
  }

  // Update opacity value display
  const opacityDisplay = document.getElementById(`opacityValue${dayIndex}`);
  if (opacityDisplay) {
    opacityDisplay.textContent = `${opacity}%`;
  }

  // Update slider fill indicator
  const sliderFill = document.getElementById(`sliderFill${dayIndex}`);
  if (sliderFill) {
    sliderFill.style.width = `${opacity}%`;
  }
}
```

### Real-Time Updates

```javascript
// Opacity slider provides instant visual feedback
opacityInput.oninput = (e) => {
  const opacity = parseInt(e.target.value);
  updateOpacityDisplay(dayIndex, opacity);
  updateSliderFill(dayIndex, opacity);

  // Update preview WITHOUT saving (real-time feedback)
  const color = settings.weekdayColors?.[String(dayIndex)];
  updatePreview(dayIndex, color, opacity);
};

// Only save when user releases slider
opacityInput.onchange = async (e) => {
  const opacity = parseInt(e.target.value);
  settings = await window.cc3Storage.setWeekdayOpacity(dayIndex, opacity);
  await saveSettings(); // Triggers chrome.storage.sync.set()
};
```

---

## Technical Implementation Details

### View Detection

**File**: `features/calendar-coloring/core/dayColoring.js` (Line 97)

```javascript
function detectCurrentView() {
  const body = document.body;
  return body.dataset.viewkey?.toLowerCase() || 'unknown';
  // Returns: 'day', 'week', 'month', '4day', 'schedule', 'year'
}
```

**Usage**:
- Day view: CSS + Direct DOM + Aggressive monitoring
- Week view: CSS only
- Month view: JavaScript painting (monthColoring.js)

### Week Start Detection

**Purpose**: Detect user's calendar week start preference

**File**: `features/calendar-coloring/core/dayColoring.js` (Lines 18-94)

```javascript
function detectStartWeek() {
  // Method 1: Calculate from actual dates in grid
  const grids = document.querySelectorAll('[role="grid"]');
  for (const grid of grids) {
    const dateElements = grid.querySelectorAll('[data-date]');
    for (const dateEl of dateElements) {
      const dateStr = dateEl.getAttribute('data-date'); // "2025-11-29"
      const date = new Date(dateStr + 'T12:00:00');
      const dayOfWeek = date.getDay(); // 5 (Friday)

      // Find which column this cell is in
      const cellIndex = /* ... calculate column index ... */;

      // Calculate start week: what day is column 0?
      let startWeek = (dayOfWeek - cellIndex) % 7;
      if (startWeek < 0) startWeek += 7;

      return startWeek; // 0=Sun, 1=Mon, 6=Sat
    }
  }

  // Method 2: Check header text
  const headers = document.querySelectorAll('[role="columnheader"]');
  const firstHeader = headers[headers.length - 7]?.textContent?.toLowerCase();

  if (firstHeader.includes('sat')) return 6;
  if (firstHeader.includes('sun')) return 0;
  if (firstHeader.includes('mon')) return 1;

  // Fallback
  return 0; // Sunday
}
```

### Color Conversion

**Hex to RGBA with Opacity**

```javascript
function hexToRgba(hex, alpha = 0.3) {
  if (!hex || hex === '#ffffff') return `rgba(255, 255, 255, ${alpha})`;

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(255, 255, 255, ${alpha})`;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Example:
hexToRgba('#FF0000', 0.3) → 'rgba(255, 0, 0, 0.3)'
hexToRgba('#4285f4', 0.5) → 'rgba(66, 133, 244, 0.5)'
```

### CSS Generation Examples

**Week View CSS** (Generated dynamically)

```css
/* Week view with Sunday start */
:root {
  --cc3-col0-color: rgba(255, 213, 213, 0.3); /* Sunday */
  --cc3-col1-color: rgba(232, 222, 255, 0.3); /* Monday */
  --cc3-col2-color: rgba(213, 245, 227, 0.3); /* Tuesday */
  /* ... */
}

/* Target columns by nth-child */
[role='grid'] > [data-start-date-key] [data-column-index="0"] {
  background-color: var(--cc3-col0-color) !important;
}

[role='grid'] > [data-start-date-key] [data-column-index="1"] {
  background-color: var(--cc3-col1-color) !important;
}

/* ... more selectors ... */
```

**Day View CSS** (Generated dynamically)

```css
/* Day view - target QIYAPb elements only */
:root {
  --cc3-day-color: rgba(255, 245, 213, 0.3); /* Friday */
}

body[data-viewkey="day"] div.QIYAPb {
  background-color: var(--cc3-day-color) !important;
}

/* Apply to children but exclude events */
body[data-viewkey="day"] div.QIYAPb > *:not(.feMFof.A3o4Oe) {
  background-color: var(--cc3-day-color) !important;
}

/* Mini calendar in day view */
body[data-viewkey="day"] #drawerMiniMonthNavigator [data-date="2025-11-29"] {
  background-color: var(--cc3-day-color) !important;
}
```

### Direct DOM Styling (Day View Only)

**Why Needed**: Google Calendar aggressively resets inline styles in day view

```javascript
function applyDayViewDirectStyling(settings) {
  const qiyapbElements = document.querySelectorAll('div.QIYAPb');

  qiyapbElements.forEach((element) => {
    element.style.setProperty('background-color', rgba, 'important');

    // Apply to children, skip event elements
    for (let child of element.children) {
      if (!child.classList.contains('feMFof') ||
          !child.classList.contains('A3o4Oe')) {
        child.style.setProperty('background-color', rgba, 'important');
      }
    }
  });
}
```

### Month View Clustering Algorithm

**Problem**: Month view cells have no data-column-index attribute

**Solution**: Group cells by x-coordinate

```javascript
function clusterColumns(cells) {
  // 1. Get center x for each cell
  const points = cells.map(c => ({
    c,
    center: (c.getBoundingClientRect().left + c.getBoundingClientRect().right) / 2
  })).sort((a, b) => a.center - b.center);

  // 2. Calculate median column width
  const widths = [];
  for (let i = 1; i < points.length; i++) {
    if (/* same row check */) {
      widths.push(points[i].left - points[i - 1].left);
    }
  }
  const medianWidth = median(widths) || 100;

  // 3. Adaptive tolerance (25% of median width)
  const tolerance = Math.round(medianWidth * 0.25);

  // 4. Cluster cells
  const cols = [];
  for (const p of points) {
    const existing = cols.find(col => Math.abs(col.center - p.center) <= tolerance);
    if (existing) {
      existing.members.push(p.c);
    } else {
      cols.push({ center: p.center, members: [p.c] });
    }
  }

  return cols.sort((a, b) => a.center - b.center);
}
```

---

## Edge Cases & Reliability

### 1. Week Start Variations

**Problem**: Users can set week start to Sunday, Monday, or Saturday

**Solution**:
- Detect from actual calendar grid (read data-date attributes)
- Fallback to header text detection
- User can manually set in popup if auto-detection fails

**Code**:
```javascript
// User setting takes precedence
const userWeekStart = settings.weekStart !== undefined ? settings.weekStart : 0;

// Month view uses user setting directly
window.cc3MonthColoring.applyMonthViewColors(userColors, {
  assumeWeekStartsOn: userWeekStart,
  opacity: userOpacity
});
```

### 2. Locale Variations

**Problem**: Different languages have different day/month names

**Solution**:
- Primary detection uses data-date attributes (ISO format)
- Header text detection has multilingual support
- Date parsing supports English, Spanish, French, German

**Code**:
```javascript
const monthNames = {
  // English
  january: 0, february: 1, march: 2, ...,
  // Spanish
  enero: 0, febrero: 1, marzo: 2, ...,
  // French
  janvier: 0, février: 1, mars: 2, ...,
  // German
  januar: 0, februar: 1, märz: 2, ...
};
```

### 3. Google Calendar DOM Changes

**Problem**: Google Calendar can change DOM structure with updates

**Mitigation**:
- Multiple fallback selectors for each view
- MutationObserver watches for structural changes
- Periodic reapplication (day view only, every 2s)

**Code**:
```javascript
// Multiple selector strategies
const grids = document.querySelectorAll('[role="grid"]') ||
              document.querySelectorAll('[data-start-date-key]') ||
              document.querySelectorAll('.calendar-grid');
```

### 4. Weekends Hidden Mode

**Problem**: Users can hide weekends (5-column layout)

**Solution**: Month view detects column count

**Code**:
```javascript
function computeColumnPositionMap(cols, startWeekDay) {
  if (cols.length === 5) {
    // Weekends hidden: Always Mon-Fri
    return [1, 2, 3, 4, 5]; // Mon, Tue, Wed, Thu, Fri
  } else if (cols.length === 7) {
    // Weekends shown: Use user's week start
    return Array.from({length: 7}, (_, i) => (i + startWeekDay) % 7);
  }
}
```

### 5. SPA Navigation

**Problem**: Google Calendar doesn't fire popstate events on navigation

**Solution**: URL polling observer

**Code**:
```javascript
let currentUrl = window.location.href;
urlObserver = setInterval(() => {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    currentUrl = newUrl;
    setTimeout(() => applyDayColoring(currentSettings), 200);
  }
}, 500);
```

### 6. Race Conditions in Popup

**Problem**: User rapidly changes color + opacity → race condition

**Solution**: Sequential await, no parallel saves

**Code**:
```javascript
// Save color first, THEN opacity
settings = await window.cc3Storage.setWeekdayColor(dayIndex, color);
settings = await window.cc3Storage.setWeekdayOpacity(dayIndex, 100);

// NOT: Promise.all([setColor(), setOpacity()]) ❌
```

### 7. Deep Merge for Settings

**Problem**: Setting one day's color shouldn't reset other days

**Solution**: Deep merge in storage layer

**Code**:
```javascript
async function setWeekdayColor(weekdayIndex, color) {
  const key = String(weekdayIndex);
  return setSettings({ weekdayColors: { [key]: color } });
  // Deep merges { weekdayColors: { "1": "#ff0000" } }
  // with existing { weekdayColors: { "0": "#ffd5d5", "2": "#d5f5e3", ... } }
  // Result: Only weekdayColors["1"] changes
}
```

---

## Performance Considerations

### 1. Debouncing

**Mutation Observer**: 100ms debounce (300ms for view changes)

```javascript
let debounceTimer = null;

domObserver = new MutationObserver((mutations) => {
  clearTimeout(debounceTimer);
  const delay = viewChanged ? 300 : 100;
  debounceTimer = setTimeout(() => {
    applyDayColoring(currentSettings);
  }, delay);
});
```

### 2. requestAnimationFrame

**Month View**: Double RAF ensures paint after layout

```javascript
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    // Paint colors here - layout has settled
    paintMonthView();
  })
);
```

### 3. Tracked Timeouts

**Purpose**: Prevent memory leaks when feature disabled

```javascript
const pendingTimeouts = new Set();

function createTrackedTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    pendingTimeouts.delete(timeoutId);
    callback();
  }, delay);
  pendingTimeouts.add(timeoutId);
  return timeoutId;
}

function clearAllTimeouts() {
  for (const timeoutId of pendingTimeouts) {
    clearTimeout(timeoutId);
  }
  pendingTimeouts.clear();
}

// When feature disabled
feature.onSettingsChanged = (settings) => {
  if (!settings.enabled) {
    clearAllTimeouts(); // Clean up all pending operations
  }
};
```

### 4. CSS-First Approach

**Strategy**: Use CSS when possible, direct DOM only when necessary

- Week view: CSS only (fast)
- Day view: CSS + Direct DOM (reliability)
- Month view: Direct DOM only (no CSS selectors available)

### 5. Minimal Reflows

**Technique**: Batch DOM reads/writes

```javascript
// BAD: Interleaved reads/writes (causes multiple reflows)
elements.forEach(el => {
  el.style.backgroundColor = color; // write
  const height = el.offsetHeight;   // read → reflow!
});

// GOOD: Batch reads, then batch writes
const heights = elements.map(el => el.offsetHeight); // all reads first
elements.forEach(el => {
  el.style.backgroundColor = color; // all writes after
});
```

---

## Summary

### What Makes This Work

1. **Multi-Strategy Rendering**: Different approaches for different views
2. **Robust Detection**: Multiple fallbacks for week start, current view, dates
3. **Aggressive Persistence**: Observers + periodic reapplication in day view
4. **Smart Storage**: Deep merge prevents accidental overwrites
5. **Real-Time UI**: Instant preview, debounced saves
6. **Locale Support**: Works across languages and calendar settings

### Key Strengths

✅ **Reliability**: Survives Google Calendar updates and navigation
✅ **Flexibility**: Supports all views, week starts, locales
✅ **Performance**: CSS-first with selective direct DOM
✅ **UX**: Real-time preview, intuitive controls
✅ **Maintainability**: Well-structured, modular code

### Potential Improvements

🔧 **Reduce Aggressiveness**: Day view periodic reapplication (every 2s) could be less frequent
🔧 **Week Start Auto-Detect**: Could be more reliable with better header parsing
🔧 **Month View Performance**: Clustering algorithm could cache results
🔧 **Code Deduplication**: Some color conversion logic duplicated across modules

---

**End of Analysis** - Generated 2025-11-29
