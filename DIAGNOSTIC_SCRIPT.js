/**
 * DIAGNOSTIC SCRIPT: Recurring Task Color Bug Investigation
 *
 * INSTRUCTIONS:
 * 1. Open Google Calendar (calendar.google.com)
 * 2. Open DevTools Console (F12)
 * 3. Copy and paste this ENTIRE script into the console
 * 4. Press Enter to load the diagnostic functions
 * 5. Run: await diagnosticReport()
 */

async function diagnosticReport() {
  console.log('═'.repeat(60));
  console.log('DIAGNOSTIC REPORT: Recurring Task Color Bug');
  console.log('═'.repeat(60));
  console.log('');

  await checkStorage();
  await checkDOMElements();
  await checkFingerprintExtraction();
  await simulateGetColorForTask();

  console.log('');
  console.log('═'.repeat(60));
  console.log('DIAGNOSTIC REPORT COMPLETE');
  console.log('═'.repeat(60));
}

async function checkStorage() {
  console.log('STEP 1: Checking Chrome Storage');
  console.log('-'.repeat(60));

  const sync = await chrome.storage.sync.get(['cf.taskColors', 'cf.recurringTaskColors']);
  console.log('cf.taskColors:', sync['cf.taskColors'] || {});
  console.log('cf.recurringTaskColors:', sync['cf.recurringTaskColors'] || {});

  const recurringCount = Object.keys(sync['cf.recurringTaskColors'] || {}).length;
  if (recurringCount === 0) {
    console.log('NO RECURRING COLORS IN STORAGE!');
  } else {
    console.log('Found ' + recurringCount + ' recurring colors');
  }
  console.log('');
}

async function checkDOMElements() {
  console.log('STEP 2: Checking DOM Elements');
  console.log('-'.repeat(60));

  const tasks = document.querySelectorAll('[data-eventid^="tasks."]');
  console.log('Found ' + tasks.length + ' task elements');
  console.log('');

  Array.from(tasks).slice(0, 5).forEach(function(el, i) {
    const eventId = el.getAttribute('data-eventid');
    const textEl = el.querySelector('.XuJrye');
    console.log('Element ' + (i + 1) + ': ' + eventId);
    if (textEl) {
      console.log('  Text: "' + textEl.textContent + '"');
    } else {
      console.log('  NO .XuJrye element');
    }
  });
  console.log('');
}

async function checkFingerprintExtraction() {
  console.log('STEP 3: Fingerprint Extraction');
  console.log('-'.repeat(60));

  const tasks = document.querySelectorAll('[data-eventid^="tasks."]');
  const fingerprints = new Set();

  tasks.forEach(function(el) {
    const textEl = el.querySelector('.XuJrye');
    if (textEl) {
      const text = textEl.textContent || '';
      const titleMatch = text.match(/task:\s*([^,]+)/);
      const timeMatch = text.match(/(\d+(?::\d+)?(?:am|pm))\s*$/i);
      if (titleMatch && timeMatch) {
        fingerprints.add(titleMatch[1].trim() + '|' + timeMatch[1].toLowerCase());
      }
    }
  });

  console.log('DOM fingerprints:', Array.from(fingerprints));

  const sync = await chrome.storage.sync.get('cf.recurringTaskColors');
  console.log('Storage fingerprints:', Object.keys(sync['cf.recurringTaskColors'] || {}));
  console.log('');
}

async function simulateGetColorForTask() {
  console.log('STEP 4: Simulating getColorForTask()');
  console.log('-'.repeat(60));

  const el = document.querySelector('[data-eventid^="tasks."]');
  if (!el) {
    console.log('No task found');
    return;
  }

  const eventId = el.getAttribute('data-eventid');
  const taskId = eventId.replace(/^tasks[._]/, '');
  console.log('Testing: ' + eventId + ' (ID: ' + taskId + ')');
  console.log('');

  const sync = await chrome.storage.sync.get(['cf.taskColors', 'cf.recurringTaskColors']);
  const cache = {
    manualColors: sync['cf.taskColors'] || {},
    recurringTaskColors: sync['cf.recurringTaskColors'] || {}
  };

  console.log('PRIORITY 1: Manual color');
  if (cache.manualColors[taskId]) {
    console.log('  FOUND: ' + cache.manualColors[taskId]);
    return;
  } else {
    console.log('  Not found');
  }

  console.log('');
  console.log('PRIORITY 2: Recurring color');
  const textEl = el.querySelector('.XuJrye');
  if (!textEl) {
    console.log('  No .XuJrye element - FINGERPRINT EXTRACTION FAILS!');
    return;
  }

  const text = textEl.textContent || '';
  const titleMatch = text.match(/task:\s*([^,]+)/);
  const timeMatch = text.match(/(\d+(?::\d+)?(?:am|pm))\s*$/i);

  if (titleMatch && timeMatch) {
    const fp = titleMatch[1].trim() + '|' + timeMatch[1].toLowerCase();
    console.log('  Fingerprint: "' + fp + '"');

    if (cache.recurringTaskColors[fp]) {
      console.log('  FOUND: ' + cache.recurringTaskColors[fp]);
      console.log('');
      console.log('Priority 2 SHOULD WORK!');
    } else {
      console.log('  Not in storage');
      console.log('  Available: ' + Object.keys(cache.recurringTaskColors).join(', '));
      console.log('');
      console.log('BUG: Fingerprint mismatch!');
    }
  } else {
    console.log('  Extraction failed');
    console.log('  Title: ' + (titleMatch ? titleMatch[1] : 'FAIL'));
    console.log('  Time: ' + (timeMatch ? timeMatch[1] : 'FAIL'));
    console.log('');
    console.log('BUG: Regex pattern does not match!');
  }
}

console.log('Diagnostic script loaded! Run: await diagnosticReport()');
