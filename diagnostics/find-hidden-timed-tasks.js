// ============================================================================
// FIND: Where are the timed tasks hiding?
// ============================================================================
// The timed tasks (with start/end time) are NOT in our data-eventid query!
// This means Google is using a different structure/selector for them.
// Let's find them by other means.
// ============================================================================

function findHiddenTimedTasks() {
  console.clear();
  console.log('🔍 FINDING HIDDEN TIMED TASKS\n' + '='.repeat(70));

  // Strategy 1: Find all .GTG3wb buttons (this is the visible button class)
  const allGTG3wbButtons = document.querySelectorAll('.GTG3wb');
  console.log(`\n1️⃣ Found ${allGTG3wbButtons.length} total .GTG3wb buttons`);

  // Strategy 2: Find which ones have data-eventid
  const buttonsWithEventId = Array.from(allGTG3wbButtons).filter(btn => {
    const eventId = btn.getAttribute('data-eventid') || btn.closest('[data-eventid]')?.getAttribute('data-eventid');
    return eventId && eventId.startsWith('tasks');
  });

  console.log(`   • With data-eventid: ${buttonsWithEventId.length}`);
  console.log(`   • WITHOUT data-eventid: ${allGTG3wbButtons.length - buttonsWithEventId.length} ⚠️`);

  // These are the "invisible" tasks!
  const invisibleTasks = Array.from(allGTG3wbButtons).filter(btn => {
    const eventId = btn.getAttribute('data-eventid') || btn.closest('[data-eventid]')?.getAttribute('data-eventid');
    return !eventId || !eventId.startsWith('tasks');
  });

  console.log(`\n❌ INVISIBLE TASKS: ${invisibleTasks.length} tasks have no data-eventid!`);

  if (invisibleTasks.length === 0) {
    console.log('\n✅ All tasks have data-eventid - no invisible tasks');
    console.log('   → Problem must be elsewhere');
    return;
  }

  // ========================================================================
  // ANALYZE INVISIBLE TASKS
  // ========================================================================
  console.log('\n2️⃣ Analyzing invisible tasks...\n');

  invisibleTasks.slice(0, 5).forEach((task, i) => {
    const rect = task.getBoundingClientRect();
    const text = task.textContent?.trim().substring(0, 60);
    const isVisible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;

    console.log(`[${i + 1}] ${isVisible ? '✅ Visible' : '❌ Hidden'} task:`);
    console.log(`    Size: ${Math.round(rect.width)}x${Math.round(rect.height)}px`);
    console.log(`    Text: "${text}"`);
    console.log(`    Classes: ${task.className}`);

    // Look for ANY identifiers
    const hasDataEventId = task.hasAttribute('data-eventid');
    const parentEventId = task.closest('[data-eventid]')?.getAttribute('data-eventid');
    const hasDataTaskId = task.hasAttribute('data-taskid');
    const parentTaskId = task.closest('[data-taskid]')?.getAttribute('data-taskid');

    console.log(`    data-eventid: ${hasDataEventId ? task.getAttribute('data-eventid') : '❌ none'}`);
    console.log(`    parent data-eventid: ${parentEventId || '❌ none'}`);
    console.log(`    data-taskid: ${hasDataTaskId ? task.getAttribute('data-taskid') : '❌ none'}`);
    console.log(`    parent data-taskid: ${parentTaskId || '❌ none'}`);

    // Check all attributes
    const interestingAttrs = Array.from(task.attributes).filter(attr =>
      attr.name.includes('data') || attr.name.includes('id')
    );

    if (interestingAttrs.length > 0) {
      console.log(`    Other data attributes:`);
      interestingAttrs.slice(0, 5).forEach(attr => {
        console.log(`      • ${attr.name}="${attr.value.substring(0, 40)}"`);
      });
    }

    console.log('');
  });

  // ========================================================================
  // TEST: Can we identify these tasks?
  // ========================================================================
  console.log('\n3️⃣ Testing identification methods...\n');

  if (invisibleTasks.length > 0) {
    const testTask = invisibleTasks[0];

    console.log('Testing on first invisible task:');
    console.log(testTask);
    console.log('');

    // Method 1: By content matching
    console.log('Method 1: Content matching');
    const taskText = testTask.textContent?.trim();
    console.log(`  Text content: "${taskText?.substring(0, 60)}"`);

    // Look for time patterns
    const hasTime = /\d{1,2}:\d{2}|am|pm/i.test(taskText);
    console.log(`  Has time pattern: ${hasTime ? '✅' : '❌'}`);

    // Method 2: By position/DOM structure
    console.log('\nMethod 2: DOM structure');
    const parent = testTask.parentElement;
    console.log(`  Parent: <${parent?.tagName.toLowerCase()}>`);
    console.log(`  Parent classes: ${parent?.className}`);
    console.log(`  Siblings: ${parent?.children.length || 0}`);

    // Method 3: Check if it's in a time slot
    console.log('\nMethod 3: Position on grid');
    console.log(`  Top: ${Math.round(testTask.getBoundingClientRect().top)}px`);
    console.log(`  Left: ${Math.round(testTask.getBoundingClientRect().left)}px`);
    console.log(`  Width: ${Math.round(testTask.getBoundingClientRect().width)}px`);
    console.log(`  Height: ${Math.round(testTask.getBoundingClientRect().height)}px`);

    // Method 4: Look for any unique identifiers
    console.log('\nMethod 4: Looking for ANY unique identifier...');

    // Walk up the DOM tree
    let current = testTask;
    let depth = 0;
    let foundId = null;

    while (current && depth < 10) {
      // Check for any attribute that looks like an ID
      const attrs = Array.from(current.attributes || []);
      const idAttrs = attrs.filter(attr =>
        attr.name.includes('id') ||
        attr.value.length > 10 && attr.value.length < 50
      );

      if (idAttrs.length > 0) {
        console.log(`  At depth ${depth} (<${current.tagName.toLowerCase()}>):`);
        idAttrs.forEach(attr => {
          console.log(`    ${attr.name}="${attr.value.substring(0, 50)}"`);
        });
      }

      current = current.parentElement;
      depth++;
    }
  }

  // ========================================================================
  // SOLUTION ATTEMPT: Color the invisible task
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('🎨 TESTING: Can we color an invisible task?');
  console.log('='.repeat(70));

  if (invisibleTasks.length > 0) {
    const testTask = invisibleTasks[0];
    console.log('\nApplying MAGENTA color to first invisible task...');

    testTask.style.backgroundColor = '#FF00FF'; // Magenta
    testTask.style.color = '#FFFFFF';

    console.log('✅ Color applied!');
    console.log('👀 Look at your calendar - do you see a MAGENTA task?');
    console.log('   If YES: We can color it, just need to find it by different selector');
    console.log('   If NO: The element exists but isn\'t the visible part');

    setTimeout(() => {
      testTask.style.backgroundColor = '';
      testTask.style.color = '';
      console.log('\n🔄 Color removed.');
    }, 4000);
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('📋 SUMMARY:');
  console.log('='.repeat(70));

  console.log(`\n✅ Visible tasks with data-eventid: ${buttonsWithEventId.length}`);
  console.log(`❌ Invisible tasks (no data-eventid): ${invisibleTasks.length}`);

  if (invisibleTasks.length > 0) {
    console.log('\n💡 SOLUTION:');
    console.log('   The timed tasks exist as .GTG3wb elements but lack data-eventid');
    console.log('   We need to:');
    console.log('   1. Find these tasks by a different method');
    console.log('   2. Correlate them with Tasks API data (by title/time)');
    console.log('   3. Update extension to handle both types');
  } else {
    console.log('\n🤔 ALL tasks have data-eventid...');
    console.log('   The problem must be something else.');
    console.log('   Check if list coloring is enabled and configured.');
  }

  console.log('\n' + '='.repeat(70));

  return {
    total: allGTG3wbButtons.length,
    withEventId: buttonsWithEventId.length,
    withoutEventId: invisibleTasks.length,
    invisibleTasks: invisibleTasks,
  };
}

window.findHiddenTimedTasks = findHiddenTimedTasks;

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║              FIND HIDDEN TIMED TASKS                                   ║
║                                                                        ║
║  Run: findHiddenTimedTasks()                                          ║
║                                                                        ║
║  This will find timed tasks that don't have data-eventid and try to  ║
║  color one MAGENTA to verify we can identify them.                    ║
║                                                                        ║
║  WATCH FOR: A MAGENTA (purple) colored task on your calendar         ║
╚════════════════════════════════════════════════════════════════════════╝
`);
