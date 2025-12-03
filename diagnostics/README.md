# Diagnostics Tools

This folder contains diagnostic and investigation tools for ColorKit development and debugging.

---

## Task Mapping Investigation Tools

### Problem Context
Google rewrote the Calendar UI in late 2025, potentially breaking how we map tasks from the Google Tasks API to DOM elements in Calendar.

### Tools Overview

| Tool | Purpose | Use Case | Time |
|------|---------|----------|------|
| **quick-task-inspector.js** | Fast 5-phase check | Quick health check | ~5 sec |
| **task-mapping-explorer.js** | Deep 6-phase analysis | Comprehensive investigation | ~30 sec |
| **TASK_MAPPING_INVESTIGATION.md** | Documentation | Understanding results | - |

---

## 1. Quick Task Inspector

**File**: `quick-task-inspector.js`
**Best for**: Quick status check, first-time testing

### Features:
- ✅ Tests legacy selectors (data-eventid, etc.)
- 🔗 Searches for tasks.google.com URLs
- 🖼️ Checks iframes
- 🔍 Scans for task-related attributes
- 📋 Provides immediate recommendation
- 👆 Interactive click-to-inspect mode

### Usage:

1. Open **Google Calendar** (calendar.google.com)
2. Make sure **tasks are visible** (week/day view)
3. Open **DevTools Console** (F12)
4. Copy/paste the **entire file** into console
5. Run:
   ```javascript
   quickInspect()
   ```

### Output Example:
```
🔍 QUICK TASK INSPECTOR
============================================================

1️⃣ Testing LEGACY selectors (old approach)...
   data-eventid: 12 elements ✅
   data-taskid:  0 elements ❌
   .GTG3wb:      12 elements ✅

2️⃣ Searching for tasks.google.com URLs...
   Found 3 URLs ✅
   Sample URLs:
     • <a href="...">
       Fragment: ABC-DEF-GHI

... [continues with phases 3-5] ...

============================================================
📋 RECOMMENDATION:
============================================================
✅ STATUS: Current implementation should work
   → Legacy data-eventid selectors are present
   → No changes needed immediately
   → Monitor for future Google updates
```

### Interactive Mode:
After running `quickInspect()`, use:
```javascript
clickToInspect()
```
Then click on any task element to see its full details.

---

## 2. Task Mapping Explorer

**File**: `task-mapping-explorer.js`
**Best for**: Deep investigation, debugging specific tasks

### Features:
- 📋 Discovers all task-like elements (multiple strategies)
- 🔬 Analyzes ALL data attributes in detail
- 🔗 Deep URL fragment analysis
- 🎯 Tests specific task IDs
- 🎨 Class pattern analysis
- 💡 Generates implementation recommendation
- 📊 Exportable JSON results

### Usage:

1. Open **Google Calendar** (calendar.google.com)
2. Ensure **tasks are visible**
3. Open **DevTools Console** (F12)
4. Copy/paste the **entire file** into console
5. Run basic exploration:
   ```javascript
   await exploreTaskMapping()
   ```

### Advanced Usage:

**Test a specific task ID**:
```javascript
// Get a task ID from your extension first:
// 1. Open extension background console
// 2. Run: const data = await chrome.storage.local.get('cf.taskToListMap')
// 3. Copy one task ID from: Object.keys(data['cf.taskToListMap'])

await exploreTaskMapping({
  targetTaskId: '-XUC4eZoHvOlG4g4'  // Your actual task ID
})
```

**Less verbose output**:
```javascript
await exploreTaskMapping({ verbose: false })
```

### Output Structure:
```
🔍 CALENDAR TASK MAPPING EXPLORER
================================================================================

📋 PHASE 1: Discovering task elements...
  ✅ legacyEventId: 12 elements
  ❌ legacyTaskId: 0 elements
  ...

🔬 PHASE 2: Analyzing data attributes...
  Found 43 unique task-related attributes:
    • [12x] data-eventid: "tasks.abc..."
    ...

🔗 PHASE 3: Searching for tasks.google.com URLs...
  📎 URLs in attributes: 5
  🖼️  Iframes: 1 (1 with tasks.google.com)
  ...

🎯 PHASE 4: Testing specific task ID: "..."
  ✅ Found by legacy selector: 1 elements
  ...

🎨 PHASE 5: Analyzing class patterns...
  Found 89 unique classes on task elements. Top 15:
    • GTG3wb (12x)
    ...

💡 PHASE 6: Generating recommendation...
================================================================================
📝 RECOMMENDATION:
================================================================================
✅ GOOD NEWS: Legacy selectors still work!

📋 Implementation Strategy:
  1. Continue using data-eventid="tasks.{taskId}" selectors
  2. Keep existing implementation
  3. Add monitoring to detect if Google changes this in the future

⚠️  Potential Risks:
  • Google may remove these attributes in future updates
```

### Exporting Results:
After running exploration:
```javascript
exportTaskMappingResults()
```
Downloads: `task-mapping-results-2025-12-03.json`

### Accessing Results:
```javascript
// Results are saved to window object:
const results = window.__taskMappingResults;

// Access specific findings:
console.log(results.findings.dataAttributes);
console.log(results.findings.urlFragments);
console.log(results.summary.recommendedApproach);
```

---

## 3. Investigation Guide

**File**: `/docs/TASK_MAPPING_INVESTIGATION.md`
**Best for**: Understanding results, implementing solutions

### Contents:
- Problem summary and context
- How to use the diagnostic tools
- Interpreting output from each phase
- **4 Implementation Scenarios**:
  - **Scenario A**: Legacy selectors work ✅
  - **Scenario B**: URL-based mapping 🔗
  - **Scenario C**: Attribute-based 🔍
  - **Scenario D**: Heuristic matching 🎨
- Code examples for each scenario
- Verification checklist
- Reporting guidelines

---

## Quick Start Guide

### First Time Investigation:

```bash
# 1. Quick health check
Copy/paste: diagnostics/quick-task-inspector.js
Run: quickInspect()

# If issues found:

# 2. Deep investigation
Copy/paste: diagnostics/task-mapping-explorer.js
Run: await exploreTaskMapping()

# 3. Export results
Run: exportTaskMappingResults()

# 4. Read implementation guide
Open: docs/TASK_MAPPING_INVESTIGATION.md
```

### Testing Specific Task:

```bash
# 1. Get a task ID from extension
# (Open background console)
const data = await chrome.storage.local.get('cf.taskToListMap')
console.log(Object.keys(data['cf.taskToListMap'])[0])

# 2. Test that task ID
# (Switch to calendar.google.com console)
await exploreTaskMapping({
  targetTaskId: 'PASTE_TASK_ID_HERE'
})

# 3. Check if it was found
# Look for "PHASE 4" output
```

---

## Common Scenarios & Solutions

### ✅ Scenario: Everything Works
```
Output: "✅ STATUS: Current implementation should work"
Action: No changes needed, keep monitoring
```

### 🔗 Scenario: URLs Found
```
Output: "🔗 STATUS: Need to implement webViewLink mapping"
Action: See TASK_MAPPING_INVESTIGATION.md → Scenario B
Next: Update API to store webViewLink, implement fragment matching
```

### 🔍 Scenario: New Attributes Found
```
Output: "🔍 STATUS: Need to identify stable attributes"
Action: See TASK_MAPPING_INVESTIGATION.md → Scenario C
Next: Test attribute stability, update selectors
```

### ❌ Scenario: Nothing Found
```
Output: "❌ STATUS: No obvious mapping found"
Action: See TASK_MAPPING_INVESTIGATION.md → Scenario D
Next: Manual investigation, may need heuristic matching
```

---

## Troubleshooting

### "No tasks visible"
- Switch to week or day view
- Create a few test tasks first
- Refresh the calendar page

### "Script not loading"
- Make sure you copied the ENTIRE file
- Check for console errors
- Try in an incognito window

### "Function not defined"
- The script must be run directly in the calendar.google.com console
- Cannot be run from the extension's console
- Make sure the script fully executed (check for welcome banner)

### "No results"
- Make sure tasks are actually showing in the calendar
- Try clicking on a task to open it, then re-run
- Some task elements may be lazy-loaded

---

## File Descriptions

### diagnostics.html / diagnostics.js
Legacy diagnostic page for extension debugging (general purpose).

### task-mapping-explorer.js
**Size**: ~650 lines
**Purpose**: Comprehensive task mapping investigation
**Dependencies**: None (standalone)
**Output**: Console logs + `window.__taskMappingResults` object

### quick-task-inspector.js
**Size**: ~250 lines
**Purpose**: Fast diagnostic for quick checks
**Dependencies**: None (standalone)
**Output**: Console logs + `window.clickToInspect()` function

---

## Contributing

If you discover new patterns or better approaches:

1. Run the exploration tools
2. Export results: `exportTaskMappingResults()`
3. Document your findings
4. Update `TASK_MAPPING_INVESTIGATION.md` with new scenarios
5. Update `CLAUDE.md` if implementation changes

---

## Additional Resources

- **CLAUDE.md**: Full codebase reference (see "Known Issues" section)
- **TASK_MAPPING_INVESTIGATION.md**: Complete investigation guide
- **features/tasks-coloring/index.js**: Current task mapping implementation
- **lib/google-tasks-api.js**: Tasks API integration

---

**Last Updated**: December 3, 2025
**Status**: Investigation tools ready for testing
