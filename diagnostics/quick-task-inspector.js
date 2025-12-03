// ============================================================================
// QUICK TASK INSPECTOR - Simplified version for immediate testing
// ============================================================================
// Copy/paste this into console on calendar.google.com, then run:
//   quickInspect()
// ============================================================================

async function quickInspect() {
  console.clear();
  console.log('🔍 QUICK TASK INSPECTOR\n' + '='.repeat(60));

  // 1. Check legacy selectors
  console.log('\n1️⃣ Testing LEGACY selectors (old approach)...');
  const legacy = {
    byEventId: document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]'),
    byTaskId: document.querySelectorAll('[data-taskid]'),
    byClass: document.querySelectorAll('.GTG3wb'),
  };

  console.log(`   data-eventid: ${legacy.byEventId.length} elements ${legacy.byEventId.length > 0 ? '✅' : '❌'}`);
  console.log(`   data-taskid:  ${legacy.byTaskId.length} elements ${legacy.byTaskId.length > 0 ? '✅' : '❌'}`);
  console.log(`   .GTG3wb:      ${legacy.byClass.length} elements ${legacy.byClass.length > 0 ? '✅' : '❌'}`);

  if (legacy.byEventId.length > 0) {
    console.log('\n   ✅ GOOD NEWS: Legacy approach still works!');
    console.log('   Sample task IDs found:');
    Array.from(legacy.byEventId)
      .slice(0, 3)
      .forEach((el) => {
        const eventId = el.getAttribute('data-eventid');
        const taskId = eventId?.replace(/^tasks[._]/, '');
        console.log(`     • ${taskId}`);
      });
  }

  // 2. Look for tasks.google.com URLs
  console.log('\n2️⃣ Searching for tasks.google.com URLs...');
  const urls = [];
  document.querySelectorAll('*').forEach((el) => {
    if (el.attributes) {
      for (const attr of el.attributes) {
        if (attr.value.includes('tasks.google.com')) {
          urls.push({
            tag: el.tagName.toLowerCase(),
            attr: attr.name,
            value: attr.value,
          });
        }
      }
    }
  });

  console.log(`   Found ${urls.length} URLs ${urls.length > 0 ? '✅' : '❌'}`);

  if (urls.length > 0) {
    console.log('   Sample URLs:');
    urls.slice(0, 3).forEach((u) => {
      const match = u.value.match(/\/task\/([^?&#/]+)/);
      const fragmentId = match ? match[1] : 'none';
      console.log(`     • <${u.tag} ${u.attr}="...">`);
      console.log(`       Fragment: ${fragmentId}`);
    });
  }

  // 3. Check iframes
  console.log('\n3️⃣ Checking iframes...');
  const iframes = Array.from(document.querySelectorAll('iframe'));
  const taskIframes = iframes.filter((f) => f.src?.includes('tasks.google.com'));

  console.log(`   Total iframes: ${iframes.length}`);
  console.log(`   Tasks iframes: ${taskIframes.length} ${taskIframes.length > 0 ? '✅' : '❌'}`);

  if (taskIframes.length > 0) {
    taskIframes.forEach((iframe, i) => {
      console.log(`     [${i}] ${iframe.src.substring(0, 80)}...`);
    });
  }

  // 4. Find task-related attributes
  console.log('\n4️⃣ Scanning for task-related attributes...');
  const taskAttrs = new Map();

  document.querySelectorAll('*').forEach((el) => {
    if (el.attributes) {
      for (const attr of el.attributes) {
        const name = attr.name.toLowerCase();
        const value = attr.value?.toLowerCase() || '';

        if (
          (name.includes('task') || value.includes('task') || name.includes('event') || value.includes('event')) &&
          (name.startsWith('data-') || name.includes('id'))
        ) {
          const key = `${name}`;
          taskAttrs.set(key, (taskAttrs.get(key) || 0) + 1);
        }
      }
    }
  });

  if (taskAttrs.size > 0) {
    console.log(`   Found ${taskAttrs.size} unique attributes:`);
    Array.from(taskAttrs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([attr, count]) => {
        console.log(`     • ${attr} (${count}x)`);
      });
  } else {
    console.log('   ❌ No task-related attributes found');
  }

  // 5. Interactive inspector
  console.log('\n5️⃣ Interactive mode available!');
  console.log('   Run: clickToInspect()');
  console.log('   Then click on any task to see its details');

  // 6. Recommendation
  console.log('\n' + '='.repeat(60));
  console.log('📋 RECOMMENDATION:');
  console.log('='.repeat(60));

  if (legacy.byEventId.length > 0) {
    console.log('✅ STATUS: Current implementation should work');
    console.log('   → Legacy data-eventid selectors are present');
    console.log('   → No changes needed immediately');
    console.log('   → Monitor for future Google updates');
  } else if (urls.length > 0 || taskIframes.length > 0) {
    console.log('🔗 STATUS: Need to implement webViewLink mapping');
    console.log('   → tasks.google.com URLs found in DOM');
    console.log('   → Update API to store webViewLink');
    console.log('   → Extract fragment IDs for matching');
    console.log('\n   See: /docs/TASK_MAPPING_INVESTIGATION.md (Scenario B)');
  } else if (taskAttrs.size > 0) {
    console.log('🔍 STATUS: Need to identify stable attributes');
    console.log('   → Some task-related attributes exist');
    console.log('   → Test which are stable across views');
    console.log('   → Update selectors accordingly');
    console.log('\n   See: /docs/TASK_MAPPING_INVESTIGATION.md (Scenario C)');
  } else {
    console.log('❌ STATUS: No obvious mapping found');
    console.log('   → Run clickToInspect() and manually examine tasks');
    console.log('   → May need heuristic matching (title + date)');
    console.log('\n   See: /docs/TASK_MAPPING_INVESTIGATION.md (Scenario D)');
  }

  console.log('\n' + '='.repeat(60));
  console.log('For detailed investigation:');
  console.log('  • Load: /diagnostics/task-mapping-explorer.js');
  console.log('  • Run: await exploreTaskMapping()');
  console.log('='.repeat(60) + '\n');

  return {
    legacy,
    urls,
    iframes: taskIframes,
    attributes: taskAttrs,
  };
}

// Interactive inspector function
function clickToInspect() {
  console.log('\n👆 Click on any task to inspect it...\n');
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    console.clear();
    console.log('🎯 INSPECTING CLICKED ELEMENT\n' + '='.repeat(60));
    console.log(`Tag:     ${el.tagName}`);
    console.log(`Class:   ${el.className || '(none)'}`);
    console.log(`ID:      ${el.id || '(none)'}`);
    console.log(`Text:    ${el.textContent?.substring(0, 100) || '(none)'}`);

    console.log('\nAll attributes:');
    if (el.attributes && el.attributes.length > 0) {
      for (const attr of el.attributes) {
        console.log(`  ${attr.name} = "${attr.value}"`);
      }
    } else {
      console.log('  (no attributes)');
    }

    console.log('\nParent hierarchy:');
    let current = el.parentElement;
    let depth = 1;
    while (current && depth <= 5) {
      const id = current.id ? `#${current.id}` : '';
      const classes = current.className ? `.${current.className.split(' ')[0]}` : '';
      console.log(`  ${'  '.repeat(depth - 1)}↑ <${current.tagName.toLowerCase()}${id}${classes}>`);

      // Show interesting attributes on parents
      if (current.attributes) {
        for (const attr of current.attributes) {
          const name = attr.name.toLowerCase();
          const value = attr.value;
          if (
            name.includes('task') ||
            name.includes('event') ||
            value.includes('task') ||
            value.includes('tasks.google.com')
          ) {
            console.log(`  ${'  '.repeat(depth)}  ⚡ ${name}="${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Run clickToInspect() again to inspect another element');
    console.log('='.repeat(60) + '\n');

    document.removeEventListener('click', handler, true);
  };

  document.addEventListener('click', handler, true);
}

// Export functions to window
window.quickInspect = quickInspect;
window.clickToInspect = clickToInspect;

// Show welcome message
console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                        QUICK TASK INSPECTOR LOADED                         ║
║                                                                            ║
║  Run: quickInspect()                                                      ║
║                                                                            ║
║  Interactive: clickToInspect() - then click on a task                    ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
