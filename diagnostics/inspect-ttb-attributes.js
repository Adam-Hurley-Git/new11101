// RUN IN CONSOLE: Inspect what attributes ttb_ tasks actually have
// This will show us if there are multiple task ID attributes

console.clear();
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║         TTB_ TASK ATTRIBUTES INSPECTOR                    ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

const ttbTasks = document.querySelectorAll('[data-eventid^="ttb_"]');
console.log('Found', ttbTasks.length, 'ttb_ tasks');
console.log('');

if (ttbTasks.length > 0) {
  const firstTask = ttbTasks[0];

  console.log('📋 FIRST TASK ANALYSIS:');
  console.log('   ─────────────────────────────────────────────');

  // Show ALL attributes
  console.log('   All attributes:');
  for (const attr of firstTask.attributes) {
    const value = attr.value;
    const displayValue = value.length > 60 ? value.substring(0, 60) + '...' : value;
    console.log('      ', attr.name, '=', displayValue);
  }

  console.log('');
  console.log('   ─────────────────────────────────────────────');

  // Check specific attributes that might contain task IDs
  const checks = [
    'data-eventid',
    'data-taskid',
    'data-task-id',
    'data-id',
    'id',
    'jslog',
    'data-key',
  ];

  console.log('   Specific attribute checks:');
  checks.forEach(attr => {
    const value = firstTask.getAttribute(attr);
    if (value) {
      const displayValue = value.length > 60 ? value.substring(0, 60) + '...' : value;
      console.log('      ', attr, '→', displayValue);
    }
  });

  console.log('');
  console.log('   ─────────────────────────────────────────────');

  // Check child elements
  console.log('   Child elements:');
  const children = firstTask.querySelectorAll('*');
  console.log('      Total children:', children.length);

  // Look for elements with task IDs
  let foundIds = [];
  children.forEach(child => {
    for (const attr of child.attributes) {
      if (attr.name.includes('task') || attr.name.includes('event') || attr.name.includes('id')) {
        const value = attr.value;
        if (value && value.length > 10 && !value.startsWith('ttb_')) {
          foundIds.push({
            element: child.tagName,
            attribute: attr.name,
            value: value.length > 40 ? value.substring(0, 40) + '...' : value
          });
        }
      }
    }
  });

  if (foundIds.length > 0) {
    console.log('      Found potential task IDs in children:');
    foundIds.forEach(item => {
      console.log('         ', item.element, '-', item.attribute, '=', item.value);
    });
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                   TESTING WITH EXTENSION                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  // Now test what getTaskIdFromChip would return
  console.log('Testing what extension would extract:');

  // Test 1: data-eventid
  const eventId = firstTask.getAttribute('data-eventid');
  console.log('1. data-eventid:', eventId);

  if (eventId && eventId.startsWith('ttb_')) {
    console.log('   ✅ Would trigger ttb_ resolution path');

    // Decode it
    try {
      const decoded = atob(eventId.slice(4));
      const calendarEventId = decoded.split(' ')[0];
      console.log('   Calendar Event ID:', calendarEventId);
    } catch (e) {
      console.log('   ❌ Decode failed:', e.message);
    }
  } else if (eventId && (eventId.startsWith('tasks.') || eventId.startsWith('tasks_'))) {
    const taskId = eventId.slice(6);
    console.log('   ⚠️ Would use OLD UI path, Task ID:', taskId);
  }

  // Test 2: data-taskid
  const taskId = firstTask.getAttribute('data-taskid');
  if (taskId) {
    console.log('2. data-taskid:', taskId);
    console.log('   ⚠️ This might be used as fallback');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SHARE THIS OUTPUT');
  console.log('═══════════════════════════════════════════════════════════');
}
