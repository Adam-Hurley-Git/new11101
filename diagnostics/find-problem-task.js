// IMMEDIATE DIAGNOSTIC: Find where IGQnN05IjRN0C6tN is coming from
// Run this in console on calendar.google.com

(async function findProblemTask() {
  console.log('🔍 Finding task with ID IGQnN05IjRN0C6tN...\n');

  // Search all task elements
  const allTasks = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"]');

  console.log(`Found ${allTasks.length} total tasks\n`);

  for (let i = 0; i < allTasks.length; i++) {
    const task = allTasks[i];
    const eventId = task.getAttribute('data-eventid');

    // Test each task
    let extractedId = null;

    if (eventId.startsWith('ttb_')) {
      // Decode ttb_
      try {
        const base64Part = eventId.slice(4);
        const decoded = atob(base64Part);
        const calendarEventId = decoded.split(' ')[0];

        // Check if this matches
        if (calendarEventId === 'IGQnN05IjRN0C6tN' || decoded.includes('IGQnN05IjRN0C6tN')) {
          console.log(`✅ FOUND IT! Task ${i + 1}:`);
          console.log('  data-eventid:', eventId);
          console.log('  Decoded:', decoded);
          console.log('  Calendar Event ID:', calendarEventId);
          console.log('  Task element:', task);
          console.log('  Text:', task.textContent?.substring(0, 100));

          // Check if it's in the mapping
          const mapping = await new Promise(r => chrome.storage.local.get('cf.taskToListMap', r));
          const taskToListMap = mapping['cf.taskToListMap'] || {};

          console.log('\n  Checking if in mapping:');
          console.log('  - IGQnN05IjRN0C6tN in mapping:', !!taskToListMap['IGQnN05IjRN0C6tN']);
          console.log('  - calendarEventId in mapping:', !!taskToListMap[calendarEventId]);

          // Base64 encode it to see what Task API ID would be
          const taskApiId = btoa(calendarEventId);
          console.log('  - Base64 encoded:', taskApiId);
          console.log('  - Encoded version in mapping:', !!taskToListMap[taskApiId]);

          break;
        }
      } catch (e) {
        // Ignore decode errors
      }
    } else if (eventId.startsWith('tasks.') || eventId.startsWith('tasks_')) {
      extractedId = eventId.slice(6);
      if (extractedId === 'IGQnN05IjRN0C6tN') {
        console.log(`✅ FOUND IT! Task ${i + 1}:`);
        console.log('  Format: OLD UI (tasks. prefix)');
        console.log('  data-eventid:', eventId);
        console.log('  Extracted ID:', extractedId);
        console.log('  Task element:', task);
        break;
      }
    }
  }

  console.log('\n📋 Now checking what cf.taskToListMap contains:');
  const mapping = await new Promise(r => chrome.storage.local.get('cf.taskToListMap', r));
  const taskToListMap = mapping['cf.taskToListMap'] || {};

  console.log('Mapping size:', Object.keys(taskToListMap).length);
  console.log('Sample IDs (first 5):');
  Object.keys(taskToListMap).slice(0, 5).forEach(id => {
    console.log(`  - ${id} → ${taskToListMap[id]}`);
  });

  // Check if any key contains the problem string
  const matchingKeys = Object.keys(taskToListMap).filter(k => k.includes('IGQnN') || k.includes('IjRN0C6tN'));
  if (matchingKeys.length > 0) {
    console.log('\n✅ Found matching keys in mapping:');
    matchingKeys.forEach(k => console.log(`  - ${k}`));
  } else {
    console.log('\n❌ No matching keys found in mapping');
  }
})();
