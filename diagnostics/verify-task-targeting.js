// ============================================================================
// VERIFY: Are we targeting the CORRECT task elements?
// ============================================================================
// This script verifies that data-eventid elements are ACTUALLY the visible
// task cards that should be colored, not some hidden/unrelated elements.
// ============================================================================

async function verifyTaskTargeting() {
  console.clear();
  console.log('🔍 VERIFYING TASK TARGETING\n' + '='.repeat(70));

  const report = {
    totalFound: 0,
    visible: 0,
    hidden: 0,
    correctTargets: 0,
    wrongTargets: 0,
    colorTestResults: [],
  };

  // ========================================================================
  // STEP 1: Find ALL task elements with data-eventid
  // ========================================================================
  console.log('\n1️⃣ Finding all data-eventid task elements...');

  const taskElements = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
  report.totalFound = taskElements.length;

  console.log(`   Found ${report.totalFound} elements with data-eventid`);

  if (report.totalFound === 0) {
    console.log('   ❌ No task elements found! Extension may be disabled.');
    return report;
  }

  // ========================================================================
  // STEP 2: Analyze each element - Is it visible? What is it?
  // ========================================================================
  console.log('\n2️⃣ Analyzing each element...');

  const analysis = [];

  taskElements.forEach((el, index) => {
    const eventId = el.getAttribute('data-eventid');
    const taskId = eventId?.replace(/^tasks[._]/, '');

    // Check visibility
    const rect = el.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;

    // Check what type of element it is
    const tagName = el.tagName.toLowerCase();
    const classes = el.className;
    const hasButton = !!el.querySelector('.GTG3wb');
    const buttonCount = el.querySelectorAll('.GTG3wb').length;

    // Get computed styles
    const styles = window.getComputedStyle(el);
    const bgColor = styles.backgroundColor;
    const display = styles.display;
    const position = styles.position;

    // Check parent structure
    const parent = el.parentElement;
    const parentClass = parent?.className || '';

    // Get text content
    const text = el.textContent?.trim().substring(0, 50) || '';

    const info = {
      index,
      taskId,
      eventId,
      tagName,
      classes,
      isVisible,
      hasButton,
      buttonCount,
      bgColor,
      display,
      position,
      parentClass,
      text,
      dimensions: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
    };

    analysis.push(info);

    if (isVisible) {
      report.visible++;
    } else {
      report.hidden++;
    }
  });

  // Show summary
  console.log(`\n   📊 Breakdown:`);
  console.log(`   - Visible elements: ${report.visible}`);
  console.log(`   - Hidden elements: ${report.hidden}`);

  // Show visible ones
  const visibleElements = analysis.filter(a => a.isVisible);

  if (visibleElements.length > 0) {
    console.log(`\n   ✅ Visible task elements (first 5):`);
    visibleElements.slice(0, 5).forEach((info, i) => {
      console.log(`\n   [${i + 1}] Task ID: ${info.taskId}`);
      console.log(`       Tag: <${info.tagName}>`);
      console.log(`       Has .GTG3wb button: ${info.hasButton ? '✅' : '❌'} (${info.buttonCount} buttons)`);
      console.log(`       Dimensions: ${Math.round(info.dimensions.width)}x${Math.round(info.dimensions.height)}px`);
      console.log(`       Background: ${info.bgColor}`);
      console.log(`       Text: "${info.text.substring(0, 40)}..."`);
    });
  } else {
    console.log(`\n   ❌ NO VISIBLE ELEMENTS! All ${report.totalFound} elements are hidden.`);
    console.log(`   → This means data-eventid exists but not on visible task cards!`);
  }

  // ========================================================================
  // STEP 3: Identify the CORRECT target for coloring
  // ========================================================================
  console.log('\n3️⃣ Identifying correct coloring targets...');

  console.log(`\n   Current extension logic (features/tasks-coloring/index.js):`);
  console.log(`   1. Finds element with: [data-eventid="tasks.{id}"]`);
  console.log(`   2. Looks for button: el.querySelector('.GTG3wb')`);
  console.log(`   3. Colors the button's background`);

  console.log(`\n   Checking if this logic is correct...`);

  let correctTargetCount = 0;

  visibleElements.forEach((info) => {
    if (info.hasButton && info.buttonCount > 0) {
      correctTargetCount++;
    }
  });

  report.correctTargets = correctTargetCount;
  report.wrongTargets = report.visible - correctTargetCount;

  console.log(`\n   ✅ Elements with .GTG3wb button: ${correctTargetCount}`);
  console.log(`   ❌ Elements WITHOUT button: ${report.wrongTargets}`);

  if (report.wrongTargets > 0) {
    console.log(`\n   ⚠️  WARNING: Some visible elements don't have .GTG3wb button!`);
    console.log(`   → These won't be colored by current implementation.`);
  }

  // ========================================================================
  // STEP 4: TEST - Manually color a task to verify
  // ========================================================================
  console.log('\n4️⃣ Testing manual coloring...');

  if (visibleElements.length > 0) {
    const testElement = visibleElements[0];
    const el = taskElements[testElement.index];
    const button = el.querySelector('.GTG3wb');

    console.log(`\n   Testing on first visible task: ${testElement.taskId}`);

    if (button) {
      // Apply a test color
      const testColor = '#FF0000'; // Bright red
      button.style.backgroundColor = testColor;
      button.style.color = '#FFFFFF';

      console.log(`   ✅ Applied RED color to button`);
      console.log(`   → Look at the calendar - do you see a RED task?`);
      console.log(`   → If YES: Targeting is correct, extension logic has a bug`);
      console.log(`   → If NO: We're targeting the wrong element!`);

      report.colorTestResults.push({
        taskId: testElement.taskId,
        applied: true,
        color: testColor,
        element: 'button.GTG3wb',
      });

      // Wait 3 seconds then remove
      setTimeout(() => {
        button.style.backgroundColor = '';
        button.style.color = '';
        console.log(`\n   🔄 Test color removed. Did you see it?`);
      }, 3000);

    } else {
      console.log(`   ❌ No button found! Cannot test coloring.`);
      console.log(`   → This task element doesn't have .GTG3wb`);
      console.log(`   → Current implementation won't color it`);
    }
  }

  // ========================================================================
  // STEP 5: Explore alternative targets
  // ========================================================================
  console.log('\n5️⃣ Exploring alternative color targets...');

  if (visibleElements.length > 0) {
    const testEl = taskElements[visibleElements[0].index];

    console.log(`\n   Inspecting first visible task's DOM structure:`);
    console.log(testEl);

    // Try different selectors
    const alternatives = {
      'button.GTG3wb': testEl.querySelector('.GTG3wb'),
      'div with bgr46c class': testEl.querySelector('.bgr46c'),
      'any button': testEl.querySelector('button'),
      'element itself': testEl,
      'parent element': testEl.parentElement,
    };

    console.log(`\n   Possible coloring targets:`);
    for (const [desc, element] of Object.entries(alternatives)) {
      if (element) {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        console.log(`   • ${desc}: ${isVisible ? '✅ Visible' : '❌ Hidden'} (${Math.round(rect.width)}x${Math.round(rect.height)}px)`);
      } else {
        console.log(`   • ${desc}: ❌ Not found`);
      }
    }
  }

  // ========================================================================
  // STEP 6: Check if tasks are in modal vs. calendar grid
  // ========================================================================
  console.log('\n6️⃣ Checking where task elements are located...');

  const locations = {
    inCalendarGrid: 0,
    inModal: 0,
    inSidebar: 0,
    unknown: 0,
  };

  analysis.forEach((info) => {
    const el = taskElements[info.index];

    if (el.closest('[role="dialog"]')) {
      locations.inModal++;
    } else if (el.closest('[role="grid"]')) {
      locations.inCalendarGrid++;
    } else if (el.closest('aside') || el.closest('[role="complementary"]')) {
      locations.inSidebar++;
    } else {
      locations.unknown++;
    }
  });

  console.log(`\n   Location breakdown:`);
  console.log(`   - In calendar grid: ${locations.inCalendarGrid} ${locations.inCalendarGrid > 0 ? '✅' : '❌'}`);
  console.log(`   - In modal dialog: ${locations.inModal}`);
  console.log(`   - In sidebar: ${locations.inSidebar}`);
  console.log(`   - Unknown location: ${locations.unknown}`);

  if (locations.inCalendarGrid === 0) {
    console.log(`\n   ❌ PROBLEM: No task elements found in calendar grid!`);
    console.log(`   → data-eventid elements exist but not on calendar task chips`);
    console.log(`   → We need to find the ACTUAL calendar task elements`);
  }

  // ========================================================================
  // STEP 7: Find ACTUAL visible task cards on calendar
  // ========================================================================
  console.log('\n7️⃣ Finding ACTUAL visible task cards...');

  // Try to find task cards by other means
  const possibleTasks = document.querySelectorAll('.GTG3wb');

  console.log(`\n   Found ${possibleTasks.length} .GTG3wb elements (task buttons)`);

  if (possibleTasks.length > 0) {
    console.log(`\n   Analyzing .GTG3wb elements (first 3):`);

    Array.from(possibleTasks).slice(0, 3).forEach((button, i) => {
      const rect = button.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;

      // Walk up to find data-eventid
      let current = button;
      let foundEventId = null;
      let depth = 0;

      while (current && depth < 10) {
        const eventId = current.getAttribute('data-eventid');
        if (eventId && (eventId.startsWith('tasks.') || eventId.startsWith('tasks_'))) {
          foundEventId = eventId;
          break;
        }
        current = current.parentElement;
        depth++;
      }

      console.log(`\n   [${i + 1}] Button:`);
      console.log(`       Visible: ${isVisible ? '✅' : '❌'}`);
      console.log(`       Size: ${Math.round(rect.width)}x${Math.round(rect.height)}px`);
      console.log(`       Text: "${button.textContent?.trim().substring(0, 40)}"`);
      console.log(`       Parent with data-eventid: ${foundEventId || '❌ Not found'}`);
      console.log(`       Distance to parent: ${depth} levels`);
    });
  }

  // ========================================================================
  // SUMMARY & DIAGNOSIS
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('📋 DIAGNOSIS:');
  console.log('='.repeat(70));

  console.log(`\n✅ What we found:`);
  console.log(`   • Total data-eventid elements: ${report.totalFound}`);
  console.log(`   • Visible elements: ${report.visible}`);
  console.log(`   • Elements with .GTG3wb button: ${report.correctTargets}`);
  console.log(`   • Elements in calendar grid: ${locations.inCalendarGrid}`);
  console.log(`   • Total .GTG3wb buttons: ${possibleTasks.length}`);

  console.log(`\n🎯 ROOT CAUSE:`);

  if (report.totalFound === 0) {
    console.log(`   ❌ No data-eventid elements found`);
    console.log(`   → Extension not loaded or Google changed selectors`);
  } else if (report.visible === 0) {
    console.log(`   ❌ data-eventid elements exist but ALL are hidden`);
    console.log(`   → Selectors exist but not on visible task cards`);
    console.log(`   → We need to find different selectors for visible tasks`);
  } else if (locations.inCalendarGrid === 0) {
    console.log(`   ❌ data-eventid elements not in calendar grid`);
    console.log(`   → They're in modals or other locations`);
    console.log(`   → Need to find calendar-specific selectors`);
  } else if (report.correctTargets === 0) {
    console.log(`   ❌ Visible elements don't have .GTG3wb button`);
    console.log(`   → Current coloring target (.GTG3wb) doesn't exist`);
    console.log(`   → Need to find correct coloring target`);
  } else {
    console.log(`   ✅ Targeting looks correct!`);
    console.log(`   → ${report.correctTargets} visible tasks with .GTG3wb button`);
    console.log(`   → Problem likely in extension's coloring logic`);
    console.log(`   → Check if extension is enabled and colors are set`);
  }

  console.log(`\n💡 NEXT STEPS:`);

  if (report.visible > 0 && report.correctTargets > 0) {
    console.log(`   1. Did you see the RED test color? (Check the calendar)`);
    console.log(`   2. If YES: Run debugColoringNotWorking() to find extension bug`);
    console.log(`   3. If NO: We're targeting the wrong element - need to redesign`);
  } else {
    console.log(`   1. Google may have changed the task card structure`);
    console.log(`   2. Run: clickToInspect() then click on a visible task`);
    console.log(`   3. Inspect the DOM structure manually`);
    console.log(`   4. Find the correct selectors for visible tasks`);
  }

  console.log('\n' + '='.repeat(70));

  return report;
}

// Export to window
window.verifyTaskTargeting = verifyTaskTargeting;

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║              VERIFY TASK TARGETING                                     ║
║                                                                        ║
║  Run: await verifyTaskTargeting()                                     ║
║                                                                        ║
║  This will:                                                           ║
║  1. Find all data-eventid elements                                    ║
║  2. Check if they're visible                                          ║
║  3. Verify they have .GTG3wb buttons                                  ║
║  4. TEST: Apply RED color to first task                               ║
║  5. Diagnose why coloring isn't working                               ║
║                                                                        ║
║  WATCH THE CALENDAR: A task should turn RED for 3 seconds            ║
╚════════════════════════════════════════════════════════════════════════╝
`);
