// ========================================
// GOOGLE CALENDAR API - TASK EVENT INSPECTOR
// ========================================
// Run this in browser console on calendar.google.com
// Purpose: Inspect what fields Calendar API returns for task events

(async function inspectTaskEvent() {
  console.log('🔍 Inspecting Calendar API Task Event Fields...\n');

  try {
    // Step 1: Get OAuth token
    console.log('📝 Step 1: Getting OAuth token...');
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });

    if (!token) {
      console.error('❌ No OAuth token available');
      console.log('   Action: Grant OAuth permissions in extension popup');
      return;
    }

    console.log('✅ OAuth token obtained');

    // Step 2: Get a ttb_ element from the DOM
    console.log('\n📝 Step 2: Finding ttb_ task in DOM...');
    const ttbElement = document.querySelector('[data-eventid^="ttb_"]');

    if (!ttbElement) {
      console.error('❌ No ttb_ tasks found in DOM');
      console.log('   Action: Make sure tasks are visible in calendar view');
      return;
    }

    const ttbString = ttbElement.getAttribute('data-eventid');
    console.log('✅ Found ttb_ task:', ttbString);

    // Step 3: Decode ttb_ to get calendar event ID
    console.log('\n📝 Step 3: Decoding ttb_ string...');
    const base64Part = ttbString.slice(4); // Remove "ttb_" prefix
    const decoded = atob(base64Part);
    const parts = decoded.split(' ');
    const calendarEventId = parts[0];
    const userEmail = parts[1];

    console.log('✅ Decoded successfully:');
    console.log('   Calendar Event ID:', calendarEventId);
    console.log('   User Email:', userEmail);

    // Step 4: Fetch event from Calendar API
    console.log('\n📝 Step 4: Fetching event from Calendar API...');
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('❌ Calendar API request failed:');
      console.log('   Status:', response.status, response.statusText);

      if (response.status === 403) {
        console.log('   Reason: Permission denied');
        console.log('   Action: Grant "calendar.readonly" permission in extension');
      } else if (response.status === 404) {
        console.log('   Reason: Event not found');
        console.log('   Note: Event may have been deleted or moved');
      } else if (response.status === 401) {
        console.log('   Reason: Token expired or invalid');
        console.log('   Action: Try re-authorizing the extension');
      }

      return;
    }

    const event = await response.json();
    console.log('✅ Event fetched successfully!');

    // Step 5: Analyze event fields
    console.log('\n' + '='.repeat(80));
    console.log('📊 CALENDAR EVENT ANALYSIS');
    console.log('='.repeat(80));

    console.log('\n🔍 BASIC FIELDS:');
    console.log('  id:', event.id);
    console.log('  kind:', event.kind);
    console.log('  status:', event.status);
    console.log('  summary:', event.summary);
    console.log('  eventType:', event.eventType || '(not set)');

    console.log('\n📝 DESCRIPTION:');
    if (event.description) {
      console.log('  Length:', event.description.length);
      console.log('  Contains "tasks.google.com":', event.description.includes('tasks.google.com'));

      // Try to extract task link
      const taskLinkMatch = event.description.match(/tasks\.google\.com\/[^\s<>"]+/);
      if (taskLinkMatch) {
        console.log('  ✅ Task link found:', taskLinkMatch[0]);

        // Try to extract fragment
        const fragmentMatch = taskLinkMatch[0].match(/task\/([A-Za-z0-9_-]+)/);
        if (fragmentMatch) {
          console.log('  ✅ Task fragment:', fragmentMatch[1]);

          // Convert to Task API ID
          const taskApiId = btoa(fragmentMatch[1]);
          console.log('  ✅ Task API ID (base64):', taskApiId);
        }
      } else {
        console.log('  ❌ No tasks.google.com link found');
      }

      console.log('  Sample (first 200 chars):', event.description.slice(0, 200));
    } else {
      console.log('  ❌ No description field');
    }

    console.log('\n🔗 LINKS & REFERENCES:');
    console.log('  htmlLink:', event.htmlLink || '(not set)');
    console.log('  iCalUID:', event.iCalUID || '(not set)');

    console.log('\n📎 SOURCE FIELD:');
    if (event.source) {
      console.log('  ✅ Source exists:');
      console.log('    title:', event.source.title);
      console.log('    url:', event.source.url);

      if (event.source.url && event.source.url.includes('tasks.google.com')) {
        console.log('  ✅✅ Source URL contains tasks.google.com!');
        console.log('  This could be used for task mapping!');
      }
    } else {
      console.log('  ❌ No source field');
    }

    console.log('\n🔧 EXTENDED PROPERTIES:');
    if (event.extendedProperties) {
      console.log('  ✅ Extended properties exist:');

      if (event.extendedProperties.private) {
        console.log('  Private properties:', Object.keys(event.extendedProperties.private));
        console.log('  Values:', event.extendedProperties.private);
      }

      if (event.extendedProperties.shared) {
        console.log('  Shared properties:', Object.keys(event.extendedProperties.shared));
        console.log('  Values:', event.extendedProperties.shared);
      }
    } else {
      console.log('  ❌ No extended properties');
    }

    console.log('\n📋 OTHER POTENTIALLY USEFUL FIELDS:');
    console.log('  creator:', event.creator?.email || '(not set)');
    console.log('  organizer:', event.organizer?.email || '(not set)');
    console.log('  created:', event.created || '(not set)');
    console.log('  updated:', event.updated || '(not set)');
    console.log('  recurringEventId:', event.recurringEventId || '(not set)');

    console.log('\n📦 ALL AVAILABLE FIELDS:');
    console.log(Object.keys(event).sort());

    console.log('\n' + '='.repeat(80));
    console.log('💾 FULL EVENT OBJECT:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(event, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('🎯 RECOMMENDATIONS');
    console.log('='.repeat(80));

    // Analyze and provide recommendations
    let taskIdMethod = null;

    if (event.description && event.description.includes('tasks.google.com')) {
      const fragmentMatch = event.description.match(/task\/([A-Za-z0-9_-]+)/);
      if (fragmentMatch) {
        taskIdMethod = 'DESCRIPTION';
        console.log('✅ BEST APPROACH: Use description field');
        console.log('   - Extract task link from event.description');
        console.log('   - Regex: /tasks\\.google\\.com\\/.*\\/task\\/([A-Za-z0-9_-]+)/');
        console.log('   - Convert fragment to base64 for Task API ID');
      }
    }

    if (event.source && event.source.url && event.source.url.includes('tasks.google.com')) {
      taskIdMethod = 'SOURCE';
      console.log('✅ ALTERNATIVE APPROACH: Use source.url field');
      console.log('   - Extract task link from event.source.url');
      console.log('   - Same regex pattern as description');
    }

    if (event.extendedProperties) {
      console.log('⚠️  CHECK: Extended properties may contain task ID');
      console.log('   - Inspect private/shared properties above');
      console.log('   - Look for taskId, taskFragment, or similar keys');
    }

    if (!taskIdMethod) {
      console.log('❌ NO OBVIOUS TASK LINK FOUND');
      console.log('   Possible causes:');
      console.log('   1. Google changed how tasks are linked to events');
      console.log('   2. This event is not actually a task event');
      console.log('   3. Task link is in a non-standard field');
      console.log('');
      console.log('   Next steps:');
      console.log('   1. Check "ALL AVAILABLE FIELDS" list above');
      console.log('   2. Inspect "FULL EVENT OBJECT" for hidden fields');
      console.log('   3. Try testing with a different task');
    }

    console.log('\n' + '='.repeat(80));
    console.log('📁 Results saved to: window.__calendarApiTestResults');
    console.log('='.repeat(80));

    window.__calendarApiTestResults = {
      ttbString,
      calendarEventId,
      event,
      taskIdMethod,
      timestamp: new Date().toISOString(),
    };

    return window.__calendarApiTestResults;

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.log('   Stack:', error.stack);
    return { error: error.message };
  }
})();
