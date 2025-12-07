/**
 * Quick script to check actual recurring task ID formats
 * Run this in Google Calendar console with your recurring task visible
 */

console.log('=== RECURRING TASK ID CHECKER ===\n');

// Find all task elements
const allTasks = document.querySelectorAll('[data-eventid^="tasks"]');

console.log(`Found ${allTasks.length} task elements\n`);

// Group by title to find recurring instances
const tasksByTitle = new Map();

allTasks.forEach(task => {
  const eventId = task.getAttribute('data-eventid');
  const textElement = task.querySelector('.XuJrye');
  const text = textElement?.textContent || '';

  // Extract title (simplified)
  const titleMatch = text.match(/task:\s*([^,]+)/);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

  if (!tasksByTitle.has(title)) {
    tasksByTitle.set(title, []);
  }

  tasksByTitle.get(title).push({
    eventId,
    text: text.substring(0, 100) // First 100 chars
  });
});

// Show recurring tasks (titles with multiple instances)
console.log('=== RECURRING TASKS (multiple instances) ===\n');

for (const [title, instances] of tasksByTitle.entries()) {
  if (instances.length > 1) {
    console.log(`📅 "${title}" (${instances.length} instances):`);
    instances.forEach((instance, i) => {
      console.log(`  ${i + 1}. ${instance.eventId}`);
    });

    // Check if IDs follow pattern
    const firstId = instances[0].eventId.replace('tasks.', '').replace('tasks_', '');
    const hasInstancePrefix = /^\d+_/.test(firstId);

    if (hasInstancePrefix) {
      console.log(`  ✅ HAS instance prefix pattern (9_baseId)`);

      // Extract base IDs
      const baseIds = instances.map(inst => {
        const id = inst.eventId.replace('tasks.', '').replace('tasks_', '');
        const match = id.match(/^\d+_(.+)$/);
        return match ? match[1] : id;
      });

      const allSameBase = baseIds.every(id => id === baseIds[0]);
      if (allSameBase) {
        console.log(`  ✅ All instances share SAME base ID: ${baseIds[0]}`);
      } else {
        console.log(`  ❌ Base IDs are DIFFERENT:`, baseIds);
      }
    } else {
      console.log(`  ❌ NO instance prefix - IDs are completely unique`);

      // Show all unique IDs
      const ids = instances.map(inst =>
        inst.eventId.replace('tasks.', '').replace('tasks_', '')
      );
      console.log(`  Unique IDs:`, ids);
    }
    console.log('');
  }
}

console.log('\n=== SINGLE TASKS (non-recurring) ===\n');
let singleCount = 0;
for (const [title, instances] of tasksByTitle.entries()) {
  if (instances.length === 1) {
    singleCount++;
  }
}
console.log(`Found ${singleCount} non-recurring tasks\n`);

console.log('\n=== SUMMARY ===');
console.log(`Total task elements: ${allTasks.length}`);
console.log(`Unique titles: ${tasksByTitle.size}`);
console.log(`Recurring tasks: ${Array.from(tasksByTitle.values()).filter(v => v.length > 1).length}`);
console.log(`Non-recurring tasks: ${singleCount}`);
