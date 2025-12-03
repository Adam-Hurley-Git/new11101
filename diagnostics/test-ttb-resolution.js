// RUN THIS IN CONSOLE ON CALENDAR.GOOGLE.COM
// Tests if ttb_ → Task ID resolution is working

console.clear();
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║           TTB_ TASK RESOLUTION DIAGNOSTIC                 ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

// Find ttb_ tasks
const ttbTasks = document.querySelectorAll('[data-eventid^="ttb_"]');
console.log('1️⃣  FOUND TTB_ TASKS:', ttbTasks.length);
console.log('');

if (ttbTasks.length === 0) {
  console.log('❌ NO TTB_ TASKS FOUND');
  console.log('   Either:');
  console.log('   - You are on OLD UI (not NEW UI)');
  console.log('   - OR no tasks visible on calendar');
  console.log('');
  console.log('   Checking for OLD UI tasks instead...');
  const oldTasks = document.querySelectorAll('[data-eventid^="tasks."]');
  console.log('   OLD UI tasks found:', oldTasks.length);
} else {
  // Test first ttb_ task
  const firstTask = ttbTasks[0];
  const ttbEventId = firstTask.getAttribute('data-eventid');
  
  console.log('2️⃣  TESTING FIRST TTB_ TASK');
  console.log('   ─────────────────────────────────────────────');
  console.log('   Full ttb_ string:', ttbEventId);
  console.log('');
  
  // Decode ttb_
  try {
    const base64Part = ttbEventId.slice(4); // Remove "ttb_"
    const decoded = atob(base64Part);
    const parts = decoded.split(' ');
    const calendarEventId = parts[0];
    const email = parts[1] || null;
    
    console.log('   ✅ DECODED SUCCESSFULLY');
    console.log('   Calendar Event ID:', calendarEventId);
    console.log('   Email:', email);
    console.log('');
    
    // Test if Calendar API is accessible
    console.log('3️⃣  TESTING CALENDAR API ACCESS');
    console.log('   ─────────────────────────────────────────────');
    console.log('   Sending message to background script...');
    
    chrome.runtime.sendMessage({
      type: 'RESOLVE_CALENDAR_EVENT',
      calendarEventId: calendarEventId
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('   ❌ MESSAGE ERROR:', chrome.runtime.lastError.message);
        console.log('   → Background script not responding');
      } else if (!response) {
        console.log('   ❌ NO RESPONSE from background script');
        console.log('   → Check background console for errors');
      } else if (response.success) {
        console.log('   ✅ CALENDAR API WORKING!');
        console.log('   Task API ID:', response.taskApiId);
        console.log('   Task Fragment:', response.taskFragment);
        console.log('');
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║                    ✅ SUCCESS!                            ║');
        console.log('║   Calendar Event → Task ID mapping is working            ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('🔍 If tasks still not colored, check:');
        console.log('   1. Are colors set in extension popup?');
        console.log('   2. Is task list coloring enabled?');
        console.log('   3. Check content script console for paint logs');
      } else {
        console.log('   ❌ CALENDAR API FAILED');
        console.log('   Error:', response.error);
        console.log('');
        console.log('🔍 Possible causes:');
        console.log('   1. Calendar API permission not granted');
        console.log('   2. OAuth token invalid/expired');
        console.log('   3. Calendar event not found (404)');
        console.log('   4. Task link not in event description');
        console.log('');
        console.log('📋 NEXT STEPS:');
        console.log('   → Check background console (chrome://extensions → service worker)');
        console.log('   → Look for [CalendarAPI] logs');
        console.log('   → Share any error messages');
      }
    });
    
  } catch (error) {
    console.log('   ❌ DECODE FAILED');
    console.log('   Error:', error.message);
    console.log('   → ttb_ string might be malformed');
  }
}

// Check if content script thinks it has ttb_ tasks
console.log('');
console.log('4️⃣  CHECKING CONTENT SCRIPT STATE');
console.log('   ─────────────────────────────────────────────');

if (window.cfTasksColoring) {
  console.log('   ✅ Task coloring module loaded');
  
  // Check cache
  chrome.storage.local.get('cf.calendarEventMapping', (result) => {
    const mapping = result['cf.calendarEventMapping'] || {};
    console.log('   Calendar Event mappings cached:', Object.keys(mapping).length);
    
    if (Object.keys(mapping).length > 0) {
      console.log('   📋 Cached mappings:');
      for (const [eventId, data] of Object.entries(mapping)) {
        console.log('      ', eventId, '→', data.taskApiId);
      }
    }
  });
} else {
  console.log('   ⚠️  Task coloring module not loaded');
  console.log('   → Extension might not be initialized');
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('DIAGNOSTIC COMPLETE - Share output above');
console.log('═══════════════════════════════════════════════════════════');
