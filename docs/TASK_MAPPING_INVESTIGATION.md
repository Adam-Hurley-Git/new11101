# Task Mapping Investigation Guide

**Date**: December 3, 2025
**Issue**: Google has rewritten the Calendar UI, breaking task-to-DOM mapping
**Status**: 🔍 Investigation Phase

---

## Problem Summary

ColorKit extension needs to map tasks from the **Google Tasks API** to task elements in the **Google Calendar DOM** to apply colors.

### What Changed:
- Google completely rewrote the Calendar UI
- Old selectors (`data-eventid="tasks.{taskId}"`) may no longer work
- Need to find a new stable way to correlate API data with DOM elements

### What We Have:

**From Google Tasks API** (`lib/google-tasks-api.js`):
- `id` - Task ID (e.g., `-XUC4eZoHvOlG4g4`)
- `title` - Task name
- `updated` - Last update timestamp
- `status` - "completed" or "needsAction"
- `due` - Due date (if set)
- **NEW**: `webViewLink` - URL like `https://tasks.google.com/embed/list/{listId}/task/{taskFragmentId}`

**In Calendar DOM** (old approach):
- `data-eventid="tasks.{taskId}"` - Used to extract task ID
- `.GTG3wb` - Task button class
- Visual elements (text content, position)

---

## Investigation Tool

### `/diagnostics/task-mapping-explorer.js`

A comprehensive diagnostic tool that runs in the browser console to discover how tasks are represented in the new Calendar UI.

### How to Use:

1. **Open Google Calendar** in Chrome
   ```
   https://calendar.google.com
   ```

2. **Ensure tasks are visible**
   - Switch to week or day view
   - Make sure you have at least 3-5 tasks showing
   - If needed, create a few test tasks first

3. **Open DevTools Console**
   - Press `F12` or `Cmd+Option+J` (Mac) / `Ctrl+Shift+J` (Windows)
   - Navigate to the **Console** tab

4. **Load the explorer script**
   - Copy the entire contents of `/diagnostics/task-mapping-explorer.js`
   - Paste into console and press Enter
   - You should see a welcome banner

5. **Run the basic exploration**
   ```javascript
   await exploreTaskMapping()
   ```

6. **Review the output**
   - The script will log findings in 6 phases
   - Results are saved to `window.__taskMappingResults`

---

## Understanding the Output

### Phase 1: Element Discovery
**What it does**: Searches for task elements using various selectors

**What to look for**:
- ✅ Green checkmarks = method found elements
- ❌ Red X's = method found nothing

**Key finding**: If `legacyEventId` or `legacyTaskId` shows ✅, the old approach still works!

### Phase 2: Data Attributes
**What it does**: Scans all elements for task-related `data-*` attributes

**What to look for**:
- Attributes containing "task", "event", or "tasks.google.com"
- High counts = common pattern (more stable)
- Sample values showing IDs or identifiers

**Example good finding**:
```
• [12x] data-task-identifier: "abc123..."
```

### Phase 3: URL Fragments
**What it does**: Searches for `tasks.google.com` URLs in the DOM

**What to look for**:
- URLs in attributes (links, iframes, etc.)
- Task fragment IDs extracted from URLs
- iframe sources containing tasks

**Example good finding**:
```
📎 URLs in attributes: 5
Sample URLs found:
  • <a href="https://tasks.google.com/embed/list/xxx/task/ABC-DEF-GHI?...">
    Fragment ID: ABC-DEF-GHI
```

**This is the GOLD scenario** - means we can use `webViewLink` from API!

### Phase 4: Specific Task Test (Optional)
**What it does**: Tests if a specific task ID can be found

**How to use**:
1. Get a task ID from the extension:
   ```javascript
   // In the extension's background script console
   const data = await chrome.storage.local.get('cf.taskToListMap');
   console.log('Task IDs:', Object.keys(data['cf.taskToListMap']));
   ```

2. Pick one task ID (e.g., `-XUC4eZoHvOlG4g4`)

3. Run:
   ```javascript
   await exploreTaskMapping({
     targetTaskId: '-XUC4eZoHvOlG4g4'
   })
   ```

**What to look for**:
- ✅ Found by legacy selector = old approach works
- ✅ Found by URL fragment = webViewLink approach works
- ✅ Found in attributes = specific attribute contains ID

### Phase 5: Class Patterns
**What it does**: Analyzes CSS classes on task elements

**What to look for**:
- Common classes across task elements
- Classes that might indicate task type/state

**Use case**: If no stable IDs exist, we may need class + content matching

### Phase 6: Recommendation
**What it does**: Analyzes all findings and recommends an approach

**Possible outcomes**:

1. **✅ Legacy selectors work** → Keep current implementation
2. **🔗 URL-based mapping** → Use webViewLink from API
3. **🔍 Attribute-based** → Use discovered data attributes
4. **🎨 Heuristic matching** → Match by title + date + position
5. **❌ Manual investigation needed** → No clear pattern found

---

## Next Steps Based on Findings

### Scenario A: Legacy Selectors Still Work ✅
**Action**: Minimal changes needed

1. Verify selectors are stable:
   ```javascript
   // Test on multiple dates/views
   document.querySelectorAll('[data-eventid^="tasks."]').length
   ```

2. Add monitoring:
   ```javascript
   // Log warning if selectors stop working
   if (tasksFound === 0 && previouslyFoundTasks) {
     console.warn('[ColorKit] Task selectors may have changed');
   }
   ```

3. Keep current implementation, add fallback for future

---

### Scenario B: URL-Based Mapping Works 🔗
**Action**: Implement webViewLink correlation

#### Step 1: Modify API fetching to store webViewLink

**File**: `lib/google-tasks-api.js`

**In `buildTaskToListMapping()` function** (around line 346):
```javascript
tasks.forEach((task) => {
  // ... existing code ...

  // NEW: Store webViewLink fragment
  if (task.webViewLink) {
    const fragmentId = extractTaskFragmentFromUrl(task.webViewLink);
    if (fragmentId) {
      // Store both: decoded ID → listId AND fragment → decoded ID
      mapping[idToStore] = {
        listId: list.id,
        fragmentId: fragmentId  // NEW
      };
    }
  } else {
    mapping[idToStore] = { listId: list.id };
  }
});
```

**Add helper function**:
```javascript
/**
 * Extract task fragment ID from webViewLink
 * @param {string} url - webViewLink from API
 * @returns {string|null} - Fragment ID (e.g., "ABC-DEF-GHI")
 */
function extractTaskFragmentFromUrl(url) {
  try {
    // Pattern: https://tasks.google.com/embed/list/{listId}/task/{fragmentId}?...
    const match = url.match(/\/task\/([^?&#/]+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}
```

#### Step 2: Update DOM search to use fragment IDs

**File**: `features/tasks-coloring/index.js`

**Replace `findTaskElementOnCalendarGrid()` function** (around line 59):
```javascript
async function findTaskElementOnCalendarGrid(taskId) {
  // Try legacy selector first (fast path)
  const legacyEl = document.querySelector(
    `[data-eventid="tasks.${taskId}"], [data-eventid="tasks_${taskId}"]`
  );
  if (legacyEl && !legacyEl.closest('[role="dialog"]')) {
    return legacyEl;
  }

  // NEW: Try fragment-based search
  const cache = await refreshColorCache();
  const taskMapping = cache.taskToListMap[taskId];

  if (taskMapping?.fragmentId) {
    const fragmentEl = findElementByFragmentId(taskMapping.fragmentId);
    if (fragmentEl) {
      return fragmentEl;
    }
  }

  // Fallback: Content-based search
  return null;
}

/**
 * Find element by URL fragment ID
 */
function findElementByFragmentId(fragmentId) {
  // Search all attributes for the fragment
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    if (el.closest('[role="dialog"]')) continue;  // Skip modals

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
```

#### Step 3: Test thoroughly
- Create new tasks
- Move tasks between dates
- Complete/uncomplete tasks
- Verify colors persist across navigation

---

### Scenario C: Attribute-Based Mapping 🔍
**Action**: Use discovered data attributes

1. **Identify the stable attribute** from Phase 2 results
   - Look for high-count attributes with unique values
   - Test stability across dates/views

2. **Update selectors** in `features/tasks-coloring/index.js`
   ```javascript
   // Replace old selector with discovered one
   const taskElements = document.querySelectorAll('[data-new-attribute-name]');
   ```

3. **Build correlation table**
   - Map attribute values → task IDs
   - Store in cache for quick lookup

---

### Scenario D: Heuristic Matching 🎨
**Action**: Match by content + position (last resort)

**Warning**: This is the least reliable approach. Only use if no stable IDs exist.

#### Implementation:

**File**: `features/tasks-coloring/index.js`

```javascript
/**
 * Find task by heuristic matching (title + date + position)
 */
async function findTaskByHeuristic(taskId) {
  // 1. Get task metadata from API
  const taskMeta = await getTaskMetadata(taskId);
  if (!taskMeta) return null;

  // 2. Find all potential task elements
  const candidates = document.querySelectorAll('.task-element-class');  // Use discovered class

  // 3. Score each candidate
  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = 0;
    const text = candidate.textContent?.toLowerCase() || '';

    // Title match (50 points)
    if (text.includes(taskMeta.title.toLowerCase())) {
      score += 50;
    }

    // Date proximity (30 points)
    const candidateDate = extractDateFromElement(candidate);
    if (candidateDate && isSameDay(candidateDate, taskMeta.due)) {
      score += 30;
    }

    // Position/order (20 points)
    const position = getElementPosition(candidate);
    if (isReasonablePosition(position, taskMeta)) {
      score += 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // Only return if confidence is high (>70%)
  return bestScore > 70 ? bestMatch : null;
}
```

**Trade-offs**:
- ❌ Breaks when title changes
- ❌ Unreliable with similar task names
- ❌ Poor performance with many tasks
- ✅ Works as fallback when nothing else works

---

## Interactive Testing Tools

### 1. Click Inspector
Inspect individual task elements interactively:

```javascript
inspectTaskOnClick()
```

Then click on any task in the Calendar. The console will show:
- Element tag and classes
- All attributes
- Parent chain (hierarchy)

### 2. Export Results
Save findings to a JSON file for sharing:

```javascript
exportTaskMappingResults()
```

This downloads `task-mapping-results-{date}.json` with all findings.

---

## Verification Checklist

After implementing a solution, verify it works:

- [ ] New tasks colored immediately (<2 seconds)
- [ ] Colors persist after page refresh
- [ ] Colors survive calendar navigation (week/day/month view changes)
- [ ] Moving tasks between dates preserves colors
- [ ] Completing tasks maintains colors (if completed styling enabled)
- [ ] Works across multiple task lists
- [ ] No console errors
- [ ] Performance acceptable (no lag when scrolling)

---

## Reporting Findings

If you run the investigation script, please report:

1. **Run the script** on calendar.google.com:
   ```javascript
   await exploreTaskMapping()
   ```

2. **Note the recommendation** (Phase 6 output)

3. **Share key findings**:
   - Which phase(s) showed ✅ green checkmarks?
   - Any URLs found? (Phase 3)
   - Legacy selectors working? (Phase 1)
   - Any stable data attributes? (Phase 2)

4. **Export results**:
   ```javascript
   exportTaskMappingResults()
   ```

5. **Test with specific task**:
   - Get a task ID from your extension
   - Run: `await exploreTaskMapping({ targetTaskId: 'your-id' })`
   - Report which method(s) found it

---

## Additional Resources

- **Google Tasks API Docs**: https://developers.google.com/tasks/reference/rest
- **Tasks API Response Fields**: Includes `webViewLink` - we should use this!
- **Chrome DevTools Guide**: https://developer.chrome.com/docs/devtools/

---

## Quick Reference: API Response Structure

```json
{
  "kind": "tasks#task",
  "id": "base64-encoded-id",
  "etag": "...",
  "title": "Task name",
  "updated": "2025-12-03T10:00:00.000Z",
  "selfLink": "https://www.googleapis.com/tasks/v1/lists/{listId}/tasks/{taskId}",
  "parent": null,
  "position": "00000000000000000001",
  "notes": "Task description",
  "status": "needsAction",
  "due": "2025-12-10T00:00:00.000Z",
  "completed": null,
  "deleted": false,
  "hidden": false,
  "links": [],
  "webViewLink": "https://tasks.google.com/embed/list/{listId}/task/{fragmentId}?hl=en&utm_source=..."
}
```

**KEY FIELD**: `webViewLink` - This contains a fragment ID we can search for in the DOM!

---

## Status Tracking

| Phase | Status | Date | Notes |
|-------|--------|------|-------|
| Investigation script created | ✅ | 2025-12-03 | Tool ready for testing |
| DOM structure analysis | ⏳ | - | Needs manual testing on calendar.google.com |
| Findings documented | ⏳ | - | Waiting for test results |
| Solution implemented | ⏳ | - | Depends on findings |
| Testing & verification | ⏳ | - | - |

---

**Next Action**: Run the exploration script on calendar.google.com and report findings!
