// ============================================================================
// GOOGLE CALENDAR TASK MAPPING EXPLORER
// ============================================================================
// Run this in the browser console on calendar.google.com to discover how
// tasks are represented in the new Calendar UI
//
// USAGE:
// 1. Open Google Calendar
// 2. Make sure you have some tasks visible
// 3. Copy/paste this entire file into the console
// 4. Run: await exploreTaskMapping()
//
// OPTIONAL: To test with a specific task:
// 1. Get a task ID from the Tasks API (use the extension's sync)
// 2. Run: await exploreTaskMapping({ targetTaskId: 'your-task-id' })
// ============================================================================

/**
 * Main exploration function - discovers all possible task identifiers
 * @param {Object} options - Configuration options
 * @param {string} options.targetTaskId - Optional specific task ID to search for
 * @param {boolean} options.verbose - Show detailed logging (default: true)
 */
async function exploreTaskMapping(options = {}) {
  const { targetTaskId = null, verbose = true } = options;

  console.log('🔍 CALENDAR TASK MAPPING EXPLORER');
  console.log('=' .repeat(80));

  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTaskElements: 0,
      identificationMethods: [],
      recommendedApproach: null,
    },
    findings: {
      dataAttributes: [],
      classPatterns: [],
      urlFragments: [],
      iframes: [],
      ariaTags: [],
    },
    testResults: {},
  };

  // ========================================================================
  // PHASE 1: DISCOVER ALL TASK-LIKE ELEMENTS
  // ========================================================================
  console.log('\n📋 PHASE 1: Discovering task elements...');

  const discoveries = {
    // Legacy patterns (may not work in new UI)
    legacyEventId: document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]'),
    legacyTaskId: document.querySelectorAll('[data-taskid]'),
    legacyTaskButton: document.querySelectorAll('.GTG3wb'),

    // Generic task-related attributes
    anyTaskAttr: document.querySelectorAll('[data-*="task" i], [id*="task" i], [class*="task" i]'),

    // ARIA/semantic patterns
    taskListItems: document.querySelectorAll('[role="listitem"]'),
    taskButtons: document.querySelectorAll('[role="button"][aria-label*="task" i]'),
    taskCheckboxes: document.querySelectorAll('[type="checkbox"][aria-label*="task" i]'),

    // Link-based patterns
    tasksLinks: document.querySelectorAll('a[href*="tasks.google.com"]'),
  };

  console.log('\n📊 Initial Discovery Results:');
  for (const [key, nodeList] of Object.entries(discoveries)) {
    const count = nodeList.length;
    console.log(`  ${count > 0 ? '✅' : '❌'} ${key}: ${count} elements`);
    if (count > 0) {
      results.summary.totalTaskElements += count;
      results.summary.identificationMethods.push(key);
    }
  }

  // ========================================================================
  // PHASE 2: ANALYZE DATA ATTRIBUTES
  // ========================================================================
  console.log('\n🔬 PHASE 2: Analyzing data attributes...');

  const dataAttrMap = new Map();
  const allElements = document.querySelectorAll('*');

  allElements.forEach((el) => {
    // Look for task-related text content
    const text = el.textContent?.trim();
    const isShortText = text && text.length > 0 && text.length < 200;

    // Check all attributes for task-related patterns
    if (el.attributes) {
      for (const attr of el.attributes) {
        const name = attr.name.toLowerCase();
        const value = attr.value?.toLowerCase() || '';

        // Look for potential task identifiers
        const hasTaskKeyword = name.includes('task') || value.includes('task');
        const hasEventKeyword = name.includes('event') || value.includes('event');
        const hasIdPattern = name.includes('id') || name.startsWith('data-');
        const hasTasksUrl = value.includes('tasks.google.com');

        if ((hasTaskKeyword || hasEventKeyword || hasTasksUrl) && (hasIdPattern || hasTasksUrl)) {
          const key = `${name}="${value.substring(0, 100)}"`;
          if (!dataAttrMap.has(key)) {
            dataAttrMap.set(key, {
              attribute: name,
              sampleValue: value.substring(0, 100),
              count: 0,
              elements: [],
            });
          }
          const entry = dataAttrMap.get(key);
          entry.count++;
          if (entry.elements.length < 3) {
            entry.elements.push({
              tag: el.tagName.toLowerCase(),
              text: isShortText ? text : text?.substring(0, 50) + '...',
              attrs: Array.from(el.attributes)
                .slice(0, 5)
                .map((a) => `${a.name}="${a.value.substring(0, 30)}"`)
                .join(' '),
            });
          }
        }
      }
    }
  });

  console.log(`\n  Found ${dataAttrMap.size} unique task-related attributes:`);
  const sortedAttrs = Array.from(dataAttrMap.values()).sort((a, b) => b.count - a.count);
  sortedAttrs.slice(0, 10).forEach((attr) => {
    console.log(`    • [${attr.count}x] ${attr.attribute}: "${attr.sampleValue}"`);
  });

  results.findings.dataAttributes = sortedAttrs;

  // ========================================================================
  // PHASE 3: SEARCH FOR TASKS.GOOGLE.COM URLs
  // ========================================================================
  console.log('\n🔗 PHASE 3: Searching for tasks.google.com URLs...');

  const urlFindings = {
    inAttributes: [],
    inIframes: [],
    inText: [],
  };

  // Search all attributes
  allElements.forEach((el) => {
    if (el.attributes) {
      for (const attr of el.attributes) {
        if (attr.value.includes('tasks.google.com')) {
          urlFindings.inAttributes.push({
            element: el.tagName.toLowerCase(),
            attribute: attr.name,
            url: attr.value,
            fragmentId: extractTaskIdFromUrl(attr.value),
          });
        }
      }
    }
  });

  // Check iframes specifically
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach((iframe, index) => {
    const src = iframe.src || '';
    urlFindings.inIframes.push({
      index,
      src,
      hasTasksUrl: src.includes('tasks.google.com'),
      fragmentId: extractTaskIdFromUrl(src),
      dimensions: {
        width: iframe.offsetWidth,
        height: iframe.offsetHeight,
      },
    });
  });

  console.log(`  📎 URLs in attributes: ${urlFindings.inAttributes.length}`);
  console.log(`  🖼️  Iframes: ${iframes.length} (${urlFindings.inIframes.filter((i) => i.hasTasksUrl).length} with tasks.google.com)`);

  if (urlFindings.inAttributes.length > 0) {
    console.log('\n  Sample URLs found:');
    urlFindings.inAttributes.slice(0, 3).forEach((finding) => {
      console.log(`    • <${finding.element} ${finding.attribute}="${finding.url.substring(0, 80)}...">`);
      if (finding.fragmentId) {
        console.log(`      Fragment ID: ${finding.fragmentId}`);
      }
    });
  }

  results.findings.urlFragments = urlFindings;

  // ========================================================================
  // PHASE 4: TEST SPECIFIC TASK ID (IF PROVIDED)
  // ========================================================================
  if (targetTaskId) {
    console.log(`\n🎯 PHASE 4: Testing specific task ID: "${targetTaskId}"`);

    const testResults = {
      foundByLegacySelector: false,
      foundByUrlFragment: false,
      foundByContent: false,
      matchingElements: [],
    };

    // Test 1: Legacy selectors
    const legacyMatches = document.querySelectorAll(
      `[data-eventid="tasks.${targetTaskId}"], [data-eventid="tasks_${targetTaskId}"], [data-taskid="${targetTaskId}"]`,
    );
    if (legacyMatches.length > 0) {
      testResults.foundByLegacySelector = true;
      testResults.matchingElements.push(...Array.from(legacyMatches));
      console.log(`  ✅ Found by legacy selector: ${legacyMatches.length} elements`);
    } else {
      console.log(`  ❌ Not found by legacy selector`);
    }

    // Test 2: URL fragment search
    const fragmentMatch = findElementByUrlFragment(targetTaskId);
    if (fragmentMatch) {
      testResults.foundByUrlFragment = true;
      testResults.matchingElements.push(fragmentMatch);
      console.log(`  ✅ Found by URL fragment`);
    } else {
      console.log(`  ❌ Not found by URL fragment`);
    }

    // Test 3: Search all attributes for the ID
    const attrMatches = findByAttributeValue(targetTaskId);
    if (attrMatches.length > 0) {
      console.log(`  ✅ Found in ${attrMatches.length} element attributes:`);
      attrMatches.slice(0, 3).forEach((match) => {
        console.log(`    • <${match.tag} ${match.attr}="${match.value.substring(0, 50)}...">`);
      });
      testResults.matchingElements.push(...attrMatches.map((m) => m.element));
    }

    results.testResults = testResults;
  }

  // ========================================================================
  // PHASE 5: ANALYZE CLASS PATTERNS
  // ========================================================================
  console.log('\n🎨 PHASE 5: Analyzing class patterns...');

  const classPatterns = new Map();
  const taskElements = [
    ...discoveries.legacyEventId,
    ...discoveries.taskListItems,
    ...discoveries.taskButtons,
    ...discoveries.anyTaskAttr,
  ];

  taskElements.forEach((el) => {
    if (el.className && typeof el.className === 'string') {
      el.className.split(/\s+/).forEach((cls) => {
        if (cls) {
          if (!classPatterns.has(cls)) {
            classPatterns.set(cls, { count: 0, sampleElements: [] });
          }
          const entry = classPatterns.get(cls);
          entry.count++;
          if (entry.sampleElements.length < 2) {
            entry.sampleElements.push({
              tag: el.tagName.toLowerCase(),
              text: el.textContent?.substring(0, 30),
            });
          }
        }
      });
    }
  });

  const topClasses = Array.from(classPatterns.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  console.log(`  Found ${classPatterns.size} unique classes on task elements. Top 15:`);
  topClasses.forEach(([cls, data]) => {
    console.log(`    • ${cls} (${data.count}x)`);
  });

  results.findings.classPatterns = topClasses.map(([cls, data]) => ({ class: cls, ...data }));

  // ========================================================================
  // PHASE 6: RECOMMENDATION ENGINE
  // ========================================================================
  console.log('\n💡 PHASE 6: Generating recommendation...');

  const recommendation = generateRecommendation(results);
  results.summary.recommendedApproach = recommendation;

  console.log('\n' + '='.repeat(80));
  console.log('📝 RECOMMENDATION:');
  console.log('='.repeat(80));
  console.log(recommendation.summary);
  console.log('\n📋 Implementation Strategy:');
  recommendation.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step}`);
  });

  if (recommendation.risks.length > 0) {
    console.log('\n⚠️  Potential Risks:');
    recommendation.risks.forEach((risk) => {
      console.log(`  • ${risk}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Exploration complete! Results saved to: window.__taskMappingResults');
  console.log('='.repeat(80));

  // Save results to window for further inspection
  window.__taskMappingResults = results;

  return results;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract task ID from tasks.google.com URL
 */
function extractTaskIdFromUrl(url) {
  try {
    // Pattern: https://tasks.google.com/embed/list/{listId}/task/{taskId}?...
    const match = url.match(/\/task\/([^?&#/]+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Find element by URL fragment
 */
function findElementByUrlFragment(fragmentId) {
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    if (el.attributes) {
      for (const attr of el.attributes) {
        if (attr.value.includes(fragmentId)) {
          return el;
        }
      }
    }
  }
  return null;
}

/**
 * Find elements by attribute value (partial match)
 */
function findByAttributeValue(searchValue) {
  const matches = [];
  const allElements = document.querySelectorAll('*');

  allElements.forEach((el) => {
    if (el.attributes) {
      for (const attr of el.attributes) {
        if (attr.value.includes(searchValue)) {
          matches.push({
            element: el,
            tag: el.tagName.toLowerCase(),
            attr: attr.name,
            value: attr.value,
          });
        }
      }
    }
  });

  return matches;
}

/**
 * Generate recommendation based on findings
 */
function generateRecommendation(results) {
  const { findings, summary } = results;

  // Check what methods worked
  const hasLegacySelectors = summary.identificationMethods.includes('legacyEventId');
  const hasUrlFragments = findings.urlFragments.inAttributes.length > 0 || findings.urlFragments.inIframes.length > 0;
  const hasDataAttributes = findings.dataAttributes.length > 0;
  const hasClassPatterns = findings.classPatterns.length > 0;

  let recommendation = {
    summary: '',
    approach: '',
    steps: [],
    risks: [],
  };

  if (hasLegacySelectors) {
    recommendation.summary = '✅ GOOD NEWS: Legacy selectors still work!';
    recommendation.approach = 'legacy';
    recommendation.steps = [
      'Continue using data-eventid="tasks.{taskId}" selectors',
      'Keep existing implementation',
      'Add monitoring to detect if Google changes this in the future',
    ];
    recommendation.risks = ['Google may remove these attributes in future updates'];
  } else if (hasUrlFragments) {
    recommendation.summary = '🔗 URL-BASED MAPPING: tasks.google.com URLs found in DOM';
    recommendation.approach = 'url-based';
    recommendation.steps = [
      'Store webViewLink from Tasks API when building mapping',
      'Extract task fragment ID from webViewLink',
      'Search DOM for matching fragment IDs in attributes/iframes',
      'Cache the mapping: fragmentId → taskId → element',
    ];
    recommendation.risks = [
      'URLs may be lazy-loaded (not present until task is clicked)',
      'May need to trigger task modal/sidebar to expose URLs',
    ];
  } else if (hasDataAttributes) {
    recommendation.summary = '🔍 ATTRIBUTE-BASED MAPPING: Found task-related data attributes';
    recommendation.approach = 'attribute-based';
    recommendation.steps = [
      'Identify the most stable data attribute from findings',
      'Create a correlation table between API data and attribute values',
      'May need to use heuristics (title + date matching)',
    ];
    recommendation.risks = [
      'Attributes may not contain stable IDs',
      'May require content-based matching (less reliable)',
    ];
  } else if (hasClassPatterns) {
    recommendation.summary = '🎨 CLASS-BASED IDENTIFICATION: Using CSS classes and position';
    recommendation.approach = 'heuristic';
    recommendation.steps = [
      'Identify task elements by common class patterns',
      'Match by content: task title + due date + position',
      'Build correlation based on multiple signals',
      'Cache successful matches to improve accuracy',
    ];
    recommendation.risks = [
      'Content-based matching is fragile',
      'Title changes break matching',
      'Poor reliability with similar task names',
    ];
  } else {
    recommendation.summary = '❌ NO RELIABLE MAPPING FOUND';
    recommendation.approach = 'manual-testing-needed';
    recommendation.steps = [
      'Manually inspect a visible task in Elements tab',
      'Note any unique identifiers or patterns',
      'Re-run this script with targetTaskId parameter',
      'Consider alternative approaches (e.g., MutationObserver on task creation)',
    ];
    recommendation.risks = ['Current implementation is likely broken', 'May need significant refactoring'];
  }

  return recommendation;
}

// ============================================================================
// ADDITIONAL DIAGNOSTIC TOOLS
// ============================================================================

/**
 * Interactive task inspector - click on a task to see its properties
 */
window.inspectTaskOnClick = function () {
  console.log('👆 Click on any task element to inspect it...');

  const clickHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    console.log('\n🎯 CLICKED ELEMENT:', el);
    console.log('Tag:', el.tagName);
    console.log('Classes:', el.className);
    console.log('Text:', el.textContent?.substring(0, 100));
    console.log('\nAll attributes:');
    if (el.attributes) {
      for (const attr of el.attributes) {
        console.log(`  ${attr.name} = "${attr.value}"`);
      }
    }

    console.log('\nParent chain:');
    let current = el;
    let depth = 0;
    while (current && depth < 5) {
      console.log(`  ${'  '.repeat(depth)}↑ <${current.tagName.toLowerCase()}${current.id ? ` id="${current.id}"` : ''}${current.className ? ` class="${current.className}"` : ''}>`);
      current = current.parentElement;
      depth++;
    }

    // Clean up
    document.removeEventListener('click', clickHandler, true);
    console.log('\n✅ Inspection complete. Run inspectTaskOnClick() again to inspect another element.');
  };

  document.addEventListener('click', clickHandler, true);
};

/**
 * Export results as JSON for sharing
 */
window.exportTaskMappingResults = function () {
  const results = window.__taskMappingResults;
  if (!results) {
    console.error('❌ No results to export. Run exploreTaskMapping() first.');
    return;
  }

  const json = JSON.stringify(results, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `task-mapping-results-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  console.log('✅ Results exported!');
};

// Make main function available globally
window.exploreTaskMapping = exploreTaskMapping;

console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                   TASK MAPPING EXPLORER LOADED                             ║
║                                                                            ║
║  Run: await exploreTaskMapping()                                          ║
║                                                                            ║
║  Optional: await exploreTaskMapping({ targetTaskId: 'your-task-id' })    ║
║                                                                            ║
║  Interactive: inspectTaskOnClick() - then click on a task                ║
║                                                                            ║
║  Export: exportTaskMappingResults()                                       ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
