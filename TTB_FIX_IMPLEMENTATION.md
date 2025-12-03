# TTB_ Task Coloring Fix Implementation

**Date**: December 3, 2025
**Status**: 🔧 Implementation Ready
**Issue**: 0 tasks painted despite 24 ttb_ tasks detected

---

## 🎯 **ROOT CAUSE CONFIRMED**

### **Test Results Analysis**:
```
OLD FORMAT (tasks.) count: 0        ← All tasks are now ttb_ format
NEW FORMAT (ttb_) count: 24         ← 24 tasks detected
Captured tasks with Google colors: 9 ← Extension IS working
Tasks painted by extension: 0        ← But NO tasks painted
cfTasksColoring exists: undefined    ← Feature not initialized!
```

### **Why It's Failing**:

1. **Task Coloring Feature Not Initialized**
   - `window.cfTasksColoring` is undefined
   - Feature may be disabled in settings OR
   - Initialization failed silently

2. **TTB_ Resolution Fails**
   - `getTaskIdFromChip()` returns Promise for ttb_ tasks
   - Promise sent to background via `RESOLVE_CALENDAR_EVENT`
   - Background calls Calendar API to get event
   - Event description should contain task fragment
   - **But this chain is failing somewhere**

3. **No Error Logging**
   - Failures are silent
   - Can't diagnose where it breaks

---

## 🛠️ **IMPLEMENTATION PLAN**

### **Fix 1: Check If Feature Is Enabled** (2 minutes)

**Action**: Run this in browser console:
```javascript
chrome.storage.sync.get('settings', (data) => {
  const settings = data.settings || {};
  console.log('Task Coloring Enabled:', settings.taskColoring?.enabled);
  console.log('Task List Coloring Enabled:', settings.taskListColoring?.enabled);
  console.log('OAuth Granted:', settings.taskListColoring?.oauthGranted);
});
```

**If disabled**: Enable it in the extension popup.

---

### **Fix 2: Add Comprehensive Error Logging** (15 minutes)

**File**: `features/tasks-coloring/index.js`

**Problem**: Errors in ttb_ resolution are swallowed silently.

**Solution**: Add logging at every step of the resolution chain.

#### **Location 1: getTaskIdFromChip() - Line 24-34**

```javascript
// NEW UI: ttb_ prefix (requires calendar event mapping)
if (ev && ev.startsWith('ttb_')) {
  // Decode ttb_ to get calendar event ID
  const calendarEventId = decodeCalendarEventIdFromTtb(ev);

  // ADD ERROR LOGGING
  if (!calendarEventId) {
    console.warn('[TaskColoring] Failed to decode ttb_:', ev);
    return null;
  }

  console.log('[TaskColoring] Decoded ttb_:', { ttb: ev, calendarEventId });

  if (calendarEventId) {
    // Return Promise that resolves to task API ID
    const promise = resolveCalendarEventToTaskId(calendarEventId);

    // ADD ERROR LOGGING TO PROMISE
    promise
      .then(taskId => {
        if (taskId) {
          console.log('[TaskColoring] ✅ Resolved ttb_ → Task ID:', { calendarEventId, taskId });
        } else {
          console.warn('[TaskColoring] ❌ Failed to resolve ttb_ → Task ID:', { calendarEventId });
        }
      })
      .catch(error => {
        console.error('[TaskColoring] ❌ Error resolving ttb_:', { calendarEventId, error });
      });

    return promise;
  }
  return null;
}
```

#### **Location 2: resolveCalendarEventToTaskId() - Line 256-297**

```javascript
async function resolveCalendarEventToTaskId(calendarEventId) {
  if (!calendarEventId) {
    console.warn('[TaskColoring] resolveCalendarEventToTaskId called with empty ID');
    return null;
  }

  try {
    // Check cache first
    const cache = await refreshCalendarMappingCache();
    if (cache[calendarEventId]) {
      console.log('[TaskColoring] Found in cache:', calendarEventId);
      return cache[calendarEventId].taskApiId;
    }

    console.log('[TaskColoring] Not in cache, sending RESOLVE_CALENDAR_EVENT message...');

    // Cache miss - need to fetch from Calendar API
    // Send message to background script to handle API call
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'RESOLVE_CALENDAR_EVENT',
          calendarEventId: calendarEventId,
        },
        (response) => {
          // ADD ERROR LOGGING
          if (chrome.runtime.lastError) {
            console.error('[TaskColoring] Chrome runtime error:', chrome.runtime.lastError);
            resolve(null);
            return;
          }

          if (!response) {
            console.error('[TaskColoring] No response from background script');
            resolve(null);
            return;
          }

          console.log('[TaskColoring] Background response:', response);

          if (response && response.success && response.taskApiId) {
            // Update cache
            if (calendarEventMappingCache) {
              calendarEventMappingCache[calendarEventId] = {
                taskApiId: response.taskApiId,
                taskFragment: response.taskFragment,
                lastVerified: new Date().toISOString(),
              };
            }
            console.log('[TaskColoring] ✅ Successfully resolved:', { calendarEventId, taskApiId: response.taskApiId });
            resolve(response.taskApiId);
          } else {
            console.warn('[TaskColoring] ❌ Failed to resolve:', { calendarEventId, response });
            resolve(null);
          }
        },
      );
    });
  } catch (error) {
    console.error('[TaskColoring] Exception in resolveCalendarEventToTaskId:', error);
    return null;
  }
}
```

---

### **Fix 3: Add Logging to Background Handler** (10 minutes)

**File**: `background.js`

**Location**: `handleResolveCalendarEvent()` - Around line 1038

```javascript
async function handleResolveCalendarEvent(calendarEventId) {
  debugLog(`[Background] Resolving calendar event: ${calendarEventId}`);

  if (!calendarEventId) {
    const error = { success: false, error: 'No calendar event ID provided' };
    console.error('[Background] RESOLVE_CALENDAR_EVENT error:', error);
    return error;
  }

  try {
    // Check if already in storage cache
    const cached = await chrome.storage.local.get('cf.calendarEventMapping');
    const mapping = cached['cf.calendarEventMapping'] || {};

    if (mapping[calendarEventId]) {
      debugLog(`[Background] Calendar event ${calendarEventId} found in cache`);
      return {
        success: true,
        taskApiId: mapping[calendarEventId].taskApiId,
        taskFragment: mapping[calendarEventId].taskFragment,
      };
    }

    // Not in cache - fetch from Calendar API
    debugLog(`[Background] Calendar event ${calendarEventId} not in cache, fetching from API`);
    console.log('[Background] Calling GoogleCalendarAPI.calendarEventIdToTaskId...');

    const taskApiId = await GoogleCalendarAPI.calendarEventIdToTaskId(calendarEventId);

    if (!taskApiId) {
      const error = {
        success: false,
        error: 'Could not resolve calendar event to task ID',
      };
      console.error('[Background] Calendar API returned no task ID:', { calendarEventId });
      return error;
    }

    console.log('[Background] ✅ Successfully resolved:', { calendarEventId, taskApiId });

    // Store in cache for future lookups
    mapping[calendarEventId] = {
      taskApiId: taskApiId,
      taskFragment: null, // We don't have the fragment in this flow
      lastVerified: new Date().toISOString(),
    };

    await chrome.storage.local.set({
      'cf.calendarEventMapping': mapping,
    });

    return {
      success: true,
      taskApiId: taskApiId,
    };
  } catch (error) {
    console.error('[Background] Exception in handleResolveCalendarEvent:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}
```

---

### **Fix 4: Add Logging to Calendar API Module** (10 minutes)

**File**: `lib/google-calendar-api.js`

**Location**: `calendarEventIdToTaskId()` - Line 192

```javascript
export async function calendarEventIdToTaskId(calendarEventId) {
  if (!calendarEventId) {
    console.warn('[CalendarAPI] calendarEventIdToTaskId called with empty ID');
    return null;
  }

  try {
    console.log('[CalendarAPI] Fetching calendar event:', calendarEventId);

    // Fetch event from Calendar API
    const event = await fetchCalendarEvent(calendarEventId);
    if (!event) {
      console.warn('[CalendarAPI] No event returned from fetchCalendarEvent');
      return null;
    }

    console.log('[CalendarAPI] Event fetched:', {
      id: event.id,
      summary: event.summary,
      hasDescription: !!event.description,
      descriptionLength: event.description?.length || 0,
    });

    // Extract task fragment from description
    const fragment = extractTaskFragmentFromEvent(event);
    if (!fragment) {
      console.warn('[CalendarAPI] No task fragment found in event');
      console.log('[CalendarAPI] Event fields:', Object.keys(event));
      console.log('[CalendarAPI] Event description:', event.description?.slice(0, 500));
      return null;
    }

    console.log('[CalendarAPI] Task fragment extracted:', fragment);

    // Convert fragment to Task API ID
    const taskApiId = taskFragmentToApiId(fragment);

    console.log('[CalendarAPI] ✅ Successfully mapped:', { calendarEventId, fragment, taskApiId });

    return taskApiId;
  } catch (error) {
    console.error('[CalendarAPI] Failed to map calendar event to task:', calendarEventId, error);
    return null;
  }
}
```

---

### **Fix 5: Fallback - Use Tasks API webViewLink** (30 minutes)

**Problem**: Calendar API approach may be fundamentally broken if Google changed how tasks link to calendar events.

**Solution**: Extract task fragments during Tasks API sync, bypassing Calendar API entirely.

**File**: `lib/google-tasks-api.js`

**Location**: After `buildTaskToListMapping()` function (around line 400)

```javascript
/**
 * Build mapping from task fragments to task IDs
 * This allows ttb_ tasks to be resolved without Calendar API
 * Uses webViewLink from Tasks API response
 */
async function buildFragmentToTaskMapping() {
  console.log('[GoogleTasksAPI] Building fragment → task mapping...');

  try {
    const lists = await fetchTaskLists();
    if (!lists || !lists.items) {
      console.warn('[GoogleTasksAPI] No task lists available');
      return {};
    }

    const fragmentMapping = {};
    const taskToFragmentMapping = {};
    let totalFragments = 0;

    for (const list of lists.items) {
      console.log(`[GoogleTasksAPI] Processing list: ${list.title}`);

      const tasks = await fetchTasksInList(list.id);
      if (!tasks || !tasks.items) continue;

      for (const task of tasks.items) {
        // Extract fragment from webViewLink
        if (task.webViewLink) {
          const match = task.webViewLink.match(/tasks\.google\.com\/.*\/task\/([A-Za-z0-9_-]+)/);

          if (match && match[1]) {
            const fragment = match[1];
            const taskId = atob(task.id); // Decode task ID

            fragmentMapping[fragment] = {
              taskApiId: task.id,
              taskId: taskId,
              listId: list.id,
              taskTitle: task.title,
              lastUpdated: new Date().toISOString(),
            };

            taskToFragmentMapping[taskId] = fragment;

            totalFragments++;
          }
        }
      }
    }

    console.log(`[GoogleTasksAPI] Built ${totalFragments} fragment mappings`);

    // Store in local storage
    await chrome.storage.local.set({
      'cf.fragmentToTaskMapping': fragmentMapping,
      'cf.taskToFragmentMapping': taskToFragmentMapping,
    });

    return fragmentMapping;
  } catch (error) {
    console.error('[GoogleTasksAPI] Failed to build fragment mapping:', error);
    return {};
  }
}

// Export the new function
export { buildFragmentToTaskMapping };
```

**Then modify `buildTaskToListMapping()` to also build fragment mapping**:

```javascript
// At the end of buildTaskToListMapping() function, add:
await buildFragmentToTaskMapping();
```

---

### **Fix 6: Use Fragment Mapping in Content Script** (20 minutes)

**File**: `features/tasks-coloring/index.js`

**Add new function** after `resolveCalendarEventToTaskId()`:

```javascript
/**
 * Alternative resolution: Use fragment-based mapping (bypasses Calendar API)
 * This checks if we have a direct fragment → task mapping from Tasks API sync
 */
async function resolveViaFragmentMapping(calendarEventId) {
  console.log('[TaskColoring] Trying fragment-based resolution for:', calendarEventId);

  try {
    // Get fragment mapping from storage
    const { 'cf.fragmentToTaskMapping': fragmentMapping } = await chrome.storage.local.get('cf.fragmentToTaskMapping');

    if (!fragmentMapping || Object.keys(fragmentMapping).length === 0) {
      console.warn('[TaskColoring] Fragment mapping not available - needs sync first');
      return null;
    }

    // Try to find a matching fragment
    // Note: We don't have a direct calendar event → fragment mapping yet
    // So we need to try matching by some other means

    // TODO: This requires more investigation of how calendar event IDs
    // correlate to task fragments

    console.warn('[TaskColoring] Fragment-based resolution not yet implemented');
    return null;
  } catch (error) {
    console.error('[TaskColoring] Error in fragment-based resolution:', error);
    return null;
  }
}
```

**Modify `resolveCalendarEventToTaskId()` to try fragment mapping first**:

```javascript
async function resolveCalendarEventToTaskId(calendarEventId) {
  if (!calendarEventId) {
    return null;
  }

  try {
    // Check cache first
    const cache = await refreshCalendarMappingCache();
    if (cache[calendarEventId]) {
      return cache[calendarEventId].taskApiId;
    }

    // NEW: Try fragment-based resolution (doesn't require Calendar API)
    const fragmentResult = await resolveViaFragmentMapping(calendarEventId);
    if (fragmentResult) {
      return fragmentResult;
    }

    // Fallback: Use Calendar API (original approach)
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'RESOLVE_CALENDAR_EVENT', calendarEventId },
        (response) => {
          // ... existing code ...
        }
      );
    });
  } catch (error) {
    console.error('[TaskColoring] Exception in resolveCalendarEventToTaskId:', error);
    return null;
  }
}
```

---

## 🧪 **TESTING PROCEDURE**

### **Phase 1: Enable Logging** (Immediate)

1. Apply **Fix 2, 3, and 4** to add logging
2. Reload extension
3. Refresh calendar.google.com
4. Open console and look for log messages

**Expected output**:
```
[TaskColoring] Decoded ttb_: { ttb: "ttb_...", calendarEventId: "..." }
[TaskColoring] Not in cache, sending RESOLVE_CALENDAR_EVENT message...
[Background] Resolving calendar event: ...
[Background] Calling GoogleCalendarAPI.calendarEventIdToTaskId...
[CalendarAPI] Fetching calendar event: ...
```

**This will show you EXACTLY where it fails.**

### **Phase 2: Check Calendar API Permission** (If logging shows API failure)

Run in console:
```javascript
chrome.identity.getAuthToken({ interactive: false }, (token) => {
  if (token) {
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => {
      console.log('Calendar API accessible:', r.ok);
      if (!r.ok) console.log('Status:', r.status, r.statusText);
    });
  } else {
    console.log('No OAuth token');
  }
});
```

**If denied**: Need to grant Calendar API permission.

### **Phase 3: Inspect Event Description** (If API works but no fragment found)

Run in console (replace with actual calendar event ID from logs):
```javascript
chrome.identity.getAuthToken({ interactive: false }, (token) => {
  const calendarEventId = '6skm2j311k4aal09vf31c32m8u'; // From ttb_ decode

  fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(r => r.json())
  .then(event => {
    console.log('Event:', event);
    console.log('Description:', event.description);
    console.log('All fields:', Object.keys(event));
  });
});
```

**If description doesn't have task link**: Google changed the format → need **Fix 5**.

---

## 📊 **EXPECTED OUTCOMES**

### **Scenario A: Calendar API Permission Missing**
- Logs show: `Calendar API returned 403`
- Fix: Grant permission in popup
- Result: Colors work immediately

### **Scenario B: Event Description Changed**
- Logs show: `No task fragment found in event`
- Fix: Implement **Fix 5** (webViewLink mapping)
- Result: Bypass Calendar API entirely

### **Scenario C: Task Coloring Disabled**
- `cfTasksColoring` undefined because feature disabled
- Fix: Enable in popup settings
- Result: Feature initializes and works

---

## 🎯 **RECOMMENDED ACTION PLAN**

1. **First**: Run settings check script to see if feature is enabled
2. **Second**: Apply logging fixes (2, 3, 4) and reload
3. **Third**: Check console logs to identify exact failure point
4. **Fourth**: Apply appropriate fix based on logs
5. **Fifth**: Implement fragment-based fallback for future-proofing

---

**Next: Apply Fix 2 (logging) and report what the logs show!**
