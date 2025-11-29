// LOCKED CALENDAR COLORING FEATURE - DO NOT MODIFY
// This module contains the core day coloring functionality
// All changes to calendar coloring should be made here only

(function () {
  const FEATURE_ID = 'dayColoring';
  const STYLE_ID = 'cc3-day-coloring-styles';

  // === LOCKED CORE FUNCTIONS ===
  function normalizeYmdFromDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Detect start week by examining actual calendar header order and dates
  function detectStartWeek() {
    // Method 1: Try to find a calendar grid with actual dates to calculate start week
    const grids = document.querySelectorAll('[role="grid"] > [data-start-date-key]');
    for (const grid of grids) {
      const headers = grid.querySelectorAll('[role="columnheader"]');
      if (headers.length >= 7) {
        // Look for actual date in the grid to determine day mapping
        const dateElements = grid.querySelectorAll('[data-date]');
        for (const dateEl of dateElements) {
          const dateStr = dateEl.getAttribute('data-date');
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const date = new Date(dateStr + 'T12:00:00');
            const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.

            // Find which column this date is in
            const cell =
              dateEl.closest('[role="gridcell"]') || dateEl.closest('td') || dateEl.closest('[data-column-index]');
            if (cell) {
              const row = cell.closest('[role="row"]') || cell.closest('tr');
              if (row) {
                const cells = row.querySelectorAll('[role="gridcell"], td');
                let cellIndex = Array.from(cells).indexOf(cell);

                // Skip time columns (usually first column in week view)
                if (cellIndex > 0 && cells.length > 7) cellIndex--;

                if (cellIndex >= 0 && cellIndex < 7) {
                  // Calculate start week: what day is column 0?
                  let startWeek = (dayOfWeek - cellIndex) % 7;
                  // Ensure positive result (handle Saturday start correctly)
                  if (startWeek < 0) startWeek += 7;

                  console.log(`Detected start week: ${startWeek} (day ${dayOfWeek} in column ${cellIndex})`);
                  return startWeek;
                }
              }
            }
          }
        }
      }
    }

    // Method 2: Check header text patterns
    const grid = document.querySelector('[role="grid"] > [data-start-date-key]');
    if (grid) {
      const headers = grid.querySelectorAll('[role="columnheader"]');
      if (headers.length >= 7) {
        // Find the first day column header (skip time columns)
        for (let i = headers.length - 7; i < headers.length; i++) {
          const header = headers[i];
          const headerText = header?.textContent?.toLowerCase() || '';

          // Check for Saturday indicators (when it's first day)
          if (headerText.includes('sat') || headerText.includes('sab') || headerText.includes('土')) {
            console.log('Detected Saturday start from header:', headerText);
            return 6; // Saturday start
          }
          // Check for Sunday indicators
          if (headerText.includes('sun') || headerText.includes('dom') || headerText.includes('日')) {
            console.log('Detected Sunday start from header:', headerText);
            return 0; // Sunday start
          }
          // Check for Monday indicators
          if (headerText.includes('mon') || headerText.includes('lun') || headerText.includes('月')) {
            console.log('Detected Monday start from header:', headerText);
            return 1; // Monday start
          }
          // Only check first day column
          break;
        }
      }
    }

    // Fallback: assume Sunday start
    console.log('Using fallback start week: 0 (Sunday)');
    return 0;
  }

  // === LOCKED UTILITY FUNCTIONS ===
  function detectCurrentView() {
    const body = document.body;
    return body.dataset.viewkey?.toLowerCase() || 'unknown';
  }

  function debugDayViewStructure() {
    console.log('=== DAY VIEW DEBUG - PRECISE TARGETING ===');
    console.log('URL:', window.location.href);
    console.log('Body data-viewkey:', document.body.dataset.viewkey);

    // Focus on QIYAPb elements (our precise targets)
    const allQiyapb = document.querySelectorAll('.QIYAPb');
    console.log('🎯 TARGET: QIYAPb elements found:', allQiyapb.length);

    allQiyapb.forEach((elem, i) => {
      console.log(`🎯 QIYAPb ${i}:`, {
        element: elem,
        className: elem.className,
        background: getComputedStyle(elem).backgroundColor,
        bounds: elem.getBoundingClientRect(),
        children: elem.children.length,
      });

      // Check children for event elements
      Array.from(elem.children).forEach((child, j) => {
        const hasEvent = child.classList.contains('feMFof') && child.classList.contains('A3o4Oe');
        console.log(`  Child ${j}:`, {
          element: child,
          className: child.className,
          isEventElement: hasEvent,
          background: getComputedStyle(child).backgroundColor,
        });
      });
    });

    // Check if we have the elements we expect
    const main = document.querySelector('[role="main"]');
    const grids = document.querySelectorAll('[role="grid"]');
    console.log('ℹ️  Context: Main element exists:', !!main);
    console.log('ℹ️  Context: Grid elements found:', grids.length);

    if (allQiyapb.length === 0) {
      console.warn('⚠️  NO QIYAPb ELEMENTS FOUND - Day view targeting will fail!');
    }
  }

  function getCurrentDateInDayView() {
    console.log('Getting current date for day view...');

    // Method 1: Try to find date from URL - most reliable
    const url = window.location.href;
    console.log('Current URL:', url);

    // Google Calendar day view URLs have patterns like:
    // /calendar/u/0/r/day/2024/1/15
    // /calendar/u/0/r/day?date=20240115
    const dateMatch = url.match(/\/day\/(\d{4})\/(\d{1,2})\/(\d{1,2})/) || url.match(/date=(\d{4})(\d{2})(\d{2})/);

    if (dateMatch) {
      let year, month, day;
      if (dateMatch[0].includes('/day/')) {
        [, year, month, day] = dateMatch;
      } else {
        [, year, month, day] = [dateMatch[1], dateMatch[2], dateMatch[3]];
        month = month.padStart(2, '0');
        day = day.padStart(2, '0');
      }
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const dayOfWeek = date.getDay();

      // Validate the date is correct
      if (isNaN(date.getTime())) {
        console.warn('Invalid date detected, using fallback');
        return new Date();
      }

      console.log('Day view date from URL:', {
        year,
        month,
        day,
        date,
        dayOfWeek,
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      });
      return date;
    }

    // Fallback: use today's date
    const today = new Date();
    console.log('Day view using fallback date (today):', today);
    return today;
  }

  function hexToRgba(hex, alpha = 0.3) {
    if (!hex || hex === '#ffffff') return `rgba(255, 255, 255, ${alpha})`;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(255, 255, 255, ${alpha})`;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // === LOCKED STYLING FUNCTIONS ===
  function ensureStyleElement() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    return style;
  }

  function removeStyles() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function removeDirectStyling() {
    console.log('Removing direct DOM styling...');

    // Remove direct styling from QIYAPb elements
    const qiyapbElements = document.querySelectorAll('div.QIYAPb');
    qiyapbElements.forEach((element) => {
      element.style.removeProperty('background-color');
      console.log('Removed direct styling from QIYAPb element:', element);

      // Remove from child elements
      const children = element.children;
      for (let child of children) {
        child.style.removeProperty('background-color');
      }
    });

    // Remove from mini calendar elements
    const miniCalElements = document.querySelectorAll(
      `#drawerMiniMonthNavigator [data-date], ` +
        `[role="complementary"] [data-date], ` +
        `.v4rOrb [data-date], ` +
        `[data-month] [data-date], ` +
        `[jsname="PkgjIb"] [data-date]`,
    );
    miniCalElements.forEach((element) => {
      element.style.removeProperty('background-color');
    });

    console.log('Direct DOM styling removed');
  }

  // Generate reliable CSS using dynamic day-to-column mapping
  function generateCalendarCSS(settings) {
    if (!settings || !settings.enabled) return '';

    const columnMapping = detectColumnToWeekdayMapping();
    const currentView = detectCurrentView();

    console.log('Generating CSS with mapping:', columnMapping);
    console.log('Current view:', currentView);
    console.log('Weekday colors:', settings.weekdayColors);

    let css = `/* Calendar Day Coloring - Dynamic Mapping */\n`;

    // Validate that we have a complete mapping
    const mappingKeys = Object.keys(columnMapping);
    if (mappingKeys.length === 0) {
      console.warn('No column mapping detected, colors may not apply correctly');
      return css;
    }

    // Day view - ultra-precise targeting for event column only
    if (currentView === 'day') {
      console.log('Processing day view CSS generation...');
      debugDayViewStructure();

      const currentDate = getCurrentDateInDayView();
      if (currentDate) {
        const dayOfWeek = currentDate.getDay();
        const color = settings.weekdayColors?.[String(dayOfWeek)];

        if (color) {
          // Use opacity from settings instead of hardcoded theme-based alpha
          const opacity = settings.weekdayOpacity?.[String(dayOfWeek)] || 30; // Default to 30% if not set
          const alpha = opacity / 100; // Convert percentage to decimal
          const rgba = hexToRgba(color, alpha);
          console.log(`Day view: applying color ${rgba} for day ${dayOfWeek}`);

          // Day view - PRECISE targeting using ONLY QIYAPb elements (like old implementation)
          css += `/* Day View Coloring - Only QIYAPb elements, avoid feMFof.A3o4Oe */\n`;
          css += `:root { --cc3-day-color: ${rgba}; }\n`;

          // Target ONLY QIYAPb elements (the correct day view container)
          css += `body[data-viewkey="day"] div.QIYAPb { background-color: var(--cc3-day-color) !important; }\n`;

          // Ensure QIYAPb child elements also get the color, but exclude event elements
          css += `body[data-viewkey="day"] div.QIYAPb > *:not(.feMFof.A3o4Oe) { background-color: var(--cc3-day-color) !important; }\n`;

          // Mini calendar in day view - target the current day cell
          const currentDateStr = normalizeYmdFromDate(currentDate);
          css += `/* Mini Calendar Day View Coloring */\n`;
          css += `body[data-viewkey="day"] #drawerMiniMonthNavigator [data-date="${currentDateStr}"] { background-color: var(--cc3-day-color) !important; }\n`;
          css += `body[data-viewkey="day"] #drawerMiniMonthNavigator [data-date="${currentDateStr}"] > * { background-color: var(--cc3-day-color) !important; }\n`;
          css += `body[data-viewkey="day"] [role="complementary"] [data-date="${currentDateStr}"] { background-color: var(--cc3-day-color) !important; }\n`;
          css += `body[data-viewkey="day"] [role="complementary"] [data-date="${currentDateStr}"] > * { background-color: var(--cc3-day-color) !important; }\n`;

          // Alternative mini calendar selectors
          css += `body[data-viewkey="day"] .v4rOrb [data-date="${currentDateStr}"] { background-color: var(--cc3-day-color) !important; }\n`;
          css += `body[data-viewkey="day"] [data-month] [data-date="${currentDateStr}"] { background-color: var(--cc3-day-color) !important; }\n`;
          css += `body[data-viewkey="day"] [jsname="PkgjIb"] [data-date="${currentDateStr}"] { background-color: var(--cc3-day-color) !important; }\n`;

          console.log('Day view CSS generated:', css);
        } else {
          console.log('No color for day view - dayOfWeek:', dayOfWeek, 'color:', color);
        }
      } else {
        console.log('No current date found for day view');
      }
      return css;
    }

    // Skip CSS generation for month view - handled by monthColoring.js
    if (currentView === 'month') {
      console.log('Month view: Skipping CSS generation, using JavaScript-based coloring');
      return css;
    }

    // Week/Day view - target grids with data-start-date-key
    const base = "[role='grid'] > [data-start-date-key]";
    for (let col = 0; col < 7; col++) {
      const weekday = columnMapping[col];
      if (weekday === undefined) {
        console.log(`No weekday mapping for column ${col}`);
        continue;
      }

      const color = settings.weekdayColors?.[String(weekday)];
      if (!color) {
        console.log(`No color for weekday ${weekday} (column ${col})`);
        continue;
      }

      // Use opacity from settings instead of hardcoded theme-based alpha
      const opacity = settings.weekdayOpacity?.[String(weekday)] || 30; // Default to 30% if not set
      const alpha = opacity / 100; // Convert percentage to decimal
      const rgba = hexToRgba(color, alpha);
      console.log(`Applying color ${color} (${rgba}) to column ${col} for weekday ${weekday}`);

      // Column headers - more precise targeting to avoid bleeding
      css += `${base} > [role='presentation'] > [role='columnheader']:nth-child(${col + 1}):nth-last-child(${7 - col}) { background-color: ${rgba} !important; }\n`;
      css += `${base} > [role='presentation'] > [role='columnheader']:nth-child(${col + 2}):nth-last-child(${7 - col}) { background-color: ${rgba} !important; }\n`;

      // Column content - multiple targeting patterns for reliability
      css += `${base} [data-column-index="${col}"] { background-color: ${rgba} !important; }\n`;
      css += `${base} [data-column-index="${col + 1}"] { background-color: ${rgba} !important; }\n`;

      // nth-child patterns for rows - more specific
      css += `${base} > [role='presentation'] > [role='row'] > [role='gridcell']:nth-child(${col + 1}):nth-last-child(${7 - col}) { background-color: ${rgba} !important; }\n`;
      css += `${base} > [role='presentation'] > [role='row'] > [role='gridcell']:nth-child(${col + 2}):nth-last-child(${7 - col}) { background-color: ${rgba} !important; }\n`;

      // Additional patterns for different calendar layouts - more specific
      css += `${base} > [role='presentation'] > [role='rowgroup'] > [role='row'] > [role='gridcell']:nth-child(${col + 1}):nth-last-child(${7 - col}) { background-color: ${rgba} !important; }\n`;
      css += `${base} > [role='presentation'] > [role='rowgroup'] > [role='row'] > [role='gridcell']:nth-child(${col + 2}):nth-last-child(${7 - col}) { background-color: ${rgba} !important; }\n`;
    }

    return css;
  }

  // Detect which column each weekday is actually in by examining current calendar state
  function detectColumnToWeekdayMapping() {
    const mapping = {}; // columnIndex -> weekday
    const currentView = detectCurrentView();

    // Use new month view detection for month view
    if (currentView === 'month') {
      return detectMonthViewMapping();
    }

    // Method 1: Use actual dates in the calendar (works for week view and some month views)
    const grids = document.querySelectorAll('[role="grid"] > [data-start-date-key]');
    for (const grid of grids) {
      const dateElements = grid.querySelectorAll('[data-date]');
      for (const dateEl of dateElements) {
        const dateStr = dateEl.getAttribute('data-date');
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const date = new Date(dateStr + 'T12:00:00');
          const dayOfWeek = date.getDay();

          // Find column position
          const cell = dateEl.closest('[role="gridcell"]') || dateEl.closest('td');
          if (cell) {
            const row = cell.closest('[role="row"]') || cell.closest('tr');
            if (row) {
              const cells = row.querySelectorAll('[role="gridcell"], td');
              let cellIndex = Array.from(cells).indexOf(cell);

              // Adjust for time column - be more flexible
              if (cells.length > 7) {
                // Likely has time column, adjust if needed
                if (cellIndex > 0 && cellIndex <= 7) cellIndex--;
              }

              if (cellIndex >= 0 && cellIndex < 7) {
                mapping[cellIndex] = dayOfWeek;
              }
            }
          }
        }
      }
      if (Object.keys(mapping).length > 0) break;
    }

    // Method 2: Fallback to calculated mapping based on start week
    if (Object.keys(mapping).length === 0) {
      const startWeek = detectStartWeek();
      console.log('Using fallback mapping with start week:', startWeek);

      // Ensure startWeek is a valid number
      if (isNaN(startWeek) || startWeek < 0 || startWeek > 6) {
        console.warn('Invalid start week detected, using fallback: 1 (Monday)');
        for (let col = 0; col < 7; col++) {
          let weekday = (col + 1) % 7; // Monday start fallback
          mapping[col] = weekday;
        }
      } else {
        for (let col = 0; col < 7; col++) {
          let weekday = (col + startWeek) % 7;
          // Ensure weekday is valid (0-6)
          if (weekday < 0) weekday += 7;
          mapping[col] = weekday;
        }
      }
    }

    console.log('Column to weekday mapping:', mapping);
    return mapping;
  }

  // Month view mapping detection
  function detectMonthViewMapping() {
    const mapping = {}; // columnIndex -> weekday

    const grid = findMonthGrid();
    if (!grid) {
      console.log('Month view: No main grid found');
      return mapping;
    }

    const colOf = getColumnMapper(grid);
    const cells = getMonthCells(grid);

    console.log(`Month view: Found grid with ${cells.length} cells`);

    // Sample some cells to determine weekday mapping
    let mappedCount = 0;
    for (const cell of cells) {
      const col = colOf(cell); // 0..6, left→right visual column
      const iso = getCellISODate(cell); // "YYYY-MM-DD" or null

      if (col >= 0 && col < 7 && iso) {
        const date = new Date(iso + 'T12:00:00');
        const weekday = date.getDay(); // 0=Sunday, 1=Monday, etc.

        if (!isNaN(weekday) && mapping[col] === undefined) {
          mapping[col] = weekday;
          mappedCount++;
          console.log(`Month view: Column ${col} -> Weekday ${weekday} (${iso})`);

          // Stop once we have all 7 columns mapped
          if (mappedCount >= 7) break;
        }
      }
    }

    console.log('Month view column mapping:', mapping);
    return mapping;
  }

  // Missing helper functions for month view
  function findMonthGrid() {
    const grids = Array.from(document.querySelectorAll('[role="grid"]'));
    const candidates = grids
      .map((g) => ({
        g,
        rect: g.getBoundingClientRect(),
        cells: g.querySelectorAll('[role="gridcell"]'),
      }))
      .filter((x) => {
        const hasEnoughCells = x.cells.length >= 28;
        const isLargeEnough = x.rect.width > 600 && x.rect.height > 300;
        const isVisible = x.rect.width > 0 && x.rect.height > 0;
        return hasEnoughCells && isLargeEnough && isVisible;
      });

    if (!candidates.length) return null;

    candidates.sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    return candidates[0].g;
  }

  function getColumnMapper(grid) {
    return function (cell) {
      const row = cell.closest('[role="row"]');
      if (!row) return -1;
      const cells = Array.from(row.querySelectorAll('[role="gridcell"]'));
      return cells.indexOf(cell);
    };
  }

  function getMonthCells(grid) {
    return Array.from(grid.querySelectorAll('[role="gridcell"]')).filter((cell) => cell.offsetParent !== null);
  }

  function getCellISODate(cell) {
    // Try various attributes and text content to extract date
    const dateAttr =
      cell.getAttribute('data-date') || cell.getAttribute('data-datekey') || cell.getAttribute('data-ymd');
    if (dateAttr && /^\d{4}-\d{2}-\d{2}$/.test(dateAttr)) {
      return dateAttr;
    }

    // Try to find date in child elements
    const dateEl = cell.querySelector('[data-date]');
    if (dateEl) {
      const childDate = dateEl.getAttribute('data-date');
      if (childDate && /^\d{4}-\d{2}-\d{2}$/.test(childDate)) {
        return childDate;
      }
    }

    // Try to extract from text content
    const text = cell.textContent?.trim();
    if (text && /^\d{1,2}$/.test(text)) {
      const day = parseInt(text);
      if (day >= 1 && day <= 31) {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const testDate = new Date(year, month, day);
        return normalizeYmdFromDate(testDate);
      }
    }

    return null;
  }

  // Direct DOM styling for day view as fallback
  function applyDayViewDirectStyling(settings) {
    const currentView = detectCurrentView();
    if (currentView !== 'day' || !settings || !settings.enabled) return;

    const currentDate = getCurrentDateInDayView();
    if (!currentDate) return;

    const dayOfWeek = currentDate.getDay();
    const color = settings.weekdayColors?.[String(dayOfWeek)];
    if (!color || color === '#ffffff') return;

    // Use opacity from settings instead of hardcoded value
    const opacity = settings.weekdayOpacity?.[String(dayOfWeek)] || 30; // Default to 30% if not set
    const alpha = opacity / 100; // Convert percentage to decimal
    const rgba = hexToRgba(color, alpha);

    console.log('Applying ultra-precise direct DOM styling for event column only:', rgba);

    // Target ONLY QIYAPb elements, avoid feMFof.A3o4Oe elements
    console.log('Applying direct DOM styling - targeting only QIYAPb elements');

    // Target ONLY QIYAPb elements
    const qiyapbElements = document.querySelectorAll('div.QIYAPb');
    qiyapbElements.forEach((element) => {
      element.style.setProperty('background-color', rgba, 'important');
      console.log('Applied color to QIYAPb element:', element);

      // Only apply to direct children that are not event elements
      const children = element.children;
      for (let child of children) {
        // Skip event elements (feMFof.A3o4Oe) to preserve their original styling
        if (!child.classList.contains('feMFof') || !child.classList.contains('A3o4Oe')) {
          child.style.setProperty('background-color', rgba, 'important');
        }
      }
    });

    // Also apply to mini calendar in day view
    const currentDateStr = normalizeYmdFromDate(getCurrentDateInDayView());
    if (currentDateStr) {
      const miniCalElements = document.querySelectorAll(
        `#drawerMiniMonthNavigator [data-date="${currentDateStr}"], ` +
          `[role="complementary"] [data-date="${currentDateStr}"], ` +
          `.v4rOrb [data-date="${currentDateStr}"], ` +
          `[data-month] [data-date="${currentDateStr}"], ` +
          `[jsname="PkgjIb"] [data-date="${currentDateStr}"]`,
      );
      miniCalElements.forEach((element) => {
        element.style.setProperty('background-color', rgba, 'important');
      });
    }

    console.log('Precise direct DOM styling applied for day view - ONLY QIYAPb elements');
  }

  // === LOCKED MAIN APPLICATION FUNCTION ===
  function applyDayColoring(settings) {
    if (!settings || !settings.enabled) {
      removeStyles();
      return;
    }

    console.log('Applying day coloring with settings:', settings);
    const currentView = detectCurrentView();
    console.log('Current view:', currentView);

    // Handle month view with new month painter - ONLY targets div.MGaLHf.ChfiMc (NOT gridcells)
    if (currentView === 'month') {
      // Use the new month painter if available
      if (window.cc3MonthColoring && window.cc3MonthColoring.applyMonthViewColors) {
        // Convert settings to the format expected by the month painter
        const userColors = {};
        const userOpacity = {};
        if (settings.weekdayColors) {
          // Map weekday colors (0-6, Sun-Sat) to the format expected
          for (let i = 0; i < 7; i++) {
            const color = settings.weekdayColors[String(i)];
            const opacity = settings.weekdayOpacity?.[String(i)] || 30; // Default to 30% if not set
            if (color && color !== '#ffffff') {
              userColors[i] = color;
              userOpacity[i] = opacity;
            }
          }
        }

        // Apply month view colors using user's week start setting
        const userWeekStart = settings.weekStart !== undefined ? settings.weekStart : 0; // Default to Sunday if not set
        console.log('CC3 Month View: Using user week start setting:', userWeekStart);
        window.cc3MonthColoring.applyMonthViewColors(userColors, {
          assumeWeekStartsOn: userWeekStart,
          opacity: userOpacity,
        });
        console.log('CC3 Month View Coloring Applied via New Month Painter - ONLY div.MGaLHf.ChfiMc (NOT gridcells)');
      }

      // Clear any existing CSS to prevent conflicts
      const style = ensureStyleElement();
      style.textContent = '/* Month view uses direct div.MGaLHf.ChfiMc painting only - NO gridcells */';
      return;
    }

    // For day/week views, use existing CSS approach
    const style = ensureStyleElement();
    const css = generateCalendarCSS(settings);
    console.log('Generated CSS length:', css.length);

    style.textContent = css;

    // For day view, force immediate style recalculation AND apply direct styling
    if (currentView === 'day') {
      console.log('Day view CSS being applied:');
      console.log(css);

      // Force browser to recalculate styles
      document.body.offsetHeight; // Trigger reflow

      // Apply direct DOM styling as fallback - immediate application
      createTrackedTimeout(() => {
        if (currentSettings && currentSettings.enabled) {
          console.log('Applying direct styling fallback for day view');
          applyDayViewDirectStyling(currentSettings);
        }
      }, 50);

      // Also apply direct styling after a longer delay if CSS hasn't taken effect
      createTrackedTimeout(() => {
        if (currentSettings && currentSettings.enabled) {
          // Check if CSS coloring was applied to QIYAPb elements only
          const qiyapb = document.querySelector('.QIYAPb');

          if (qiyapb && getComputedStyle(qiyapb).backgroundColor === 'rgba(0, 0, 0, 0)') {
            console.log("CSS didn't work on QIYAPb, applying direct styling");
            applyDayViewDirectStyling(currentSettings);
          }
        }
      }, 200);

      // Log element states for debugging
      createTrackedTimeout(() => {
        if (currentSettings && currentSettings.enabled) {
          const qiyapbElement = document.querySelector('.QIYAPb');
          if (qiyapbElement) {
            console.log('QIYAPb element background after apply:', getComputedStyle(qiyapbElement).backgroundColor);
          } else {
            console.log('No QIYAPb element found in day view');
          }
        }
      }, 300);
    }

    console.log('CC3 Day Coloring Applied - Start Week:', detectStartWeek());
  }

  // === LOCKED DOM MONITORING ===
  let domObserver = null;
  let currentSettings = null;
  let pendingTimeouts = new Set(); // Track all pending timeouts

  // Helper function to create tracked timeouts
  function createTrackedTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
      pendingTimeouts.delete(timeoutId);
      callback();
    }, delay);
    pendingTimeouts.add(timeoutId);
    return timeoutId;
  }

  // Helper function to clear all pending timeouts
  function clearAllTimeouts() {
    for (const timeoutId of pendingTimeouts) {
      clearTimeout(timeoutId);
    }
    pendingTimeouts.clear();
    console.log('Cleared all pending timeouts');
  }

  function setupDOMObserver(settings) {
    if (!settings || !settings.enabled) return;

    // Clean up existing observer
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }

    console.log('Setting up DOM observer for day coloring');

    // Create debounced mutation observer with view-specific handling
    let debounceTimer = null;
    let lastViewKey = document.body.dataset.viewkey;

    domObserver = new MutationObserver((mutations) => {
      let shouldReapply = false;
      let viewChanged = false;

      // Check if view key changed
      const currentViewKey = document.body.dataset.viewkey;
      if (currentViewKey !== lastViewKey) {
        console.log('View change detected:', lastViewKey, '->', currentViewKey);
        lastViewKey = currentViewKey;
        viewChanged = true;
        shouldReapply = true;
      }

      // Check for relevant mutations
      for (const mutation of mutations) {
        // Check for calendar grid changes
        if (mutation.type === 'childList') {
          const target = mutation.target;
          if (
            target.matches &&
            (target.matches('[role="grid"]') ||
              target.matches('[role="main"]') ||
              target.querySelector('[role="grid"]') ||
              target.querySelector('[data-start-date-key]'))
          ) {
            shouldReapply = true;
            break;
          }
        }

        // Check for important attribute changes
        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          if (['data-viewkey', 'data-date', 'data-start-date-key'].includes(attrName)) {
            shouldReapply = true;
            break;
          }
        }
      }

      if (shouldReapply) {
        clearTimeout(debounceTimer);
        // Use longer delay for view changes to allow DOM to settle
        const delay = viewChanged ? 300 : 100;
        debounceTimer = createTrackedTimeout(() => {
          // Check current settings before reapplying
          if (currentSettings && currentSettings.enabled) {
            console.log('DOM mutation detected, reapplying day colors');
            applyDayColoring(currentSettings);
          } else {
            console.log('DOM mutation detected but day coloring is disabled, skipping');
          }
        }, delay);
      }
    });

    // Observe changes to the main calendar area
    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-viewkey', 'data-date', 'data-start-date-key'],
    });
  }


  function waitForCalendarReady() {
    return new Promise((resolve) => {
      const maxWait = 5000;
      const startTime = Date.now();

      const checkReady = () => {
        const hasGrid = document.querySelector('[role="grid"]');
        const hasMainContent = document.querySelector('[role="main"]');
        const hasViewKey = document.body.dataset.viewkey;

        if ((hasGrid || hasMainContent) && hasViewKey) {
          console.log('Calendar ready - grid:', !!hasGrid, 'main:', !!hasMainContent, 'viewkey:', hasViewKey);
          resolve(true);
          return;
        }

        if (Date.now() - startTime < maxWait) {
          setTimeout(checkReady, 100);
        } else {
          console.log('Calendar readiness timeout reached, proceeding anyway');
          resolve(false);
        }
      };

      checkReady();
    });
  }

  // === LOCKED FEATURE REGISTRATION ===
  const feature = {
    id: FEATURE_ID,
    init: async (settings) => {
      console.log('=== INITIALIZING LOCKED DAY COLORING FEATURE ===');
      console.log('Settings received:', settings);
      console.log('Current URL:', window.location.href);
      console.log('Body viewkey:', document.body.dataset.viewkey);

      // If settings are empty or missing, try to load them directly
      if (!settings || Object.keys(settings).length === 0) {
        console.log('Empty settings received, loading from storage...');
        try {
          if (window.cc3Storage) {
            const rawSettings = await window.cc3Storage.getAll();
            console.log('Raw settings from storage:', rawSettings);

            // Handle nested settings structure
            if (rawSettings && rawSettings.settings) {
              settings = rawSettings.settings.dayColoring || {};
              console.log('Extracted nested dayColoring settings:', settings);
            } else {
              settings = rawSettings.dayColoring || {};
              console.log('Direct dayColoring settings:', settings);
            }
          }
        } catch (error) {
          console.error('Error loading settings from storage:', error);
          settings = {};
        }
      }

      // Store current settings for observers
      currentSettings = settings;

      // Apply colors immediately if enabled
      if (settings && settings.enabled) {
        console.log('Day coloring is enabled, setting up monitoring and applying colors');

        // Wait for calendar to be ready
        await waitForCalendarReady();

        // Apply colors immediately
        applyDayColoring(settings);

        // Set up DOM observer for dynamic updates
        setupDOMObserver(settings);

        // Apply colors again after a short delay to ensure they stick
        createTrackedTimeout(() => {
          if (currentSettings && currentSettings.enabled) {
            applyDayColoring(currentSettings);
          }
        }, 300);
        createTrackedTimeout(() => {
          if (currentSettings && currentSettings.enabled) {
            applyDayColoring(currentSettings);
          }
        }, 1000);
      } else {
        console.log('Day coloring is disabled or no settings available');
      }

      console.log('=== LOCKED DAY COLORING FEATURE INITIALIZED ===');
    },
    onSettingsChanged: (settings) => {
      console.log('=== DAY COLORING SETTINGS CHANGED ===');
      console.log('New settings received:', settings);
      console.log('Feature enabled:', settings?.enabled);
      console.log('Current view:', detectCurrentView());

      // Prevent redundant updates if settings haven't actually changed
      if (
        currentSettings &&
        currentSettings.enabled === settings?.enabled &&
        JSON.stringify(currentSettings.weekdayColors) === JSON.stringify(settings?.weekdayColors) &&
        JSON.stringify(currentSettings.weekdayOpacity) === JSON.stringify(settings?.weekdayOpacity)
      ) {
        console.log('Settings unchanged, skipping update');
        return;
      }

      currentSettings = settings;

      if (settings && settings.enabled) {
        console.log('🟢 ENABLING day coloring');

        // Set up DOM observer
        setupDOMObserver(settings);

        // Apply colors immediately
        applyDayColoring(settings);

        console.log('✅ Day coloring enabled and applied');
      } else {
        console.log('🔴 DISABLING day coloring - cleaning up observer and styles');

        // Clean up DOM observer when disabled
        if (domObserver) {
          domObserver.disconnect();
          domObserver = null;
          console.log('✅ DOM observer cleaned up');
        }

        // Clear all pending timeouts
        clearAllTimeouts();

        // Remove colors immediately and force refresh
        removeStyles();
        removeDirectStyling();

        // Force browser to recalculate styles immediately
        document.body.offsetHeight; // Trigger reflow

        // Clean up month view if it was colored
        if (window.cc3MonthColoring && window.cc3MonthColoring.clearMonthViewColors) {
          window.cc3MonthColoring.clearMonthViewColors();
        }

        console.log('✅ All styles and direct styling removed');
        console.log('🔴 Day coloring fully disabled');
      }

      console.log('=== DAY COLORING SETTINGS CHANGE COMPLETE ===');
    },
    teardown: () => {
      console.log('Day coloring feature teardown');

      // Clean up DOM observer
      if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
      }

      // Clean up month painter if it was used
      if (window.cc3MonthColoring && window.cc3MonthColoring.teardownMonthPainter) {
        window.cc3MonthColoring.teardownMonthPainter();
      }

      // Remove styles
      removeStyles();
      removeDirectStyling();
    },
  };

  // Register the locked feature
  window.cc3Features.register(feature);
})();
