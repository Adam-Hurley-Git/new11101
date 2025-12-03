# Diagnostic Scripts - Quick Usage Guide

## ✅ Fixed & Ready to Use

Both scripts have been fixed and validated:
- ✅ No syntax errors
- ✅ Proper function declarations
- ✅ Functions exported to `window` object
- ✅ Welcome messages display on load
- ✅ Tested with Node.js syntax checker

---

## Quick Start

### Option 1: Use on Google Calendar (RECOMMENDED)

1. **Open Google Calendar**
   ```
   https://calendar.google.com
   ```

2. **Ensure tasks are visible**
   - Switch to week or day view
   - Create 2-3 test tasks if needed

3. **Open DevTools Console**
   - Press `F12` or `Cmd+Option+J` (Mac) / `Ctrl+Shift+J` (Windows)

4. **Copy & Paste Script**

   **For Quick Check:**
   ```javascript
   // Copy/paste entire contents of: diagnostics/quick-task-inspector.js
   // Then run:
   quickInspect()
   ```

   **For Deep Analysis:**
   ```javascript
   // Copy/paste entire contents of: diagnostics/task-mapping-explorer.js
   // Then run:
   await exploreTaskMapping()
   ```

### Option 2: Test Locally First

1. **Open Test Page**
   ```bash
   # In your browser, open:
   file:///path/to/new11101/diagnostics/test-scripts.html
   ```

2. **Click Test Buttons**
   - Test Quick Inspector
   - Test Mapping Explorer
   - Check console for output

3. **Verify**
   - Both scripts should load without errors
   - Mock task elements should be detected
   - Functions should be available

---

## Script 1: quick-task-inspector.js

### What It Does
- 5-phase diagnostic (runs in ~5 seconds)
- Tests legacy selectors
- Searches for URLs
- Scans attributes
- Provides recommendation

### How to Use

```javascript
// 1. Copy/paste the entire file into console
// You'll see:
// ╔════════════════════════════════════════════════════════════╗
// ║            QUICK TASK INSPECTOR LOADED                     ║
// ╚════════════════════════════════════════════════════════════╝

// 2. Run the inspector
quickInspect()

// 3. Read the output - it will show:
// - ✅ or ❌ for each test
// - Recommendation for what to do next
// - Sample task IDs found (if any)

// 4. Optional: Interactive mode
clickToInspect()
// Then click on any task element to see its details
```

### Expected Output

```
🔍 QUICK TASK INSPECTOR
============================================================

1️⃣ Testing LEGACY selectors (old approach)...
   data-eventid: 5 elements ✅
   data-taskid:  0 elements ❌
   .GTG3wb:      5 elements ✅

   ✅ GOOD NEWS: Legacy approach still works!
   Sample task IDs found:
     • abc123
     • def456
     • ghi789

... [continues with other phases] ...

📋 RECOMMENDATION:
============================================================
✅ STATUS: Current implementation should work
   → Legacy data-eventid selectors are present
   → No changes needed immediately
```

---

## Script 2: task-mapping-explorer.js

### What It Does
- 6-phase deep analysis (runs in ~30 seconds)
- Comprehensive element discovery
- Detailed attribute analysis
- Tests specific task IDs
- Exports results as JSON

### How to Use

```javascript
// 1. Copy/paste the entire file into console
// You'll see:
// ╔════════════════════════════════════════════════════════════╗
// ║          TASK MAPPING EXPLORER LOADED                      ║
// ╚════════════════════════════════════════════════════════════╝

// 2. Basic run
await exploreTaskMapping()

// 3. Test specific task (get ID from extension first)
await exploreTaskMapping({
  targetTaskId: 'abc123'  // Your task ID
})

// 4. Less verbose
await exploreTaskMapping({ verbose: false })

// 5. Export results
exportTaskMappingResults()
// Downloads: task-mapping-results-2025-12-03.json

// 6. Interactive inspector
inspectTaskOnClick()
// Then click on any element to inspect it
```

### Expected Output

```
🔍 CALENDAR TASK MAPPING EXPLORER
================================================================================

📋 PHASE 1: Discovering task elements...
  ✅ legacyEventId: 5 elements
  ✅ legacyTaskButton: 5 elements
  ...

🔬 PHASE 2: Analyzing data attributes...
  Found 23 unique task-related attributes:
    • [5x] data-eventid: "tasks.abc..."
    ...

... [continues through all 6 phases] ...

💡 PHASE 6: Generating recommendation...
================================================================================
📝 RECOMMENDATION:
================================================================================
✅ GOOD NEWS: Legacy selectors still work!

📋 Implementation Strategy:
  1. Continue using data-eventid="tasks.{taskId}" selectors
  2. Keep existing implementation
  3. Add monitoring to detect if Google changes this in the future
```

---

## Troubleshooting

### "Function not defined"
**Problem:** `quickInspect is not defined`

**Solution:**
1. Make sure you copied the ENTIRE file (scroll to bottom)
2. Look for the welcome banner after pasting
3. Try pasting in a fresh console (F5 to reload page, then paste again)

### "No elements found"
**Problem:** All tests show `0 elements ❌`

**Solution:**
1. Make sure you're on calendar.google.com (not tasks.google.com)
2. Ensure tasks are visible in the calendar view
3. Switch to week or day view (not month view)
4. Create a test task and refresh the page

### "Syntax error"
**Problem:** Red error in console after pasting

**Solution:**
1. Download the file from the repository
2. Open in a text editor
3. Select All (Ctrl+A / Cmd+A)
4. Copy
5. Paste into console
6. If still fails, report the specific error message

### "Script loads but nothing happens"
**Problem:** No output after running `quickInspect()`

**Solution:**
1. Check if console is filtered (look for filter buttons at top)
2. Clear console (`console.clear()`)
3. Run again
4. Try: `await quickInspect()` (with await keyword)

---

## What Each Script Checks

### Quick Inspector (5 phases):

1. **Legacy Selectors**
   - `[data-eventid^="tasks."]`
   - `[data-eventid^="tasks_"]`
   - `[data-taskid]`
   - `.GTG3wb`

2. **URLs**
   - Any attribute containing `tasks.google.com`
   - Extract task fragment IDs from URLs

3. **Iframes**
   - Count total iframes
   - Filter for tasks.google.com sources

4. **Task Attributes**
   - Scan all elements
   - Find `data-*` attributes with "task" or "event"

5. **Recommendation**
   - Analyzes all findings
   - Suggests next steps

### Mapping Explorer (6 phases):

1. **Element Discovery**
   - Tests 8 different selector strategies
   - Counts all task-like elements

2. **Attribute Analysis**
   - Deep scan of ALL attributes
   - Groups by frequency
   - Shows sample elements

3. **URL Analysis**
   - Searches attributes for tasks.google.com
   - Checks iframe sources
   - Extracts fragment IDs

4. **Specific Task Test** (optional)
   - Tests if a known task ID can be found
   - Tries multiple methods

5. **Class Analysis**
   - Lists all classes on task elements
   - Sorted by frequency

6. **Recommendation Engine**
   - Generates implementation strategy
   - Provides code examples
   - Lists potential risks

---

## Success Criteria

### ✅ Scripts Working Correctly

- [ ] Script loads without syntax errors
- [ ] Welcome banner displays
- [ ] Functions are available: `quickInspect()`, `exploreTaskMapping()`
- [ ] Running functions produces output
- [ ] Output includes phase headers (1️⃣, 2️⃣, etc.)
- [ ] Recommendation section appears at the end
- [ ] Results are returned (check return value)

### ✅ Calendar Integration Working

- [ ] Legacy selectors show `> 0 elements ✅`
- [ ] Sample task IDs are displayed
- [ ] Recommendation is positive (✅ STATUS)
- [ ] No errors in console

### ❌ Calendar Integration Broken

- [ ] All selectors show `0 elements ❌`
- [ ] No task IDs found
- [ ] Recommendation suggests new approach
- [ ] See implementation guide for next steps

---

## Getting Task IDs for Testing

If you want to test with a specific task:

1. **Open Extension Background Console**
   - Go to `chrome://extensions`
   - Find ColorKit extension
   - Click "service worker" or "background page"

2. **Get Task IDs**
   ```javascript
   const data = await chrome.storage.local.get('cf.taskToListMap');
   const taskIds = Object.keys(data['cf.taskToListMap'] || {});
   console.log('Task IDs:', taskIds);
   // Copy one of these IDs
   ```

3. **Switch to Calendar Console**
   - Open calendar.google.com
   - Open console (F12)

4. **Test with Task ID**
   ```javascript
   await exploreTaskMapping({
     targetTaskId: 'PASTE_TASK_ID_HERE'
   })
   ```

---

## Next Steps After Testing

Based on the recommendation you get:

### ✅ "Legacy selectors still work"
→ No code changes needed
→ Add monitoring for future changes
→ Update CLAUDE.md to confirm selectors work

### 🔗 "Need webViewLink mapping"
→ See `/docs/TASK_MAPPING_INVESTIGATION.md` - Scenario B
→ Implement fragment ID matching
→ Update API to store webViewLink

### 🔍 "Need attribute-based mapping"
→ See `/docs/TASK_MAPPING_INVESTIGATION.md` - Scenario C
→ Update selectors to use discovered attributes

### ❌ "No obvious mapping found"
→ See `/docs/TASK_MAPPING_INVESTIGATION.md` - Scenario D
→ May need heuristic matching (title + date)

---

## Additional Resources

- **Full Investigation Guide**: `/docs/TASK_MAPPING_INVESTIGATION.md`
- **Diagnostics README**: `/diagnostics/README.md`
- **Main Documentation**: `/CLAUDE.md` (see "Known Issues" section)

---

**Last Updated**: December 3, 2025
**Status**: ✅ Scripts validated and ready for testing
