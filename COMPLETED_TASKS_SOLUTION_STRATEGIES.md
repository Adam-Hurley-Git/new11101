# Completed Tasks Solution Strategies

Based on our research, here are the potential solution approaches for each scenario.

---

## Strategy 1: If Google Calendar Hides Completed Tasks

### Problem
Google Calendar doesn't render completed tasks in the calendar grid view by default. Our extension can't color elements that don't exist in the DOM.

### Solutions

#### Option A: Programmatically Show Completed Tasks
**Approach**: Find and manipulate Google Calendar's UI settings to force display of completed tasks

**Steps:**
1. Research Google Calendar's DOM for settings controls
2. Find the checkbox/toggle that shows completed tasks
3. Programmatically enable it when our extension loads
4. Monitor for changes and re-enable if user toggles it off

**Pros:**
- Makes completed tasks visible automatically
- User doesn't need to manually change settings
- Works seamlessly

**Cons:**
- Brittle - relies on Google's UI structure
- May conflict with user's preferences
- Could break if Google changes their UI

**Code example:**
```javascript
function enableCompletedTasksDisplay() {
  // Find the setting element (selector TBD)
  const showCompletedToggle = document.querySelector('[aria-label*="completed tasks"]');
  if (showCompletedToggle && !showCompletedToggle.checked) {
    showCompletedToggle.click();
    console.log('[ColorKit] Enabled display of completed tasks');
  }
}
```

#### Option B: Document the Limitation
**Approach**: Accept that completed tasks aren't visible and document this clearly

**Steps:**
1. Add clear documentation to user guide
2. Add tooltip in UI: "Completed tasks only visible in [X] view"
3. Provide instructions for how to enable in Google Calendar settings

**Pros:**
- Honest and transparent
- No brittle code
- Respects user's Google Calendar settings

**Cons:**
- Users need to manually enable setting
- May cause confusion
- Reduced functionality

#### Option C: Alternative Display Method
**Approach**: Create our own completed tasks display (e.g., overlay panel)

**Steps:**
1. Fetch completed tasks from Google Tasks API
2. Render them in a custom overlay/panel on the calendar
3. Apply our custom styling to this display

**Pros:**
- Complete control over display
- Can show tasks even if Google hides them
- Can add additional features

**Cons:**
- Complex implementation
- May feel disconnected from Google Calendar
- Maintenance burden

---

## Strategy 2: If Completed Tasks Visible But Different Selector

### Problem
Completed tasks ARE rendered in the DOM but our selector `[data-eventid^="tasks."]` doesn't find them because they have different attributes/classes.

### Solution

**Approach**: Update our selectors to include completed task elements

**Steps:**
1. Inspect completed task HTML structure
2. Identify unique attributes/classes
3. Update `doRepaint()` selector to include completed tasks

**Example:**
```javascript
// Current selector:
const calendarTasks = document.querySelectorAll('[data-eventid^="tasks."]');

// Updated selector (example - depends on actual HTML):
const calendarTasks = document.querySelectorAll([
  '[data-eventid^="tasks."]',
  '[data-eventid^="tasks_"]',
  '.completed-task-class',  // If Google uses a specific class
  '[data-task-completed="true"]'  // If Google uses an attribute
].join(', '));
```

**Pros:**
- Simple fix
- No behavioral changes
- Works with Google's existing rendering

**Cons:**
- Depends on finding the right selector
- May break if Google changes their HTML

---

## Strategy 3: If Detection Logic is Broken

### Problem
Completed tasks are in the DOM with correct `data-eventid`, but `isTaskElementCompleted()` returns false because the line-through check doesn't work.

### Solution

**Approach**: Improve completed task detection logic

**Current detection:**
```javascript
function isTaskElementCompleted(taskElement) {
  const textElements = target.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6');
  for (const textEl of textElements) {
    const style = window.getComputedStyle(textEl);
    const decoration = style.textDecoration || style.textDecorationLine || '';
    if (decoration && decoration.includes('line-through')) {
      return true;
    }
  }
  return false;
}
```

**Improved detection options:**

#### Option A: Check Task Status from API
```javascript
async function isTaskElementCompleted(taskElement) {
  // Extract task ID
  const taskId = getTaskIdFromChip(taskElement);
  if (!taskId) return false;

  // Look up task in cache
  const cache = await refreshColorCache();
  const taskMeta = cache.taskMetadata?.[taskId];

  // Check status field
  return taskMeta?.status === 'completed';
}
```

**Requires**: Storing task metadata (status field) in cache during sync

#### Option B: Check Multiple Style Properties
```javascript
function isTaskElementCompleted(taskElement) {
  const target = getPaintTarget(taskElement);
  if (!target) return false;

  // Check for multiple indicators of completion
  const indicators = [
    // Line-through text decoration
    () => {
      const textElements = target.querySelectorAll('span, div, p');
      for (const el of textElements) {
        const style = window.getComputedStyle(el);
        const decoration = style.textDecoration || style.textDecorationLine || '';
        if (decoration && decoration.includes('line-through')) return true;
      }
      return false;
    },

    // Opacity (Google might dim completed tasks)
    () => {
      const style = window.getComputedStyle(target);
      const opacity = parseFloat(style.opacity);
      return opacity < 1 && opacity > 0; // e.g., 0.6
    },

    // Specific class
    () => target.classList.contains('completed-task-class'), // TBD

    // Specific attribute
    () => target.hasAttribute('data-completed'),

    // Check parent element
    () => {
      const parent = target.closest('[data-task-completed]');
      return !!parent;
    }
  ];

  // Return true if ANY indicator matches
  return indicators.some(check => check());
}
```

**Pros:**
- More robust detection
- Multiple fallbacks
- Catches edge cases

**Cons:**
- More complex
- May have false positives

---

## Strategy 4: If It's a Cache/Timing Issue

### Problem
The mapping is correct and detection works, but the cache isn't refreshed after sync, causing lookups to fail.

### Solution

**Approach**: Force cache invalidation and repaint after sync completes

**Current flow:**
```
User clicks Sync → buildTaskToListMapping() → Updates storage → Done
```

**Improved flow:**
```
User clicks Sync → buildTaskToListMapping() → Updates storage →
→ Invalidate cache → Broadcast TASK_LISTS_UPDATED →
→ Content script invalidates cache → Aggressive repaint
```

**Code changes needed:**

1. **In background.js** (after sync completes):
```javascript
async function handleSyncRequest() {
  const mapping = await buildTaskToListMapping();

  // Broadcast to ALL calendar tabs (not just active)
  const tabs = await chrome.tabs.query({ url: 'https://calendar.google.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'TASK_LISTS_UPDATED',
      syncComplete: true,  // NEW FLAG
      mappingSize: Object.keys(mapping).length
    });
  }

  return { success: true };
}
```

2. **In features/tasks-coloring/index.js** (handle message):
```javascript
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'TASK_LISTS_UPDATED') {
    console.log('[Task Colors] SYNC COMPLETE - mapping size:', message.mappingSize);

    // Force cache invalidation
    cacheLastUpdated = 0;
    taskElementReferences.clear();

    // Aggressive repaint sequence
    await refreshColorCache(); // Force immediate refresh
    repaintSoon(true); // Immediate
    setTimeout(() => repaintSoon(true), 100);
    setTimeout(() => repaintSoon(true), 500);
    setTimeout(() => repaintSoon(true), 1000);
    setTimeout(() => repaintSoon(true), 2000); // Extra delay for slow rendering
  }
});
```

---

## Strategy 5: Hybrid Approach - Use Task Metadata

### Problem
We're trying to detect completion status from DOM styling, but we have the authoritative source: the Google Tasks API.

### Solution

**Approach**: Store task metadata (including status) during sync, then use it for both detection and coloring

**Changes:**

#### 1. Store Task Metadata During Sync

**In `lib/google-tasks-api.js`:**
```javascript
export async function buildTaskToListMapping() {
  const lists = await fetchTaskLists();
  const mapping = {};
  const metadata = {}; // NEW

  for (const list of lists) {
    const tasks = await fetchTasksInList(list.id);
    tasks.forEach((task) => {
      // Store mapping (both formats)
      mapping[task.id] = list.id;
      try {
        const decodedId = atob(task.id);
        if (decodedId !== task.id) {
          mapping[decodedId] = list.id;
        }
      } catch (e) {}

      // Store metadata (NEW)
      const taskData = {
        listId: list.id,
        title: task.title,
        status: task.status, // 'completed' or 'needsAction'
        completed: task.completed, // Timestamp
        updated: task.updated
      };

      metadata[task.id] = taskData;
      try {
        const decodedId = atob(task.id);
        if (decodedId !== task.id) {
          metadata[decodedId] = taskData;
        }
      } catch (e) {}
    });
  }

  // Save both
  await chrome.storage.local.set({
    'cf.taskToListMap': mapping,
    'cf.taskMetadata': metadata  // NEW
  });

  return { mapping, metadata };
}
```

#### 2. Use Metadata for Detection

**In `features/tasks-coloring/index.js`:**
```javascript
async function refreshColorCache() {
  if (cache valid) return cache;

  // Fetch metadata along with other data
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get(['cf.taskToListMap', 'cf.taskMetadata']),
    chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors', 'settings'])
  ]);

  taskToListMapCache = localData['cf.taskToListMap'] || {};
  taskMetadataCache = localData['cf.taskMetadata'] || {}; // NEW
  // ... rest of cache
}

async function getColorForTask(taskId, manualColorsMap = null, options = {}) {
  const cache = await refreshColorCache();

  // Check if task is completed using metadata (more reliable)
  const taskMeta = cache.taskMetadata?.[taskId];
  const isCompleted = taskMeta?.status === 'completed';

  // Rest of function uses isCompleted
  // ...
}
```

#### 3. Remove DOM-based Detection

No longer need `isTaskElementCompleted()` - we have the truth from the API.

**Pros:**
- Authoritative source of truth (API)
- No brittle DOM inspection
- Works regardless of Google's styling
- Can show additional metadata (completion time, etc.)

**Cons:**
- More storage usage (~3x)
- Need to keep metadata in sync
- Initial implementation effort

---

## Recommended Approach

Based on typical issues, I recommend a **combined strategy**:

### Phase 1: Verify the Basics (Research)
1. Confirm completed tasks ARE visible in Google Calendar DOM
2. Identify their HTML structure and selectors
3. Verify our detection logic works

### Phase 2: Implement Hybrid Metadata Approach
1. Store task metadata during sync (Strategy 5)
2. Use API status instead of DOM detection
3. Improve cache invalidation (Strategy 4)

### Phase 3: Handle Edge Cases
1. If completed tasks hidden, document limitation (Strategy 1B)
2. Add better error messages/logging
3. Provide user guidance

This approach is:
- **Reliable**: Uses authoritative API data
- **Maintainable**: Less dependent on Google's DOM structure
- **Performant**: Still uses caching
- **User-friendly**: Clear documentation of limitations

---

## Next Steps

Before implementing any solution, we MUST complete the research in `GOOGLE_CALENDAR_COMPLETED_TASKS_RESEARCH.md` to understand the actual behavior.

Once we know:
1. **Are completed tasks visible in DOM?** → Determines if Strategy 1 is needed
2. **What do they look like?** → Determines if Strategy 2 is needed
3. **Does our detection work?** → Determines if Strategy 3 is needed
4. **Is the mapping populated?** → Determines if Strategy 4 is needed

Then we can choose the right combination of strategies.
