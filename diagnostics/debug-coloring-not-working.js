// ============================================================================
// DEBUG: Why is task coloring not working?
// ============================================================================
// Run this on calendar.google.com with the extension ENABLED
// This will check if the extension is loaded and coloring logic is running
// ============================================================================

async function debugColoringNotWorking() {
  console.clear();
  console.log('🐛 DEBUGGING: Why Task Coloring Is Not Working\n' + '='.repeat(70));

  const results = {
    extensionLoaded: false,
    settingsEnabled: false,
    tasksFound: 0,
    coloredTasks: 0,
    oauthGranted: false,
    hasTaskColors: false,
    errors: [],
    recommendations: [],
  };

  // ========================================================================
  // CHECK 1: Is the extension content script loaded?
  // ========================================================================
  console.log('\n1️⃣ Checking if ColorKit extension is loaded...');

  // Check for extension markers
  const markers = {
    cfTasksColoring: typeof window.cfTasksColoring !== 'undefined',
    cc3Storage: typeof window.cc3Storage !== 'undefined',
    cc3Features: typeof window.cc3Features !== 'undefined',
  };

  results.extensionLoaded = markers.cfTasksColoring || markers.cc3Storage || markers.cc3Features;

  console.log(`   Extension markers:`);
  console.log(`   - window.cfTasksColoring: ${markers.cfTasksColoring ? '✅' : '❌'}`);
  console.log(`   - window.cc3Storage: ${markers.cc3Storage ? '✅' : '❌'}`);
  console.log(`   - window.cc3Features: ${markers.cc3Features ? '✅' : '❌'}`);

  if (!results.extensionLoaded) {
    console.log(`\n   ❌ PROBLEM: Extension not loaded!`);
    console.log(`   → Go to chrome://extensions`);
    console.log(`   → Verify ColorKit is enabled`);
    console.log(`   → Refresh the page (F5)`);
    results.recommendations.push('Enable extension and refresh page');
    results.errors.push('Extension content script not loaded');
  } else {
    console.log(`\n   ✅ Extension is loaded`);
  }

  // ========================================================================
  // CHECK 2: Are settings enabled?
  // ========================================================================
  console.log('\n2️⃣ Checking extension settings...');

  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const settings = await chrome.storage.sync.get('settings');

      if (settings.settings) {
        const taskColoringEnabled = settings.settings.taskColoring?.enabled;
        const taskListColoringEnabled = settings.settings.taskListColoring?.enabled;
        const oauthGranted = settings.settings.taskListColoring?.oauthGranted;

        results.settingsEnabled = taskColoringEnabled || taskListColoringEnabled;
        results.oauthGranted = oauthGranted;

        console.log(`   Task Coloring Settings:`);
        console.log(`   - Individual task coloring: ${taskColoringEnabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`   - Task list coloring: ${taskListColoringEnabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`   - OAuth granted: ${oauthGranted ? '✅ Yes' : '❌ No'}`);

        if (!taskColoringEnabled && !taskListColoringEnabled) {
          console.log(`\n   ❌ PROBLEM: Task coloring is disabled in settings!`);
          console.log(`   → Click extension icon`);
          console.log(`   → Enable "Color Tasks" or "Task List Colors"`);
          results.recommendations.push('Enable task coloring in extension popup');
          results.errors.push('Task coloring disabled in settings');
        }

        if (taskListColoringEnabled && !oauthGranted) {
          console.log(`\n   ⚠️  WARNING: Task list coloring enabled but OAuth not granted`);
          console.log(`   → Click extension icon`);
          console.log(`   → Click "Grant Access" button`);
          results.recommendations.push('Grant Google Tasks API access');
        }
      } else {
        console.log(`   ❌ No settings found`);
        results.errors.push('Extension settings not initialized');
      }
    } else {
      console.log(`   ⚠️  Cannot access chrome.storage (may need to run in extension context)`);
    }
  } catch (error) {
    console.log(`   ❌ Error reading settings: ${error.message}`);
    results.errors.push(`Settings error: ${error.message}`);
  }

  // ========================================================================
  // CHECK 3: Are there tasks on the page?
  // ========================================================================
  console.log('\n3️⃣ Checking for tasks in DOM...');

  const taskElements = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
  results.tasksFound = taskElements.length;

  console.log(`   Found ${results.tasksFound} task elements`);

  if (results.tasksFound === 0) {
    console.log(`   ❌ PROBLEM: No tasks found in DOM!`);
    console.log(`   → Make sure you have tasks visible in Calendar`);
    console.log(`   → Switch to week or day view`);
    console.log(`   → Create a test task if needed`);
    results.recommendations.push('Add tasks to calendar or switch to week/day view');
    results.errors.push('No tasks found in DOM');
  } else {
    console.log(`   ✅ Tasks present in DOM`);

    // Check if any are actually colored
    taskElements.forEach((el) => {
      const button = el.querySelector('.GTG3wb');
      if (button) {
        const bgColor = window.getComputedStyle(button).backgroundColor;
        const hasColor = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
        if (hasColor) {
          results.coloredTasks++;
        }
      }
    });

    console.log(`   - Tasks with colors applied: ${results.coloredTasks}`);

    if (results.coloredTasks === 0 && results.tasksFound > 0) {
      console.log(`   ⚠️  Tasks found but none have colors applied`);
    }
  }

  // ========================================================================
  // CHECK 4: Are there any task colors saved?
  // ========================================================================
  console.log('\n4️⃣ Checking for saved task colors...');

  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const data = await chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors']);

      const manualColors = data['cf.taskColors'] || {};
      const listColors = data['cf.taskListColors'] || {};

      const manualCount = Object.keys(manualColors).length;
      const listCount = Object.keys(listColors).length;

      results.hasTaskColors = manualCount > 0 || listCount > 0;

      console.log(`   Saved colors:`);
      console.log(`   - Manual task colors: ${manualCount} tasks`);
      console.log(`   - List default colors: ${listCount} lists`);

      if (manualCount === 0 && listCount === 0) {
        console.log(`\n   ⚠️  No colors saved yet!`);
        console.log(`   → Click on a task in Calendar`);
        console.log(`   → Choose a color from the color picker`);
        console.log(`   → Or set default colors for task lists`);
        results.recommendations.push('Set colors for tasks or task lists');
      } else {
        console.log(`\n   ✅ Colors are saved`);

        if (manualCount > 0) {
          console.log(`\n   Sample manual colors:`);
          Object.entries(manualColors)
            .slice(0, 3)
            .forEach(([taskId, color]) => {
              console.log(`     • Task ${taskId.substring(0, 10)}...: ${color}`);
            });
        }

        if (listCount > 0) {
          console.log(`\n   Sample list colors:`);
          Object.entries(listColors)
            .slice(0, 3)
            .forEach(([listId, color]) => {
              console.log(`     • List ${listId}: ${color}`);
            });
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Error reading colors: ${error.message}`);
    results.errors.push(`Color data error: ${error.message}`);
  }

  // ========================================================================
  // CHECK 5: Are there any console errors?
  // ========================================================================
  console.log('\n5️⃣ Checking for errors in console...');

  console.log(`   → Open Console (F12) and look for red errors`);
  console.log(`   → Common issues:`);
  console.log(`     - "Cannot read property of undefined"`);
  console.log(`     - "chrome.storage is not defined"`);
  console.log(`     - "Permission denied"`);

  // ========================================================================
  // CHECK 6: Try to manually trigger repaint
  // ========================================================================
  console.log('\n6️⃣ Attempting manual repaint...');

  if (markers.cfTasksColoring && window.cfTasksColoring.doRepaint) {
    try {
      console.log(`   Calling doRepaint()...`);
      window.cfTasksColoring.doRepaint();
      console.log(`   ✅ Repaint triggered (check if colors appear)`);
      results.recommendations.push('Check if colors appeared after manual repaint');
    } catch (error) {
      console.log(`   ❌ Repaint failed: ${error.message}`);
      results.errors.push(`Repaint error: ${error.message}`);
    }
  } else {
    console.log(`   ⚠️  Cannot trigger repaint (extension not fully loaded)`);
  }

  // ========================================================================
  // CHECK 7: Inspect a specific task
  // ========================================================================
  if (results.tasksFound > 0) {
    console.log('\n7️⃣ Inspecting first task element...');

    const firstTask = document.querySelector('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
    if (firstTask) {
      const eventId = firstTask.getAttribute('data-eventid');
      const taskId = eventId?.replace(/^tasks[._]/, '');
      const button = firstTask.querySelector('.GTG3wb');

      console.log(`   First task found:`);
      console.log(`   - data-eventid: ${eventId}`);
      console.log(`   - Extracted task ID: ${taskId}`);
      console.log(`   - Has button (.GTG3wb): ${button ? '✅' : '❌'}`);

      if (button) {
        const styles = window.getComputedStyle(button);
        console.log(`   - Button background: ${styles.backgroundColor}`);
        console.log(`   - Button color: ${styles.color}`);
        console.log(`   - Has inline style: ${button.style.backgroundColor ? '✅' : '❌'}`);

        if (button.style.backgroundColor) {
          console.log(`     Inline style: ${button.style.backgroundColor}`);
        }
      }
    }
  }

  // ========================================================================
  // SUMMARY & RECOMMENDATIONS
  // ========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('📋 SUMMARY:');
  console.log('='.repeat(70));

  console.log(`\n✅ Working:`);
  if (results.extensionLoaded) console.log(`   • Extension loaded`);
  if (results.tasksFound > 0) console.log(`   • Tasks found in DOM (${results.tasksFound})`);
  if (results.settingsEnabled) console.log(`   • Task coloring enabled in settings`);
  if (results.hasTaskColors) console.log(`   • Colors saved in storage`);

  if (results.errors.length > 0) {
    console.log(`\n❌ Issues Found:`);
    results.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err}`);
    });
  }

  if (results.recommendations.length > 0) {
    console.log(`\n💡 Recommendations:`);
    results.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }

  // Determine root cause
  console.log('\n🎯 MOST LIKELY CAUSE:');
  if (!results.extensionLoaded) {
    console.log(`   ❌ Extension not loaded or not enabled`);
    console.log(`   → Enable extension and refresh page`);
  } else if (!results.settingsEnabled) {
    console.log(`   ❌ Task coloring disabled in settings`);
    console.log(`   → Open extension popup and enable task coloring`);
  } else if (results.tasksFound === 0) {
    console.log(`   ❌ No tasks visible in calendar`);
    console.log(`   → Add tasks or switch to week/day view`);
  } else if (!results.hasTaskColors) {
    console.log(`   ⚠️  No colors have been set yet`);
    console.log(`   → Click on a task and choose a color`);
    console.log(`   → Or configure task list default colors`);
  } else if (results.coloredTasks === 0) {
    console.log(`   ❌ Extension loaded but colors not applying`);
    console.log(`   → Check console for JavaScript errors`);
    console.log(`   → Try manually triggering repaint (ran above)`);
    console.log(`   → May need to debug the coloring logic`);
  } else {
    console.log(`   ✅ Everything looks correct!`);
    console.log(`   → Colors should be visible`);
    console.log(`   → If not, try refreshing (F5)`);
  }

  console.log('\n' + '='.repeat(70));

  return results;
}

// Export to window
window.debugColoringNotWorking = debugColoringNotWorking;

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║              DEBUG: TASK COLORING NOT WORKING                          ║
║                                                                        ║
║  Run: await debugColoringNotWorking()                                 ║
║                                                                        ║
║  This will check:                                                     ║
║  1. Is extension loaded?                                              ║
║  2. Are settings enabled?                                             ║
║  3. Are tasks present?                                                ║
║  4. Are colors saved?                                                 ║
║  5. Why aren't colors showing?                                        ║
╚════════════════════════════════════════════════════════════════════════╝
`);
