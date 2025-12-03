# Task List Coloring Analysis - New Google Calendar UI

**Date**: December 3, 2025
**Status**: 🔴 **BROKEN** - 0% Task Mapping Success Rate
**Analyst**: Claude Code Assistant

---

## 🚨 **EXECUTIVE SUMMARY**

**Problem**: Task list coloring feature is completely broken with the new Google Calendar UI.

**Current Status**:
- ✅ 4 tasks visible in Google Calendar
- ❌ 0 tasks successfully mapped (0% success rate)
- ❌ No tasks receiving custom colors

**Root Cause**: Google Calendar now uses `ttb_` prefix format instead of direct task IDs. While your extension has infrastructure to handle this, the mapping chain is failing somewhere.

---

## 📊 **DATA ANALYSIS**

### **From `calendar-complete-analysis-1764771280664.json`**:

```json
{
  "metadata": {
    "totalCards": 42,
    "totalEvents": 17,
    "totalTasks": 4
  },
  "summary": {
    "mappedToEvents": 0,
    "mappedToTasks": 0,
    "unmapped": 42,
    "mappingSuccessRate": "0%"
  }
}
```

### **Sample Task Data**:

```json
{
  "cardIndex": 9,
  "cardType": "unknown",
  "eventId": "ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt",
  "classList": ["GTG3wb", "ChfiMc", "rFUW1c", "LLspoc", "F262Ye", "afiDFd"],
  "attributes": {
    "data-eventid": "ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt"
  }
}
```

**Decoded `ttb_` String**:
```bash
$ echo "MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt" | base64 -d
15qmhor3c7v7f60rp0teq0lak3 adam.hurley.private@m
└─ Calendar Event ID       └─ User Email
```

---

## 🏗️ **ARCHITECTURE ANALYSIS**

### **Required Mapping Chain**:

```
DOM Element (ttb_ format)
    ↓ decode base64
Calendar Event ID (e.g., "15qmhor3c7v7f60rp0teq0lak3")
    ↓ Google Calendar API call
Calendar Event Object (with description field)
    ↓ regex extract: tasks.google.com/task/{FRAGMENT}
Task Fragment (e.g., "K8gRiZkif_qqDGI8")
    ↓ base64 encode: btoa(fragment)
Task API ID (e.g., "SzhnUmlaa2lmX3FxREdJOA==")
    ↓ lookup in cf.taskListColors
Color (apply to DOM)
```

### **Existing Code Implementation**:

| Component | File | Status |
|-----------|------|--------|
| Detect `ttb_` prefix | `features/tasks-coloring/index.js:4` | ✅ Implemented |
| Decode base64 | `features/tasks-coloring/index.js:212-226` | ✅ Implemented |
| Resolve to Task ID | `features/tasks-coloring/index.js:256-297` | ✅ Implemented |
| Calendar API module | `lib/google-calendar-api.js` | ✅ Implemented |
| Background handler | `background.js:1038-1068` | ✅ Implemented |
| OAuth scope | `manifest.json:32` | ✅ `calendar.readonly` included |

**Conclusion**: All infrastructure exists! Something in the chain is failing.

---

## 🔍 **POTENTIAL ROOT CAUSES** (Ranked by Likelihood)

### **1. Calendar API Permission Not Granted** (90% likely)
- **Symptom**: User granted Tasks API but not Calendar API
- **Impact**: Cannot fetch calendar events → whole chain fails
- **Test**: Run `GoogleCalendarAPI.isCalendarApiAccessible()` in console
- **Fix**: User needs to re-authorize with Calendar scope

### **2. Event Description Format Changed** (70% likely)
- **Symptom**: Google changed how tasks are linked to events
- **Current expectation**: `tasks.google.com/task/{FRAGMENT}` in description
- **Reality**: May have changed to different field or format
- **Test**: Fetch a calendar event and inspect all fields
- **Fix**: Update regex in `extractTaskFragmentFromEvent()`

### **3. Calendar Event Mapping Cache Never Populated** (60% likely)
- **Symptom**: `cf.calendarEventMapping` storage is empty
- **Impact**: Every task requires API call → rate limits/failures
- **Test**: Check `chrome.storage.local.get('cf.calendarEventMapping')`
- **Fix**: Add initialization logic to populate cache on first load

### **4. Async Promise Handling Failure** (30% likely)
- **Symptom**: `getResolvedTaskId()` returns Promise but not awaited
- **Code review**: Line 1689 correctly awaits: `const id = await getResolvedTaskId(chip);`
- **Status**: Looks correct, but worth double-checking in `doRepaint()`

### **5. Silent Error Swallowing** (40% likely)
- **Symptom**: API calls fail but errors are caught and ignored
- **Code review**: `calendarEventIdToTaskId()` returns `null` on error
- **Impact**: Failures are silent → no user feedback
- **Fix**: Add console logging for all error paths

---

## 🧪 **DIAGNOSTIC PLAN**

### **Step 1: Run Diagnostic Script** (5 minutes)

I've created a comprehensive diagnostic script: `/diagnostics/test-ttb-mapping.js`

**How to run**:
1. Open Google Calendar in Chrome
2. Ensure tasks are visible (switch to week view if needed)
3. Open DevTools Console (F12)
4. Copy/paste contents of `/diagnostics/test-ttb-mapping.js`
5. Review output for failures

**What it tests**:
1. ✅ Find `ttb_` elements in DOM
2. ✅ Decode base64 strings
3. ✅ Load extension modules
4. ✅ Check OAuth token
5. ✅ Test Calendar API access
6. ✅ Fetch real calendar event
7. ✅ Extract task fragment from description
8. ✅ Convert fragment to Task API ID
9. ✅ Verify task exists in Tasks API
10. ✅ Check storage caches

**Output**: Identifies exact failure point in the chain

### **Step 2: Analyze Results** (2 minutes)

The script will tell you which test failed first. This is your root cause.

**Common Outputs**:

#### **Scenario A**: Calendar API Not Accessible
```
❌ Calendar API Access: API returned 403: Forbidden
```
**Fix**: User needs to grant Calendar API permission
- Open extension popup
- Click "Manage Permissions"
- Ensure `calendar.readonly` is checked

#### **Scenario B**: Task Fragment Not in Description
```
❌ Extract Task Fragment: No task fragment found in event description
   Description: "Some other text"
```
**Fix**: Google changed how tasks are linked
- Need to inspect full event object
- Look for alternative fields (e.g., `extendedProperties`, `source`, etc.)

#### **Scenario C**: All Tests Pass But Cache Empty
```
✅ All tests passed!
⚠️  Storage Caches: calendarMappingEntries: 0
```
**Fix**: Need to populate cache on initialization
- Add bulk fetch logic to `background.js`
- Populate `cf.calendarEventMapping` on first Calendar open

---

## 🛠️ **FIX IMPLEMENTATION**

Based on diagnostic results, here are the most likely fixes:

### **Fix 1: Force Calendar API Permission Request**

If Calendar API not accessible, add interactive permission request:

**File**: `popup/popup.js`

Add after line where user grants Tasks API:

```javascript
// After OAuth granted for Tasks API, also request Calendar API
async function requestCalendarPermission() {
  try {
    const token = await chrome.identity.getAuthToken({
      interactive: true,
      scopes: [
        'https://www.googleapis.com/auth/tasks.readonly',
        'https://www.googleapis.com/auth/calendar.readonly', // NEW
      ],
    });

    if (token) {
      console.log('✅ Calendar API permission granted');
      return true;
    }
  } catch (error) {
    console.error('❌ Calendar API permission denied:', error);
    return false;
  }
}
```

### **Fix 2: Update Event Description Extraction**

If task fragment not found in description, inspect other fields:

**File**: `lib/google-calendar-api.js`

Update `extractTaskFragmentFromEvent()` around line 49:

```javascript
export function extractTaskFragmentFromEvent(event) {
  if (!event) {
    return null;
  }

  // Try description field (old location)
  if (event.description) {
    const match = event.description.match(/tasks\.google\.com\/task\/([A-Za-z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // NEW: Try extendedProperties (Google may have moved it)
  if (event.extendedProperties?.private?.taskId) {
    return event.extendedProperties.private.taskId;
  }

  // NEW: Try source field
  if (event.source?.url) {
    const match = event.source.url.match(/tasks\.google\.com\/task\/([A-Za-z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // NEW: Try attachments
  if (event.attachments) {
    for (const attachment of event.attachments) {
      if (attachment.fileUrl) {
        const match = attachment.fileUrl.match(/tasks\.google\.com\/task\/([A-Za-z0-9_-]+)/);
        if (match && match[1]) {
          return match[1];
        }
      }
    }
  }

  console.warn('[CalendarAPI] No task fragment found in any known field:', {
    hasDescription: !!event.description,
    hasExtendedProperties: !!event.extendedProperties,
    hasSource: !!event.source,
    hasAttachments: !!event.attachments,
    eventId: event.id,
  });

  return null;
}
```

### **Fix 3: Add Cache Initialization**

If cache is empty, populate it on Calendar page load:

**File**: `background.js`

Add new function:

```javascript
/**
 * Initialize calendar event mapping cache by fetching all visible tasks
 * Called when user first opens Calendar with task coloring enabled
 */
async function initializeCalendarEventMapping() {
  debugLog('[CalendarMapping] Initializing cache...');

  try {
    // Get all task lists
    const lists = await GoogleTasksAPI.fetchTaskLists();
    if (!lists || !lists.items) {
      debugLog('[CalendarMapping] No task lists found');
      return;
    }

    const mapping = {};
    let totalMapped = 0;

    // For each list, fetch tasks
    for (const list of lists.items) {
      const tasks = await GoogleTasksAPI.fetchTasksInList(list.id);
      if (!tasks || !tasks.items) continue;

      // For each task with a webViewLink, extract fragment
      for (const task of tasks.items) {
        if (task.webViewLink) {
          const match = task.webViewLink.match(/tasks\.google\.com\/.*\/task\/([A-Za-z0-9_-]+)/);
          if (match && match[1]) {
            const fragment = match[1];
            const taskApiId = task.id; // Already in API format

            // Store reverse mapping: fragment → taskApiId
            // (We'll build calendarEventId → taskApiId mapping on demand)
            mapping[fragment] = {
              taskApiId: taskApiId,
              listId: list.id,
              taskTitle: task.title,
              lastVerified: new Date().toISOString(),
            };
            totalMapped++;
          }
        }
      }
    }

    // Save to storage
    await chrome.storage.local.set({
      'cf.taskFragmentMapping': mapping, // NEW storage key
    });

    debugLog(`[CalendarMapping] Initialized ${totalMapped} task fragments`);
    return totalMapped;
  } catch (error) {
    console.error('[CalendarMapping] Initialization failed:', error);
    return 0;
  }
}

// Call this when CALENDAR_TAB_ACTIVE is received
async function handleCalendarTabActive(tabId) {
  if (!tabId) return;

  activeCalendarTabs.add(tabId);
  lastUserActivity = Date.now();

  // NEW: Check if mapping cache is empty
  const cache = await chrome.storage.local.get('cf.taskFragmentMapping');
  if (!cache['cf.taskFragmentMapping'] || Object.keys(cache['cf.taskFragmentMapping']).length === 0) {
    // Cache empty - initialize it
    debugLog('[CalendarMapping] Cache empty, initializing...');
    await initializeCalendarEventMapping();
  }

  await updatePollingState();
  await persistStateMachineState();
}
```

### **Fix 4: Alternative Approach - Direct webViewLink Extraction**

If Calendar API approach fails completely, use Tasks API `webViewLink` field:

**Concept**: Tasks API already returns `webViewLink` with the fragment. Store this during sync.

**File**: `lib/google-tasks-api.js`

In `buildTaskToListMapping()` around line 370:

```javascript
tasks.forEach((task) => {
  const idToStore = atob(task.id);
  taskToListMap[idToStore] = list.id;

  // NEW: Extract and store task fragment from webViewLink
  if (task.webViewLink) {
    const match = task.webViewLink.match(/tasks\.google\.com\/.*\/task\/([A-Za-z0-9_-]+)/);
    if (match && match[1]) {
      const fragment = match[1];

      // Store both directions:
      // 1. taskId → fragment (for reverse lookup)
      // 2. fragment → taskId (for quick ttb_ resolution)
      if (!taskToFragmentMap) taskToFragmentMap = {};
      if (!fragmentToTaskMap) fragmentToTaskMap = {};

      taskToFragmentMap[idToStore] = fragment;
      fragmentToTaskMap[fragment] = idToStore;
    }
  }

  taskCount++;
});

// After loop, save fragment maps
await chrome.storage.local.set({
  'cf.taskToFragmentMap': taskToFragmentMap,
  'cf.fragmentToTaskMap': fragmentToTaskMap,
});
```

Then in `features/tasks-coloring/index.js`, when resolving `ttb_`:

```javascript
async function resolveCalendarEventToTaskId(calendarEventId) {
  if (!calendarEventId) {
    return null;
  }

  // NEW: Try fragment-based lookup first (faster, no API call)
  const cache = await chrome.storage.local.get('cf.fragmentToTaskMap');
  const fragmentMap = cache['cf.fragmentToTaskMap'] || {};

  // Extract fragment from Calendar Event (if we can correlate it)
  // This requires knowing which fragment maps to which calendar event
  // Fallback to Calendar API if not in cache

  // ... existing Calendar API logic ...
}
```

---

## 📋 **ACTION ITEMS**

### **Immediate** (Do Now):

1. ✅ **Run diagnostic script**
   - File: `/diagnostics/test-ttb-mapping.js`
   - Copy/paste into console on calendar.google.com
   - Note which test fails first

2. ✅ **Check OAuth permissions**
   ```javascript
   // In console:
   const token = await chrome.identity.getAuthToken({ interactive: false });
   console.log('Token:', token ? 'Exists' : 'Missing');
   ```

3. ✅ **Check Calendar API access**
   ```javascript
   // In console:
   const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
     headers: { Authorization: `Bearer ${token}` }
   });
   console.log('Calendar API:', response.ok ? 'Accessible' : 'Denied');
   ```

### **Based on Diagnostic Results**:

#### **If: Calendar API Permission Denied**
→ Implement **Fix 1**: Force Calendar API permission request

#### **If: Task Fragment Not Found**
→ Implement **Fix 2**: Update event description extraction
→ Run diagnostic to see what fields are available in event object

#### **If: Cache Empty**
→ Implement **Fix 3**: Add cache initialization logic

#### **If: Calendar API Approach Fails Completely**
→ Implement **Fix 4**: Use webViewLink from Tasks API instead

---

## 🔄 **ALTERNATIVE APPROACH**

If Calendar API proves unreliable, consider this simpler approach:

### **Bypass Calendar API Entirely**

**Insight**: We don't actually need Calendar API if we can extract fragments during Tasks API sync.

**New Flow**:
1. During `buildTaskToListMapping()`, extract task fragment from `task.webViewLink`
2. Store mapping: `fragment → taskApiId`
3. When user hovers over task in Calendar, scrape the task title from DOM
4. Search Tasks API cache for matching title + fragment
5. Apply color

**Pros**:
- No Calendar API dependency
- Faster (no extra API call per task)
- More reliable (Tasks API is more stable)

**Cons**:
- Title-based matching is less reliable
- Requires full Tasks API sync first
- Won't work if task title changes

---

## 📊 **VERIFICATION CHECKLIST**

After implementing fix, verify:

- [ ] Run diagnostic script → All tests pass
- [ ] Open Google Calendar with tasks visible
- [ ] Check console for `[TaskColoring]` log messages
- [ ] Verify tasks are colored correctly
- [ ] Test with multiple task lists
- [ ] Test with completed tasks
- [ ] Test navigation (day/week/month views)
- [ ] Test creating new task → should color immediately
- [ ] Test moving task between dates → color should persist

---

## 📚 **RELATED DOCUMENTATION**

- **Main Docs**: `/CLAUDE.md` - Full codebase reference
- **Diagnostic Script**: `/diagnostics/test-ttb-mapping.js` - Run this first
- **Task Mapping Investigation**: `/docs/TASK_MAPPING_INVESTIGATION.md` - Background
- **Investigation Results**: `/diagnostics/INVESTIGATION_RESULTS.md` - Previous test results

---

## 🎯 **EXPECTED OUTCOME**

After fixing, the diagnostic script should show:

```
✅ Passed: 10
❌ Failed: 0
⚠️  Warnings: 0

🎯 ROOT CAUSE ANALYSIS:
🎉 All tests passed! Mapping chain is working correctly.
   Task colors should now be visible in Google Calendar.
```

And task coloring should work:
- Tasks appear with custom colors in Calendar
- New tasks are colored within 2 seconds
- Colors persist across navigation
- Completed tasks use custom completed styling

---

**Next Step**: Run `/diagnostics/test-ttb-mapping.js` and report results!
