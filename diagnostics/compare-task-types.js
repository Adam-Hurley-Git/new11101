// ============================================================================
// COMPARE: Old vs New Task Card Structures
// ============================================================================
// Google has two types of task cards:
// 1. Old-style: All-day tasks (no time, small size)
// 2. New-style: Timed tasks (start/end time, variable size)
//
// This script finds both types and compares their DOM structure
// ============================================================================

function compareTaskTypes() {
  console.clear();
  console.log('🔍 COMPARING TASK CARD TYPES\n' + '='.repeat(70));

  const allTasks = document.querySelectorAll('[data-eventid^="tasks_"]');
  console.log(`Found ${allTasks.length} total tasks with data-eventid\n`);

  // Categorize tasks by their characteristics
  const oldStyleTasks = [];
  const newStyleTasks = [];

  allTasks.forEach((task) => {
    const rect = task.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    if (!isVisible) return;

    const taskInfo = {
      element: task,
      taskId: task.getAttribute('data-eventid').replace(/^tasks_/, ''),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      classes: task.className,
      hasGTG3wbClass: task.classList.contains('GTG3wb'),
      text: task.textContent?.substring(0, 60).trim(),
      attributes: Array.from(task.attributes).map(a => `${a.name}="${a.value.substring(0, 30)}"`),
    };

    // Heuristic: Small height (< 30px) = old style, Larger = new style
    if (rect.height < 30) {
      oldStyleTasks.push(taskInfo);
    } else {
      newStyleTasks.push(taskInfo);
    }
  });

  console.log(`📊 Categorization:`);
  console.log(`  • Old-style tasks (height < 30px): ${oldStyleTasks.length}`);
  console.log(`  • New-style tasks (height >= 30px): ${newStyleTasks.length}`);

  // ========================================================================
  // ANALYZE OLD-STYLE TASKS
  // ========================================================================
  if (oldStyleTasks.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('✅ OLD-STYLE TASKS (Being colored correctly)');
    console.log('='.repeat(70));

    const sample = oldStyleTasks[0];
    console.log('\nSample task:');
    console.log(`  Task ID: ${sample.taskId}`);
    console.log(`  Dimensions: ${sample.width}x${sample.height}px`);
    console.log(`  Text: "${sample.text}"`);
    console.log(`  Has .GTG3wb class: ${sample.hasGTG3wbClass ? '✅' : '❌'}`);
    console.log('\n  DOM Element:');
    console.log(sample.element);

    console.log('\n  Structure analysis:');
    console.log(`    • Element IS the button: ${sample.hasGTG3wbClass ? '✅' : '❌'}`);
    console.log(`    • Has role="button": ${sample.element.getAttribute('role') === 'button' ? '✅' : '❌'}`);
    console.log(`    • Can be colored directly: ${sample.hasGTG3wbClass ? '✅' : '❌'}`);

    // Test getPaintTarget logic
    const childButton = sample.element.querySelector('.GTG3wb');
    const closestButton = sample.element.closest('.GTG3wb');
    console.log(`    • querySelector('.GTG3wb'): ${childButton ? 'Found child' : '❌ null'}`);
    console.log(`    • closest('.GTG3wb'): ${closestButton ? '✅ Found (self)' : '❌ null'}`);
  }

  // ========================================================================
  // ANALYZE NEW-STYLE TASKS
  // ========================================================================
  if (newStyleTasks.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('❌ NEW-STYLE TASKS (NOT being colored)');
    console.log('='.repeat(70));

    const sample = newStyleTasks[0];
    console.log('\nSample task:');
    console.log(`  Task ID: ${sample.taskId}`);
    console.log(`  Dimensions: ${sample.width}x${sample.height}px`);
    console.log(`  Text: "${sample.text}"`);
    console.log(`  Has .GTG3wb class: ${sample.hasGTG3wbClass ? '✅' : '❌'}`);
    console.log('\n  DOM Element:');
    console.log(sample.element);

    console.log('\n  Structure analysis:');
    console.log(`    • Element IS the button: ${sample.hasGTG3wbClass ? '✅' : '❌'}`);
    console.log(`    • Has role="button": ${sample.element.getAttribute('role') === 'button' ? '✅' : '❌'}`);

    // Test getPaintTarget logic
    const childButton = sample.element.querySelector('.GTG3wb');
    const closestButton = sample.element.closest('.GTG3wb');
    const anyButton = sample.element.querySelector('button');
    const roleButton = sample.element.querySelector('[role="button"]');

    console.log('\n  getPaintTarget() tests:');
    console.log(`    • querySelector('.GTG3wb'): ${childButton ? '✅ Found child' : '❌ null'}`);
    console.log(`    • closest('.GTG3wb'): ${closestButton ? '✅ Found' : '❌ null'}`);
    console.log(`    • querySelector('button'): ${anyButton ? '✅ Found' : '❌ null'}`);
    console.log(`    • querySelector('[role="button"]'): ${roleButton ? '✅ Found' : '❌ null'}`);

    if (childButton) {
      console.log('\n  Child .GTG3wb button found:');
      const childRect = childButton.getBoundingClientRect();
      console.log(`    Size: ${Math.round(childRect.width)}x${Math.round(childRect.height)}px`);
      console.log(`    Classes: ${childButton.className}`);
      console.log(`    Text: "${childButton.textContent?.substring(0, 40)}"`);
      console.log(childButton);
    }

    // Check parent structure
    console.log('\n  Parent chain:');
    let current = sample.element;
    let depth = 0;
    while (current && depth < 5) {
      const hasGTG3wb = current.classList?.contains('GTG3wb');
      const hasEventId = current.getAttribute?.('data-eventid');
      console.log(`    ${depth}: <${current.tagName.toLowerCase()}> GTG3wb:${hasGTG3wb ? '✅' : '❌'} eventid:${hasEventId ? '✅' : '❌'}`);
      current = current.parentElement;
      depth++;
    }
  }

  // ========================================================================
  // IDENTIFY THE DIFFERENCE
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('🔬 KEY DIFFERENCES:');
  console.log('='.repeat(70));

  if (oldStyleTasks.length > 0 && newStyleTasks.length > 0) {
    const oldSample = oldStyleTasks[0];
    const newSample = newStyleTasks[0];

    console.log('\n🆚 Side-by-side comparison:');
    console.log('\n  OLD-STYLE (working):');
    console.log(`    • Element has .GTG3wb: ${oldSample.hasGTG3wbClass ? '✅' : '❌'}`);
    console.log(`    • Height: ${oldSample.height}px (small, fixed)`);
    console.log(`    • Element IS the colorable button: ${oldSample.hasGTG3wbClass ? '✅' : '❌'}`);

    console.log('\n  NEW-STYLE (broken):');
    console.log(`    • Element has .GTG3wb: ${newSample.hasGTG3wbClass ? '✅' : '❌'}`);
    console.log(`    • Height: ${newSample.height}px (large, variable)`);

    const newChildButton = newSample.element.querySelector('.GTG3wb');
    console.log(`    • Child .GTG3wb exists: ${newChildButton ? '✅' : '❌'}`);
    console.log(`    • Element IS the colorable button: ${newSample.hasGTG3wbClass ? '✅' : '❌'}`);

    if (!newSample.hasGTG3wbClass && !newChildButton) {
      console.log('\n  ❌ PROBLEM IDENTIFIED:');
      console.log('     New-style tasks have data-eventid but NO .GTG3wb class!');
      console.log('     And querySelector(\'.GTG3wb\') finds nothing!');
      console.log('     → getPaintTarget() returns null');
      console.log('     → No coloring applied');
    } else if (newChildButton && !newSample.hasGTG3wbClass) {
      console.log('\n  ⚠️  STRUCTURE CHANGED:');
      console.log('     Old: data-eventid element HAS .GTG3wb class');
      console.log('     New: data-eventid element CONTAINS child .GTG3wb');
      console.log('     → getPaintTarget() should find the child');
      console.log('     → But maybe there\'s another issue?');
    }
  }

  // ========================================================================
  // TEST COLORING ON BOTH TYPES
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('🎨 TESTING: Applying colors to both types');
  console.log('='.repeat(70));

  if (oldStyleTasks.length > 0) {
    const oldTask = oldStyleTasks[0].element;
    console.log('\n✅ Coloring OLD-STYLE task (should work)...');

    const oldTarget = oldTask.closest('.GTG3wb') || oldTask;
    oldTarget.style.backgroundColor = '#00FF00'; // Green
    oldTarget.style.color = '#000000';

    console.log('  → Applied GREEN color');
    console.log('  → Look for a GREEN task on calendar');

    setTimeout(() => {
      oldTarget.style.backgroundColor = '';
      oldTarget.style.color = '';
    }, 3000);
  }

  if (newStyleTasks.length > 0) {
    const newTask = newStyleTasks[0].element;
    console.log('\n❌ Coloring NEW-STYLE task (testing fix)...');

    // Try multiple strategies
    let target = newTask.querySelector('.GTG3wb');
    if (!target) target = newTask.closest('.GTG3wb');
    if (!target && newTask.matches('[role="button"]')) target = newTask;
    if (!target) target = newTask.querySelector('[role="button"]');
    if (!target) target = newTask;

    if (target) {
      target.style.backgroundColor = '#FF0000'; // Red
      target.style.color = '#FFFFFF';

      console.log('  → Applied RED color');
      console.log('  → Look for a RED task on calendar');
      console.log(`  → Target element: <${target.tagName.toLowerCase()}>`);

      setTimeout(() => {
        target.style.backgroundColor = '';
        target.style.color = '';
      }, 3000);
    } else {
      console.log('  ❌ Could not find any colorable element!');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('👀 WATCH YOUR CALENDAR:');
  console.log('  • GREEN = old-style task (should appear)');
  console.log('  • RED = new-style task (testing if it appears)');
  console.log('='.repeat(70) + '\n');
}

window.compareTaskTypes = compareTaskTypes;

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║              COMPARE TASK TYPES                                        ║
║                                                                        ║
║  Run: compareTaskTypes()                                              ║
║                                                                        ║
║  This will:                                                           ║
║  1. Find old-style tasks (no time, small)                            ║
║  2. Find new-style tasks (timed, large)                              ║
║  3. Compare their DOM structures                                      ║
║  4. Test coloring BOTH types                                          ║
║  5. Show you GREEN and RED tasks                                      ║
╚════════════════════════════════════════════════════════════════════════╝
`);
