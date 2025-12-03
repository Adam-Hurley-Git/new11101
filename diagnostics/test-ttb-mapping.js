// ========================================
// TTB_ TASK MAPPING DIAGNOSTIC SCRIPT
// ========================================
// Run this in the browser console on calendar.google.com
// Purpose: Diagnose why ttb_ task mapping is failing (0% success rate)

(async function diagnosticTest() {
  console.log('🔍 Starting TTB_ Task Mapping Diagnostic...\n');

  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: { passed: 0, failed: 0, warnings: 0 },
  };

  function logTest(name, status, message, data = null) {
    const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${emoji} ${name}: ${message}`);
    if (data) console.log('   Data:', data);

    results.tests.push({ name, status, message, data });
    if (status === 'PASS') results.summary.passed++;
    else if (status === 'FAIL') results.summary.failed++;
    else results.summary.warnings++;
  }

  // ========================================
  // TEST 1: Find TTB_ Tasks in DOM
  // ========================================
  console.log('\n📋 TEST 1: Finding TTB_ Tasks in DOM');
  const ttbElements = document.querySelectorAll('[data-eventid^="ttb_"]');

  if (ttbElements.length === 0) {
    logTest(
      'TTB Elements',
      'FAIL',
      'No ttb_ elements found in DOM. Google may have changed format again.',
      { count: 0 }
    );
  } else {
    logTest('TTB Elements', 'PASS', `Found ${ttbElements.length} ttb_ elements`, {
      count: ttbElements.length,
      sampleIds: Array.from(ttbElements)
        .slice(0, 3)
        .map((el) => el.getAttribute('data-eventid')),
    });
  }

  // ========================================
  // TEST 2: Test Base64 Decoding
  // ========================================
  console.log('\n🔐 TEST 2: Testing Base64 Decoding');
  if (ttbElements.length > 0) {
    const sampleTtb = ttbElements[0].getAttribute('data-eventid');
    try {
      const base64Part = sampleTtb.slice(4); // Remove "ttb_"
      const decoded = atob(base64Part);
      const parts = decoded.split(' ');

      logTest('Base64 Decode', 'PASS', 'Successfully decoded ttb_ string', {
        originalTtb: sampleTtb,
        decoded: decoded,
        calendarEventId: parts[0],
        email: parts[1] || null,
      });
    } catch (error) {
      logTest('Base64 Decode', 'FAIL', `Decoding failed: ${error.message}`, {
        originalTtb: sampleTtb,
        error: error.toString(),
      });
    }
  } else {
    logTest('Base64 Decode', 'FAIL', 'Skipped - no ttb_ elements found');
  }

  // ========================================
  // TEST 3: Check Extension Module Loading
  // ========================================
  console.log('\n📦 TEST 3: Checking Extension Modules');
  try {
    const GoogleCalendarAPI = await import(chrome.runtime.getURL('lib/google-calendar-api.js'));
    logTest('Module Loading', 'PASS', 'google-calendar-api.js loaded successfully', {
      functions: Object.keys(GoogleCalendarAPI),
    });

    // ========================================
    // TEST 4: Check OAuth Token
    // ========================================
    console.log('\n🔑 TEST 4: Checking OAuth Token');
    try {
      const GoogleTasksAPI = await import(chrome.runtime.getURL('lib/google-tasks-api.js'));
      const token = await GoogleTasksAPI.getAuthToken(false);

      if (token) {
        logTest('OAuth Token', 'PASS', 'OAuth token retrieved successfully', {
          tokenLength: token.length,
          tokenPrefix: token.slice(0, 20) + '...',
        });

        // ========================================
        // TEST 5: Test Calendar API Access
        // ========================================
        console.log('\n🌐 TEST 5: Testing Calendar API Access');
        try {
          const response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary',
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.ok) {
            const calendar = await response.json();
            logTest('Calendar API Access', 'PASS', 'Calendar API is accessible', {
              calendarSummary: calendar.summary,
              calendarId: calendar.id,
            });

            // ========================================
            // TEST 6: Fetch Real Calendar Event
            // ========================================
            console.log('\n📅 TEST 6: Fetching Real Calendar Event');
            if (ttbElements.length > 0) {
              const sampleTtb = ttbElements[0].getAttribute('data-eventid');
              const base64Part = sampleTtb.slice(4);
              const decoded = atob(base64Part);
              const calendarEventId = decoded.split(' ')[0];

              try {
                const eventResponse = await fetch(
                  `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`,
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );

                if (eventResponse.ok) {
                  const event = await eventResponse.json();
                  logTest('Fetch Calendar Event', 'PASS', 'Successfully fetched calendar event', {
                    eventId: event.id,
                    summary: event.summary,
                    hasDescription: !!event.description,
                    descriptionLength: event.description?.length || 0,
                    descriptionSample:
                      event.description?.slice(0, 200) || 'No description',
                  });

                  // ========================================
                  // TEST 7: Extract Task Fragment
                  // ========================================
                  console.log('\n🔍 TEST 7: Extracting Task Fragment from Description');
                  if (event.description) {
                    const match = event.description.match(
                      /tasks\.google\.com\/task\/([A-Za-z0-9_-]+)/
                    );

                    if (match && match[1]) {
                      const fragment = match[1];
                      logTest(
                        'Extract Task Fragment',
                        'PASS',
                        'Found task fragment in description',
                        {
                          fragment: fragment,
                          fullMatch: match[0],
                        }
                      );

                      // ========================================
                      // TEST 8: Convert Fragment to Task API ID
                      // ========================================
                      console.log('\n🔄 TEST 8: Converting Fragment to Task API ID');
                      try {
                        const taskApiId = btoa(fragment);
                        logTest(
                          'Fragment to API ID',
                          'PASS',
                          'Successfully converted fragment to Task API ID',
                          {
                            fragment: fragment,
                            taskApiId: taskApiId,
                          }
                        );

                        // ========================================
                        // TEST 9: Verify Task Exists in Tasks API
                        // ========================================
                        console.log('\n✅ TEST 9: Verifying Task in Tasks API');
                        try {
                          // Get all task lists
                          const listsResponse = await fetch(
                            'https://www.googleapis.com/tasks/v1/users/@me/lists',
                            {
                              headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/json',
                              },
                            }
                          );

                          if (listsResponse.ok) {
                            const lists = await listsResponse.json();
                            let taskFound = false;

                            // Search for task in all lists
                            for (const list of lists.items || []) {
                              const tasksResponse = await fetch(
                                `https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=true&showHidden=true`,
                                {
                                  headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                  },
                                }
                              );

                              if (tasksResponse.ok) {
                                const tasks = await tasksResponse.json();
                                const task = (tasks.items || []).find(
                                  (t) => t.id === taskApiId
                                );

                                if (task) {
                                  taskFound = true;
                                  logTest(
                                    'Verify Task in API',
                                    'PASS',
                                    'Task found in Tasks API!',
                                    {
                                      listId: list.id,
                                      listTitle: list.title,
                                      taskId: task.id,
                                      taskTitle: task.title,
                                      taskStatus: task.status,
                                    }
                                  );
                                  break;
                                }
                              }
                            }

                            if (!taskFound) {
                              logTest(
                                'Verify Task in API',
                                'FAIL',
                                'Task ID not found in any task list',
                                {
                                  searchedLists: lists.items.length,
                                  taskApiId: taskApiId,
                                }
                              );
                            }
                          }
                        } catch (error) {
                          logTest(
                            'Verify Task in API',
                            'FAIL',
                            `Error searching Tasks API: ${error.message}`
                          );
                        }
                      } catch (error) {
                        logTest(
                          'Fragment to API ID',
                          'FAIL',
                          `Base64 encoding failed: ${error.message}`
                        );
                      }
                    } else {
                      logTest(
                        'Extract Task Fragment',
                        'FAIL',
                        'No task fragment found in event description',
                        {
                          description: event.description,
                          searchPattern: 'tasks.google.com/task/{FRAGMENT}',
                        }
                      );
                    }
                  } else {
                    logTest(
                      'Extract Task Fragment',
                      'FAIL',
                      'Event has no description field',
                      {
                        eventId: event.id,
                        availableFields: Object.keys(event),
                      }
                    );
                  }
                } else {
                  logTest(
                    'Fetch Calendar Event',
                    'FAIL',
                    `API returned ${eventResponse.status}: ${eventResponse.statusText}`,
                    {
                      calendarEventId: calendarEventId,
                      status: eventResponse.status,
                    }
                  );
                }
              } catch (error) {
                logTest(
                  'Fetch Calendar Event',
                  'FAIL',
                  `API call failed: ${error.message}`,
                  { error: error.toString() }
                );
              }
            }
          } else {
            logTest(
              'Calendar API Access',
              'FAIL',
              `API returned ${response.status}: ${response.statusText}`,
              {
                status: response.status,
                statusText: response.statusText,
              }
            );
          }
        } catch (error) {
          logTest('Calendar API Access', 'FAIL', `API call failed: ${error.message}`, {
            error: error.toString(),
          });
        }
      } else {
        logTest('OAuth Token', 'FAIL', 'No OAuth token available', {
          hint: 'User may need to grant OAuth permissions',
        });
      }
    } catch (error) {
      logTest('OAuth Token', 'FAIL', `Token retrieval failed: ${error.message}`, {
        error: error.toString(),
      });
    }
  } catch (error) {
    logTest('Module Loading', 'FAIL', `Failed to load modules: ${error.message}`, {
      error: error.toString(),
    });
  }

  // ========================================
  // TEST 10: Check Storage Cache
  // ========================================
  console.log('\n💾 TEST 10: Checking Storage Caches');
  try {
    const [calendarMapping, taskToListMap, taskListsMeta] = await Promise.all([
      chrome.storage.local.get('cf.calendarEventMapping'),
      chrome.storage.local.get('cf.taskToListMap'),
      chrome.storage.local.get('cf.taskListsMeta'),
    ]);

    const calendarMappingSize = Object.keys(
      calendarMapping['cf.calendarEventMapping'] || {}
    ).length;
    const taskMapSize = Object.keys(taskToListMap['cf.taskToListMap'] || {}).length;
    const taskListsCount = (taskListsMeta['cf.taskListsMeta'] || []).length;

    logTest('Storage Caches', calendarMappingSize > 0 ? 'PASS' : 'WARN', 'Cache status', {
      calendarMappingEntries: calendarMappingSize,
      taskToListMapEntries: taskMapSize,
      taskListsCount: taskListsCount,
      recommendation:
        calendarMappingSize === 0
          ? 'Calendar mapping cache is empty - this is why coloring fails!'
          : 'Cache populated',
    });
  } catch (error) {
    logTest('Storage Caches', 'FAIL', `Failed to read storage: ${error.message}`);
  }

  // ========================================
  // FINAL SUMMARY
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.summary.passed}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`⚠️  Warnings: ${results.summary.warnings}`);
  console.log('='.repeat(60));

  // Determine root cause
  console.log('\n🎯 ROOT CAUSE ANALYSIS:');
  const failedTests = results.tests.filter((t) => t.status === 'FAIL');

  if (failedTests.some((t) => t.name === 'TTB Elements')) {
    console.log(
      '❌ CRITICAL: No ttb_ elements found in DOM. Google Calendar UI may have changed again.'
    );
    console.log(
      '   Action: Run quick-task-inspector.js to discover new selector format.'
    );
  } else if (failedTests.some((t) => t.name === 'OAuth Token')) {
    console.log('❌ CRITICAL: OAuth token not available.');
    console.log('   Action: User needs to grant OAuth permissions in popup UI.');
  } else if (failedTests.some((t) => t.name === 'Calendar API Access')) {
    console.log('❌ CRITICAL: Calendar API not accessible.');
    console.log(
      '   Action: User needs to grant "calendar.readonly" permission.'
    );
    console.log('   Note: Check manifest.json includes calendar.readonly scope.');
  } else if (failedTests.some((t) => t.name === 'Fetch Calendar Event')) {
    console.log('❌ CRITICAL: Cannot fetch calendar events.');
    console.log('   Possible causes:');
    console.log('   1. Calendar event ID format has changed');
    console.log('   2. Calendar API endpoint has changed');
    console.log('   3. Event was deleted/moved');
  } else if (failedTests.some((t) => t.name === 'Extract Task Fragment')) {
    console.log('❌ CRITICAL: Task fragment not found in event description.');
    console.log('   This is the most likely root cause!');
    console.log('   Possible causes:');
    console.log(
      '   1. Google changed how tasks are linked to calendar events'
    );
    console.log('   2. Task fragment is in a different field (not description)');
    console.log('   3. Task fragment format has changed');
    console.log('\n   Action: Inspect event object for alternative task identifiers.');
  } else if (failedTests.some((t) => t.name === 'Verify Task in API')) {
    console.log('⚠️  WARNING: Task fragment extracted but not found in Tasks API.');
    console.log('   Possible causes:');
    console.log('   1. Fragment-to-TaskID conversion is incorrect');
    console.log('   2. Task was deleted');
    console.log('   3. Task is in a different task list');
  } else if (results.summary.failed === 0 && results.summary.warnings > 0) {
    console.log('✅ All tests passed! But cache is empty.');
    console.log(
      '   Action: Extension needs to populate cf.calendarEventMapping on first load.'
    );
    console.log('   Recommendation: Add initialization logic to background.js');
  } else if (results.summary.failed === 0) {
    console.log('🎉 All tests passed! Mapping chain is working correctly.');
    console.log(
      '   If colors still not showing, check doRepaint() logic in features/tasks-coloring/index.js'
    );
  }

  console.log('\n📁 Full results saved to: window.__ttbDiagnosticResults');
  window.__ttbDiagnosticResults = results;

  // Export results as JSON
  console.log('\n💾 To export results, run: exportDiagnosticResults()');
  window.exportDiagnosticResults = function () {
    const dataStr = JSON.stringify(results, null, 2);
    const dataUri =
      'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `ttb-diagnostic-${Date.now()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    console.log('✅ Results exported to:', exportFileDefaultName);
  };

  return results;
})();
