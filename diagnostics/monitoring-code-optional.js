// Optional Monitoring Code - Add to features/tasks-coloring/index.js
// Place this near the doRepaint() function

/**
 * Monitor for selector health - warn if Google changes task DOM structure
 * Logs a warning if we can't find tasks but know they should exist
 */
let lastTaskCount = 0;
let consecutiveZeroFindings = 0;

function monitorSelectorHealth() {
  // Only run check every 10 repaints to avoid spam
  if (Math.random() > 0.1) return;

  const taskElements = document.querySelectorAll(
    '[data-eventid^="tasks."], [data-eventid^="tasks_"]'
  );

  const currentCount = taskElements.length;

  // If we suddenly can't find ANY tasks after previously finding some
  if (currentCount === 0 && lastTaskCount > 0) {
    consecutiveZeroFindings++;

    // After 3 consecutive zero findings, log a warning
    if (consecutiveZeroFindings >= 3) {
      console.warn('[ColorKit] ⚠️ Task selectors may have changed!');
      console.warn('[ColorKit] Previously found tasks but now finding 0.');
      console.warn('[ColorKit] Google may have updated the Calendar UI.');
      console.warn('[ColorKit] Please run diagnostics: /diagnostics/quick-task-inspector.js');

      // Reset counter to avoid spam
      consecutiveZeroFindings = 0;
    }
  } else if (currentCount > 0) {
    // Reset if we find tasks again
    consecutiveZeroFindings = 0;
    lastTaskCount = currentCount;
  }
}

// Call in doRepaint() - add this line:
// monitorSelectorHealth();
