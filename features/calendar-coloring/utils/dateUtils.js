// LOCKED CALENDAR COLORING FEATURE - DO NOT MODIFY
// Shared date utilities for calendar coloring
// All changes to calendar coloring should be made here only

// Parse YYYY-MM-DD as local Date to prevent all-day month events from spanning two days
function _parseLocalYMD(ymd) {
  if (!ymd || typeof ymd !== 'string') return null;
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

// Enhanced calendar grid analysis to map cell positions to actual dates
function getActualDateFromCalendarGrid(cellEl, dayNumber) {
  if (!cellEl || !dayNumber) return null;

  console.log('getActualDateFromCalendarGrid: Analyzing cell with day', dayNumber);

  // Find the main calendar grid
  const grid = findMonthGrid();
  if (!grid) {
    console.log('getActualDateFromCalendarGrid: No grid found');
    return null;
  }

  // Get all cells in the grid
  const allCells = Array.from(
    grid.querySelectorAll('[data-datekey], [data-dragsource-type], [role="gridcell"], td, th'),
  );
  console.log('getActualDateFromCalendarGrid: Found', allCells.length, 'cells in grid');

  // Find the row and column of our target cell
  const targetRow = cellEl.closest('[role="row"], tr');
  if (!targetRow) {
    console.log('getActualDateFromCalendarGrid: No row found for cell');
    return null;
  }

  const allRows = Array.from(grid.querySelectorAll('[role="row"], tr'));
  const rowIndex = allRows.indexOf(targetRow);
  console.log('getActualDateFromCalendarGrid: Target cell is in row', rowIndex);

  // Get the cells in the target row
  const rowCells = Array.from(
    targetRow.querySelectorAll('[data-datekey], [data-dragsource-type], [role="gridcell"], td, th'),
  );
  const colIndex = rowCells.indexOf(cellEl);
  console.log('getActualDateFromCalendarGrid: Target cell is in column', colIndex);

  if (rowIndex < 0 || colIndex < 0) {
    console.log('getActualDateFromCalendarGrid: Could not determine position');
    return null;
  }

  // Get the current month/year context
  const currentMonthYear = getCurrentMonthYear();
  if (!currentMonthYear) {
    console.log('getActualDateFromCalendarGrid: Could not get current month/year');
    return null;
  }

  // Calculate the actual date based on the calendar grid structure
  // First row might contain days from the previous month
  // We need to determine the first day of the month and its weekday
  const firstDayOfMonth = new Date(currentMonthYear.year, currentMonthYear.month, 1);
  const firstDayWeekday = firstDayOfMonth.getDay(); // 0=Sunday, 1=Monday, etc.

  console.log(
    'getActualDateFromCalendarGrid: First day of month is',
    firstDayOfMonth.toDateString(),
    'weekday',
    firstDayWeekday,
  );

  // Calculate the actual date for this cell
  let actualDate;

  if (rowIndex === 0) {
    // First row - might contain days from previous month
    const daysFromPrevMonth = firstDayWeekday;
    const dayInGrid = colIndex + 1; // 1-based

    if (dayInGrid <= daysFromPrevMonth) {
      // This is a day from the previous month
      const prevMonth = new Date(currentMonthYear.year, currentMonthYear.month - 1, 0);
      const dayInPrevMonth = prevMonth.getDate() - daysFromPrevMonth + dayInGrid;
      actualDate = new Date(currentMonthYear.year, currentMonthYear.month - 1, dayInPrevMonth);
    } else {
      // This is a day from the current month
      const dayInCurrentMonth = dayInGrid - daysFromPrevMonth;
      actualDate = new Date(currentMonthYear.year, currentMonthYear.month, dayInCurrentMonth);
    }
  } else {
    // Subsequent rows - calculate based on row and column
    const daysFromPrevMonth = firstDayWeekday;
    const dayInGrid = rowIndex * 7 + colIndex + 1; // 1-based
    const dayInCurrentMonth = dayInGrid - daysFromPrevMonth;

    // Check if this day is in the current month
    const daysInCurrentMonth = new Date(currentMonthYear.year, currentMonthYear.month + 1, 0).getDate();

    if (dayInCurrentMonth <= 0) {
      // This is a day from the previous month
      const prevMonth = new Date(currentMonthYear.year, currentMonthYear.month - 1, 0);
      const dayInPrevMonth = prevMonth.getDate() + dayInCurrentMonth;
      actualDate = new Date(currentMonthYear.year, currentMonthYear.month - 1, dayInPrevMonth);
    } else if (dayInCurrentMonth > daysInCurrentMonth) {
      // This is a day from the next month
      const dayInNextMonth = dayInCurrentMonth - daysInCurrentMonth;
      actualDate = new Date(currentMonthYear.year, currentMonthYear.month + 1, dayInNextMonth);
    } else {
      // This is a day from the current month
      actualDate = new Date(currentMonthYear.year, currentMonthYear.month, dayInCurrentMonth);
    }
  }

  // Verify that the calculated date matches the day number we're looking for
  if (actualDate.getDate() === dayNumber) {
    const y = actualDate.getFullYear();
    const m = String(actualDate.getMonth() + 1).padStart(2, '0');
    const d = String(actualDate.getDate()).padStart(2, '0');
    const result = `${y}-${m}-${d}`;
    console.log('getActualDateFromCalendarGrid: Calculated date', result, 'for day', dayNumber);
    return result;
  } else {
    console.log(
      'getActualDateFromCalendarGrid: Date mismatch - calculated',
      actualDate.getDate(),
      'but expected',
      dayNumber,
    );
    return null;
  }
}

// Helper function to get current month/year from calendar context
function getCurrentMonthYear() {
  // Method 1: Extract from URL (most reliable for Google Calendar)
  const currentURL = window.location.href;

  // Google Calendar URL patterns: /month/YYYY/M/D or /r/month/YYYY/M/D
  const urlMatch = currentURL.match(/\/(?:r\/)?month\/(\d{4})\/(\d{1,2})(?:\/\d{1,2})?/);
  if (urlMatch) {
    const year = parseInt(urlMatch[1]);
    const month = parseInt(urlMatch[2]) - 1; // JS months are 0-based
    console.log(`getCurrentMonthYear: URL match - Year: ${year}, Month: ${month}`);
    return { year, month };
  }

  // Method 2: Look for month/year in DOM elements
  const monthYearSelectors = [
    // Google Calendar specific selectors
    '[data-navigation="month"] [jsname="K4r5Ff"]', // Month navigation
    '[data-view="month"] h1',
    '[aria-label*="202"]', // Year in aria-label
    '[role="heading"][aria-level="1"]',
    '[data-month]',
    '.mv-daynames-container + div h2', // Month header
    '.h1-alike',
    'h1, h2, h3',
    '[role="heading"]',
    '.UkQN7c', // Common month header class
    '[jsname="navigation"]',
  ];

  for (const selector of monthYearSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.trim();
        const ariaLabel = el.getAttribute('aria-label');

        for (const textSource of [text, ariaLabel]) {
          if (!textSource) continue;

          console.log(`getCurrentMonthYear: Checking text: "${textSource}"`);

          // Try to extract year
          const yearMatch = textSource.match(/\b(20\d{2})\b/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);

            // Enhanced month patterns (multilingual)
            const monthNames = {
              // English
              january: 0,
              jan: 0,
              february: 1,
              feb: 1,
              march: 2,
              mar: 2,
              april: 3,
              apr: 3,
              may: 4,
              june: 5,
              jun: 5,
              july: 6,
              jul: 6,
              august: 7,
              aug: 7,
              september: 8,
              sep: 8,
              october: 9,
              oct: 9,
              november: 10,
              nov: 10,
              december: 11,
              dec: 11,
              // Spanish
              enero: 0,
              febrero: 1,
              marzo: 2,
              abril: 3,
              mayo: 4,
              junio: 5,
              julio: 6,
              agosto: 7,
              septiembre: 8,
              octubre: 9,
              noviembre: 10,
              diciembre: 11,
              // French
              janvier: 0,
              février: 1,
              mars: 2,
              avril: 3,
              mai: 4,
              juin: 5,
              juillet: 6,
              août: 7,
              septembre: 8,
              octobre: 9,
              novembre: 10,
              décembre: 11,
              // German
              januar: 0,
              februar: 1,
              märz: 2,
              april: 3,
              mai: 4,
              juni: 5,
              juli: 6,
              august: 7,
              september: 8,
              oktober: 9,
              november: 10,
              dezember: 11,
            };

            for (const [monthName, monthIndex] of Object.entries(monthNames)) {
              if (textSource.toLowerCase().includes(monthName)) {
                console.log(`getCurrentMonthYear: Found via DOM - Year: ${year}, Month: ${monthIndex} (${monthName})`);
                return { year, month: monthIndex };
              }
            }

            // Try numeric month format (like "6 2025" or "2025-06")
            const numericMatch = textSource.match(/\b(\d{1,2})\s+\d{4}\b/) || textSource.match(/\d{4}[\-\/](\d{1,2})/);
            if (numericMatch) {
              const month = parseInt(numericMatch[1]) - 1; // Convert to 0-based
              if (month >= 0 && month <= 11) {
                console.log(`getCurrentMonthYear: Found numeric format - Year: ${year}, Month: ${month}`);
                return { year, month };
              }
            }
          }
        }
      }
    } catch (e) {
      console.log(`getCurrentMonthYear: Error with selector "${selector}":`, e);
    }
  }

  // Method 3: Use current date as fallback
  const now = new Date();
  console.log(
    `getCurrentMonthYear: Using fallback current date - Year: ${now.getFullYear()}, Month: ${now.getMonth()}`,
  );
  return { year: now.getFullYear(), month: now.getMonth() };
}

// Helper function to try parsing various date formats
function tryParseDate(text) {
  if (!text) {
    console.log('tryParseDate: Empty text provided');
    return null;
  }

  console.log(`tryParseDate: Attempting to parse: "${text}"`);

  // Clean the text
  const cleanText = text.trim();

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanText)) {
    console.log(`tryParseDate: Found ISO format: ${cleanText}`);
    return cleanText;
  }

  // Enhanced day extraction - look for day numbers in context
  // First try to extract from full date context (e.g., "Friday, October 3", "October 10")
  let dayMatch = null;

  // Pattern 1: "Day, Month DD" or "Month DD"
  const contextDayMatch = cleanText.match(
    /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)[,\s]+(?:january|february|march|april|may|june|july|august|september|october|november|december[,\s]+)?(\d{1,2})(?!\d)/i,
  );
  if (contextDayMatch) {
    dayMatch = contextDayMatch;
  } else {
    // Pattern 2: Last number in the string (fallback)
    const allNumbers = cleanText.match(/\b(\d{1,2})\b/g);
    if (allNumbers && allNumbers.length > 0) {
      // Take the last number as it's likely the day
      const lastNumber = allNumbers[allNumbers.length - 1];
      dayMatch = [lastNumber, lastNumber];
    }
  }

  if (dayMatch) {
    const day = parseInt(dayMatch[1]);
    console.log(`tryParseDate: Found day number: ${day}`);
    if (day >= 1 && day <= 31) {
      const currentDate = getCurrentMonthYear();
      console.log('tryParseDate: currentDate from getCurrentMonthYear:', currentDate);
      if (currentDate) {
        try {
          // Parse the month from the text if available, otherwise use current month
          let targetMonth = currentDate.month;
          let targetYear = currentDate.year;

          // Check if the text contains a different month name
          const monthNames = {
            january: 0,
            february: 1,
            march: 2,
            april: 3,
            may: 4,
            june: 5,
            july: 6,
            august: 7,
            september: 8,
            october: 9,
            november: 10,
            december: 11,
          };

          for (const [monthName, monthIndex] of Object.entries(monthNames)) {
            if (cleanText.toLowerCase().includes(monthName)) {
              targetMonth = monthIndex;
              break;
            }
          }

          const constructedDate = new Date(targetYear, targetMonth, day);
          if (!isNaN(constructedDate.getTime())) {
            const y = constructedDate.getFullYear();
            const m = String(constructedDate.getMonth() + 1).padStart(2, '0');
            const d = String(constructedDate.getDate()).padStart(2, '0');
            const result = `${y}-${m}-${d}`;
            console.log(`tryParseDate: Constructed date: ${result}`);
            return result;
          }
        } catch (e) {
          console.log('tryParseDate: Error constructing date:', e);
          // Ignore construction errors
        }
      }
    }
  }

  // Try more specific date formats
  const dateFormats = [
    // YYYY-MM-DD variants
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
    // MM/DD/YYYY or M/D/YYYY
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    // DD/MM/YYYY or D/M/YYYY (European)
    /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/,
    // Month Day, Year (e.g., "June 1, 2025")
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
    // Day Month Year (e.g., "1 June 2025")
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
    // Short month formats
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i,
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i,
  ];

  for (const format of dateFormats) {
    const match = cleanText.match(format);
    if (match) {
      try {
        // Parse the matched date string
        const dateStr = match[0];
        const d = new Date(dateStr);
        if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const result = `${y}-${m}-${day}`;
          console.log(`tryParseDate: Parsed formatted date "${dateStr}" to: ${result}`);
          return result;
        }
      } catch (e) {
        console.log(`tryParseDate: Error parsing format match "${match[0]}":`, e);
      }
    }
  }

  // Try parsing as a general date string (fallback)
  try {
    const d = new Date(cleanText);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const result = `${y}-${m}-${day}`;
      console.log(`tryParseDate: Parsed general date "${cleanText}" to: ${result}`);
      return result;
    }
  } catch (e) {
    console.log(`tryParseDate: Failed to parse "${cleanText}" as general date:`, e);
  }

  console.log(`tryParseDate: Could not parse: "${cleanText}"`);
  return null;
}

// Export the utilities
window.cc3DateUtils = {
  _parseLocalYMD,
  getActualDateFromCalendarGrid,
  getCurrentMonthYear,
  tryParseDate,
};
