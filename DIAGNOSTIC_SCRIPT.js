// ========================================
// COMPREHENSIVE DIAGNOSTIC SCRIPT
// ========================================
// Run this in browser console on calendar.google.com
// Copy ALL output and share with developer

(async function comprehensiveDiagnostic() {
  console.clear();
  console.log('═══════════════════════════════════════════════════════');
  console.log('         COLORKIT TASK COLORING DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = {
    timestamp: new Date().toISOString(),
    tests: {},
    errors: [],
  };

  // TEST 1: Extension Loaded
  console.log('TEST 1: Extension Loaded');
  console.log('─'.repeat(50));
  const extensionLoaded = typeof chrome?.storage !== 'undefined';
  results.tests.extensionLoaded = extensionLoaded;
  console.log(extensionLoaded ? '✅ PASS' : '❌ FAIL - Extension not loaded');

  if (!extensionLoaded) {
    console.error('❌ CRITICAL: Extension not loaded. Refresh page and try again.');
    return results;
  }
  console.log('');

  // TEST 2: Settings Check
  console.log('TEST 2: Settings Check');
  console.log('─'.repeat(50));
  const settings = await new Promise(resolve => {
    chrome.storage.sync.get('settings', result => resolve(result.settings || {}));
  });

  results.tests.settings = {
    taskColoringEnabled: settings?.taskColoring?.enabled,
    taskListColoringEnabled: settings?.taskListColoring?.enabled,
    oauthGranted: settings?.taskListColoring?.oauthGranted,
  };

  console.log('Task Coloring Enabled:', settings?.taskColoring?.enabled ? '✅ YES' : '❌ NO');
  console.log('Task List Coloring Enabled:', settings?.taskListColoring?.enabled ? '✅ YES' : '❌ NO');
  console.log('OAuth Granted:', settings?.taskListColoring?.oauthGranted ? '✅ YES' : '❌ NO');
  console.log('');

  // TEST 3: Task Elements in DOM
  console.log('TEST 3: Task Elements in DOM');
  console.log('─'.repeat(50));

  const oldFormatTasks = document.querySelectorAll('[data-eventid^="tasks."]');
  const oldUnderscoreTasks = document.querySelectorAll('[data-eventid^="tasks_"]');
  const newFormatTasks = document.querySelectorAll('[data-eventid^="ttb_"]');
  const allTaskElements = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"]');

  results.tests.domElements = {
    oldFormat: oldFormatTasks.length,
    oldUnderscore: oldUnderscoreTasks.length,
    newFormat: newFormatTasks.length,
    total: allTaskElements.length,
  };

  console.log('OLD UI (tasks.):', oldFormatTasks.length);
  console.log('OLD UI (tasks_):', oldUnderscoreTasks.length);
  console.log('NEW UI (ttb_):', newFormatTasks.length);
  console.log('TOTAL:', allTaskElements.length);

  if (allTaskElements.length === 0) {
    console.error('❌ NO TASKS FOUND - Are there tasks visible on the calendar?');
    console.log('');
    return results;
  }
  console.log('');

  // TEST 4: Analyze First 3 Tasks
  console.log('TEST 4: Task ID Extraction Analysis');
  console.log('─'.repeat(50));

  for (let i = 0; i < Math.min(3, allTaskElements.length); i++) {
    const task = allTaskElements[i];
    const eventId = task.getAttribute('data-eventid');
    const isCompleted = task.textContent.includes('Completed') || task.textContent.includes('completed');

    console.log(`\nTask ${i + 1}:`);
    console.log('  data-eventid:', eventId);
    console.log('  Status:', isCompleted ? 'Completed' : 'Pending');
    console.log('  Text:', task.textContent.substring(0, 60) + '...');

    // Determine UI type and extract ID
    if (eventId.startsWith('ttb_')) {
      console.log('  UI Type: NEW (ttb_)');

      try {
        const base64Part = eventId.slice(4);
        const decoded = atob(base64Part);
        const parts = decoded.split(' ');
        const calendarEventId = parts[0];
        const email = parts[1] || 'N/A';

        console.log('  Decoded calendar ID:', calendarEventId);
        console.log('  Email:', email);

        // Check if in calendar mapping cache
        const calendarMappings = await new Promise(resolve => {
          chrome.storage.local.get('cf.calendarEventMapping', result => {
            resolve(result['cf.calendarEventMapping'] || {});
          });
        });

        if (calendarMappings[calendarEventId]) {
          const mapping = calendarMappings[calendarEventId];
          console.log('  ✅ CACHED Task API ID:', mapping.taskApiId);
          console.log('  Task Fragment:', mapping.taskFragment);

          // Verify this ID is in task-to-list mapping
          const taskToListMap = await new Promise(resolve => {
            chrome.storage.local.get('cf.taskToListMap', result => {
              resolve(result['cf.taskToListMap'] || {});
            });
          });

          if (taskToListMap[mapping.taskApiId]) {
            console.log('  ✅ FOUND in task-to-list mapping');
            console.log('  List ID:', taskToListMap[mapping.taskApiId]);
          } else {
            console.error('  ❌ NOT FOUND in task-to-list mapping');
            console.log('  This is the problem! Task ID format mismatch.');
          }
        } else {
          console.warn('  ⚠️  NOT CACHED - Needs Calendar API lookup');

          // Try to resolve via background
          console.log('  Attempting Calendar API resolution...');
          chrome.runtime.sendMessage({
            type: 'RESOLVE_CALENDAR_EVENT',
            calendarEventId: calendarEventId
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('  ❌ Message error:', chrome.runtime.lastError.message);
            } else if (response?.success) {
              console.log('  ✅ Resolved Task API ID:', response.taskApiId);
              console.log('  Task Fragment:', response.taskFragment);
            } else {
              console.error('  ❌ Resolution failed:', response?.error);
            }
          });
        }
      } catch (error) {
        console.error('  ❌ Decoding failed:', error.message);
        results.errors.push({task: i + 1, error: error.message});
      }
    } else if (eventId.startsWith('tasks.') || eventId.startsWith('tasks_')) {
      console.log('  UI Type: OLD (tasks.)');
      const taskId = eventId.slice(6);
      console.log('  Task ID (direct):', taskId);
      console.log('  Length:', taskId.length, 'chars');
      console.log('  Format:', taskId.includes('=') ? 'Base64 encoded' : 'Decoded fragment');

      // Check if in task-to-list mapping
      const taskToListMap = await new Promise(resolve => {
        chrome.storage.local.get('cf.taskToListMap', result => {
          resolve(result['cf.taskToListMap'] || {});
        });
      });

      if (taskToListMap[taskId]) {
        console.log('  ✅ FOUND in task-to-list mapping');
        console.log('  List ID:', taskToListMap[taskId]);
      } else {
        console.error('  ❌ NOT FOUND in task-to-list mapping');

        // Try base64 encoding the ID
        try {
          const encodedId = btoa(taskId);
          console.log('  Trying base64 encoded version:', encodedId);
          if (taskToListMap[encodedId]) {
            console.log('  ✅ FOUND with base64 encoding!');
            console.log('  List ID:', taskToListMap[encodedId]);
            console.error('  🐛 BUG: Extension is returning decoded ID instead of encoded!');
          }
        } catch (e) {}
      }
    }
  }
  console.log('');

  // TEST 5: Storage Contents
  console.log('TEST 5: Storage Contents');
  console.log('─'.repeat(50));

  const manualColors = await new Promise(resolve => {
    chrome.storage.sync.get('cf.taskColors', result => resolve(result['cf.taskColors'] || {}));
  });

  const taskToListMap = await new Promise(resolve => {
    chrome.storage.local.get('cf.taskToListMap', result => resolve(result['cf.taskToListMap'] || {}));
  });

  const listColors = await new Promise(resolve => {
    chrome.storage.sync.get('cf.taskListColors', result => resolve(result['cf.taskListColors'] || {}));
  });

  const calendarMappings = await new Promise(resolve => {
    chrome.storage.local.get('cf.calendarEventMapping', result => resolve(result['cf.calendarEventMapping'] || {}));
  });

  const taskListsMeta = await new Promise(resolve => {
    chrome.storage.local.get('cf.taskListsMeta', result => resolve(result['cf.taskListsMeta'] || []));
  });

  results.tests.storage = {
    manualColors: Object.keys(manualColors).length,
    taskToListMap: Object.keys(taskToListMap).length,
    listColors: Object.keys(listColors).length,
    calendarMappings: Object.keys(calendarMappings).length,
    taskLists: taskListsMeta.length,
  };

  console.log('Manual Colors:', Object.keys(manualColors).length);
  console.log('Task-to-List Mappings:', Object.keys(taskToListMap).length);
  console.log('List Default Colors:', Object.keys(listColors).length);
  console.log('Calendar Event Mappings:', Object.keys(calendarMappings).length);
  console.log('Task Lists Synced:', taskListsMeta.length);

  if (Object.keys(taskToListMap).length === 0) {
    console.error('❌ Task-to-list mapping is EMPTY!');
    console.log('This means OAuth was granted but sync has not run yet.');
    console.log('OR the sync failed silently.');
  }

  if (Object.keys(taskToListMap).length > 0) {
    console.log('\nSample task IDs in mapping:');
    Object.keys(taskToListMap).slice(0, 3).forEach((taskId, idx) => {
      console.log(`  ${idx + 1}. ${taskId} → List: ${taskToListMap[taskId]}`);
    });
  }
  console.log('');

  // TEST 6: OAuth Token Check
  console.log('TEST 6: OAuth Token Check');
  console.log('─'.repeat(50));

  try {
    const token = await new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        resolve(token || null);
      });
    });

    results.tests.oauth = {
      tokenExists: !!token,
      tokenPreview: token ? token.substring(0, 20) + '...' : null,
    };

    if (token) {
      console.log('✅ OAuth token exists:', token.substring(0, 20) + '...');

      // Check scopes
      const tokenInfo = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
      const data = await tokenInfo.json();

      results.tests.oauth.scopes = data.scope;
      results.tests.oauth.expiresIn = data.expires_in;

      const hasTasksScope = data.scope.includes('tasks.readonly');
      const hasCalendarScope = data.scope.includes('calendar.readonly');

      console.log('Scopes granted:', data.scope);
      console.log('✅ tasks.readonly:', hasTasksScope);
      console.log(hasCalendarScope ? '✅' : '❌', 'calendar.readonly:', hasCalendarScope);

      if (!hasCalendarScope) {
        console.error('❌ CRITICAL: calendar.readonly scope NOT granted!');
        console.log('This is why Calendar API is not working.');
        results.errors.push({error: 'calendar.readonly scope not granted'});
      }
    } else {
      console.error('❌ No OAuth token found');
      results.errors.push({error: 'No OAuth token'});
    }
  } catch (error) {
    console.error('❌ OAuth check failed:', error.message);
    results.errors.push({error: 'OAuth check failed: ' + error.message});
  }
  console.log('');

  // TEST 7: Content Script Check
  console.log('TEST 7: Content Script Check');
  console.log('─'.repeat(50));

  const hasCC3Storage = typeof window.cc3Storage !== 'undefined';
  results.tests.contentScript = hasCC3Storage;

  console.log('Content script loaded:', hasCC3Storage ? '✅ YES' : '❌ NO');

  if (!hasCC3Storage) {
    console.error('❌ Content script not loaded!');
    console.log('Check chrome://extensions for errors.');
    results.errors.push({error: 'Content script not loaded'});
  }
  console.log('');

  // SUMMARY
  console.log('═══════════════════════════════════════════════════════');
  console.log('                     SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  if (results.errors.length === 0) {
    console.log('✅ No critical errors found');
  } else {
    console.error(`❌ ${results.errors.length} error(s) found:`);
    results.errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${JSON.stringify(err)}`);
    });
  }

  console.log('\n📋 Full diagnostic results:');
  console.log(JSON.stringify(results, null, 2));

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('END OF DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════');

  return results;
})();
