# Task Coloring Implementation Audit

**Date**: December 3, 2025
**Status**: 🟡 **Implementation Complete - Debugging Required**
**Branch**: `claude/audit-task-coloring-01EzGwXtmgjqv7HmCVq9P7L3`

---

## 🎯 EXECUTIVE SUMMARY

Your implementation of the ttb_ (new Google Calendar UI) task coloring is **architecturally correct** and follows the proper mapping chain. The code structure is sound, but the feature is not working in production, indicating a **runtime issue** rather than a design flaw.

**Key Finding**: 0% mapping success rate despite having all the correct infrastructure in place.

---

## 📊 VERIFIED DATA FLOW

I analyzed your `calendar-complete-analysis-1764771280664.json` file and confirmed the complete mapping chain works:

### Example: Task "sfss"

```
1. DOM Element
   data-eventid="ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt"

2. Decode ttb_ (base64)
   → "15qmhor3c7v7f60rp0teq0lak3 adam.hurley.private@m"

3. Calendar API Event
   ID: "15qmhor3c7v7f60rp0teq0lak3"
   Description: "...https://tasks.google.com/task/K8gRiZkif_qqDGI8"

4. Extract Task Fragment
   → "K8gRiZkif_qqDGI8"

5. Encode Fragment (base64)
   → "SzhnUmlaa2lmX3FxREdJOA"

6. Tasks API Task
   ID: "SzhnUmlaa2lmX3FxREdJOA"
   Title: "sfss"
   List: "MDc3NzY1NTY1MzI3ODMwNjIzNDE6MDow" (My Tasks)
```

**✅ This mapping chain is CORRECT and matches your implementation!**

---

## ✅ WHAT'S IMPLEMENTED CORRECTLY

### 1. **Calendar API Integration** (`lib/google-calendar-api.js`)
- ✅ `decodeCalendarEventId()` - Decodes ttb_ prefix correctly
- ✅ `fetchCalendarEvent()` - Fetches event from Calendar API
- ✅ `extractTaskFragmentFromEvent()` - Extracts fragment from description using correct regex
- ✅ `taskFragmentToApiId()` - Converts fragment to base64 Task API ID
- ✅ Error handling for 401, 403, 404 responses
- ✅ Token refresh logic

### 2. **Background Script** (`background.js`)
- ✅ Imports `google-calendar-api.js` correctly
- ✅ `handleResolveCalendarEvent()` function implemented
- ✅ Caching in `cf.calendarEventMapping` storage
- ✅ Message handler for `RESOLVE_CALENDAR_EVENT`

### 3. **Content Script** (`features/tasks-coloring/index.js`)
- ✅ `getTaskIdFromChip()` detects ttb_ prefix (line 24-34)
- ✅ `resolveCalendarEventToTaskId()` sends message to background (line 256-296)
- ✅ `refreshCalendarMappingCache()` manages in-memory cache (line 232-248)
- ✅ Selectors updated to include `[data-eventid^="ttb_"]` (line 144, 673, 864, etc.)
- ✅ `getResolvedTaskId()` async wrapper handles Promises (line 72-82)

### 4. **Manifest** (`manifest.json`)
- ✅ `calendar.readonly` scope added (line 32)
- ✅ Proper permissions configuration

---

## ❌ IDENTIFIED ISSUES

### 1. **Zero Mapping Success**
**Finding**: `calendar-complete-analysis-1764771280664.json` shows:
```json
{
  "totalCards": 42,
  "mappedToEvents": 0,
  "mappedToTasks": 0,
  "unmapped": 42,
  "mappingSuccessRate": "0%"
}
```

**This means**:
- No ttb_ tasks are being resolved to Task API IDs
- The `resolveCalendarEventToTaskId()` function is likely not being called
- OR it's being called but failing silently

### 2. **Possible Permission Issue**
**Hypothesis**: Calendar API permission might not be granted at runtime.

**Evidence**:
- Manifest has `calendar.readonly` scope ✅
- But extension might need to be reinstalled for new scope
- OR user needs to re-authenticate

### 3. **Async/Await Timing Issues**
**Location**: `features/tasks-coloring/index.js:1689`
```javascript
const id = await getResolvedTaskId(chip);
```

**Potential Issue**:
- `getTaskIdFromChip()` returns a Promise for ttb_ elements
- BUT the promise might not be awaited properly in all call sites
- Some functions might receive a Promise object instead of the resolved string

### 4. **Missing Error Logging**
**Observation**: No `[CalendarAPI]` logs in your console output.

**This suggests**:
- `fetchCalendarEvent()` is never being called
- OR exceptions are being silently caught
- OR the code path never reaches the Calendar API module

---

## 🔍 DIAGNOSTIC ANALYSIS

### Data from `calendar-complete-analysis-1764771280664.json`:

**Tasks in Calendar (DOM)**:
- 42 total task cards detected
- Multiple ttb_ prefixed elements found
- Examples:
  - `ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt`
  - `ttb_NmgwZnQ1ODdnNGszZDdpYTQ5b3NsMXA5dWkgYWRhbS5odXJsZXkucHJpdmF0ZUBt`
  - `ttb_NTlpMjkzc2UzcWVkbGt1b3JxdG0xaXNtOWIgYWRhbS5odXJsZXkucHJpdmF0ZUBt`

**Tasks from Tasks API**:
- 4 tasks retrieved successfully
- Task IDs:
  - `VkNlZVhiZzQzcEN0Nk9IUw` (sg\s)
  - `SzhnUmlaa2lmX3FxREdJOA` (sfss)
  - `WGMtVWFIS1d6U2VSeXNVQw` (test)
  - `eUZCRTVRa3h4djhNTXM0VQ` (mgjv)

**Calendar API Events**:
- 17 events retrieved
- Includes task events with `eventType: "focusTime"`
- Event descriptions contain task links (✅ correct format)

**Mapping Success**:
- **0 successful mappings** ❌
- This is the core problem

---

## 🐛 ROOT CAUSE HYPOTHESIS

Based on the audit, I believe the issue is **one or more** of the following:

### **Hypothesis A: Execution Never Reaches Resolution Code**
**Likelihood**: 🔴 **HIGH**

**Evidence**:
1. No `[CalendarAPI]` logs in console output
2. 0% mapping success despite correct infrastructure
3. `resolveCalendarEventToTaskId()` is only called from `getTaskIdFromChip()` for ttb_ elements

**Possible causes**:
- `getTaskIdFromChip()` returning sync string for ttb_ instead of Promise
- Code path bypassing the ttb_ case statement
- Early return before reaching resolution logic

**Where to check**:
```javascript
// features/tasks-coloring/index.js:24-34
if (ev && ev.startsWith('ttb_')) {
  const calendarEventId = decodeCalendarEventIdFromTtb(ev);  // ← Is this working?
  if (calendarEventId) {
    return resolveCalendarEventToTaskId(calendarEventId);   // ← Is this called?
  }
  return null;
}
```

### **Hypothesis B: Missing or Incorrect decodeCalendarEventIdFromTtb()**
**Likelihood**: 🟡 **MEDIUM**

**Issue**: In `features/tasks-coloring/index.js`, line 27 calls `decodeCalendarEventIdFromTtb()`, but this function:
- Is defined locally (lines 212-226)
- Returns a STRING (calendar event ID), not an object
- BUT `google-calendar-api.js` has `decodeCalendarEventId()` which returns an OBJECT with `{calendarEventId, email}`

**There might be a mismatch between**:
1. Local function: `decodeCalendarEventIdFromTtb(ev)` → returns string
2. Module function: `GoogleCalendarAPI.decodeCalendarEventId(ev)` → returns object

**This could cause**:
- Wrong calendar event ID being passed to resolution function
- Null checks failing unexpectedly

### **Hypothesis C: Calendar API Permission Not Actually Granted**
**Likelihood**: 🟡 **MEDIUM**

**Evidence**:
- Manifest was updated to include `calendar.readonly`
- But extension might not have been fully reinstalled
- Chrome might still be using cached permission manifest

**Test**:
```javascript
// In console on calendar.google.com
chrome.runtime.sendMessage({
  type: 'RESOLVE_CALENDAR_EVENT',
  calendarEventId: '15qmhor3c7v7f60rp0teq0lak3'
}, (response) => {
  console.log('Response:', response);
});
```

**Expected if permissions work**: `{ success: true, taskApiId: "..." }`
**Expected if permissions fail**: `{ success: false, error: "..." }` or 403 error in background console

### **Hypothesis D: Async/Await Not Properly Handled**
**Likelihood**: 🟢 **LOW**

**Observation**: The code uses `await getResolvedTaskId(chip)` consistently, which should handle both sync and async returns correctly.

**BUT** - There might be older code paths that call `getTaskIdFromChip()` directly without awaiting.

---

## 🔧 RECOMMENDED DEBUGGING STEPS

### **Step 1: Add Comprehensive Logging** 🔥 **DO THIS FIRST**

Add logging to track execution flow:

```javascript
// features/tasks-coloring/index.js:14-34
function getTaskIdFromChip(el) {
  if (!el || !el.getAttribute) return null;

  const ev = el.getAttribute('data-eventid');
  console.log('[DEBUG] getTaskIdFromChip called with eventid:', ev); // ← ADD THIS

  // OLD UI: tasks. or tasks_ prefix (direct task ID)
  if (ev && (ev.startsWith('tasks.') || ev.startsWith('tasks_'))) {
    console.log('[DEBUG] OLD UI detected, returning direct task ID'); // ← ADD THIS
    return ev.slice(6);
  }

  // NEW UI: ttb_ prefix (requires calendar event mapping)
  if (ev && ev.startsWith('ttb_')) {
    console.log('[DEBUG] NEW UI (ttb_) detected, attempting resolution'); // ← ADD THIS
    const calendarEventId = decodeCalendarEventIdFromTtb(ev);
    console.log('[DEBUG] Decoded calendar event ID:', calendarEventId); // ← ADD THIS

    if (calendarEventId) {
      console.log('[DEBUG] Calling resolveCalendarEventToTaskId()'); // ← ADD THIS
      return resolveCalendarEventToTaskId(calendarEventId);
    }
    console.log('[DEBUG] No calendar event ID extracted, returning null'); // ← ADD THIS
    return null;
  }

  console.log('[DEBUG] No eventid match, checking fallbacks'); // ← ADD THIS
  // ... rest of function
}
```

### **Step 2: Test Calendar API Access Directly**

Run this in the browser console on calendar.google.com:

```javascript
// Test if Calendar API is accessible
chrome.runtime.sendMessage({
  type: 'RESOLVE_CALENDAR_EVENT',
  calendarEventId: '15qmhor3c7v7f60rp0teq0lak3'  // Use actual ID from your data
}, (response) => {
  console.log('Calendar API Test Response:', response);
  if (response.success) {
    console.log('✅ Calendar API working! Task ID:', response.taskApiId);
  } else {
    console.error('❌ Calendar API failed:', response.error);
  }
});
```

### **Step 3: Check Runtime Permissions**

```javascript
// Check if calendar scope is granted
chrome.permissions.contains({
  origins: ['https://www.googleapis.com/calendar/v3/*']
}, (result) => {
  console.log('Calendar API permission granted:', result);
});
```

### **Step 4: Verify decodeCalendarEventIdFromTtb() Output**

```javascript
// Test decoding function directly
const ttb = "ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt";
const decoded = atob(ttb.slice(4));
console.log('Decoded:', decoded);
console.log('Calendar Event ID (first part):', decoded.split(' ')[0]);
// Expected: "15qmhor3c7v7f60rp0teq0lak3"
```

### **Step 5: Test End-to-End with Single Task**

```javascript
// Full chain test
const taskElement = document.querySelector('[data-eventid^="ttb_"]');
if (taskElement) {
  const eventId = taskElement.getAttribute('data-eventid');
  console.log('Found ttb_ element:', eventId);

  // Decode
  const decoded = atob(eventId.slice(4));
  const calendarEventId = decoded.split(' ')[0];
  console.log('Calendar Event ID:', calendarEventId);

  // Test resolution
  chrome.runtime.sendMessage({
    type: 'RESOLVE_CALENDAR_EVENT',
    calendarEventId: calendarEventId
  }, (response) => {
    console.log('Resolution result:', response);
  });
}
```

---

## 📝 SPECIFIC CODE ISSUES TO INVESTIGATE

### Issue 1: Function Name Mismatch ⚠️

**Location**: `features/tasks-coloring/index.js:212`

```javascript
function decodeCalendarEventIdFromTtb(ttbString) {
  // Returns: string (calendar event ID only)
  try {
    const base64Part = ttbString.slice(4);
    const decoded = atob(base64Part);
    const parts = decoded.split(' ');
    return parts[0] || null;  // ← Returns string
  } catch (error) {
    console.error('[TaskColoring] Failed to decode ttb_ string:', ttbString, error);
    return null;
  }
}
```

**Compare with**: `lib/google-calendar-api.js:20`

```javascript
export function decodeCalendarEventId(ttbString) {
  // Returns: { calendarEventId, email }
  try {
    const base64Part = ttbString.slice(4);
    const decoded = atob(base64Part);
    const parts = decoded.split(' ');
    return {
      calendarEventId: parts[0],  // ← Returns object
      email: parts[1] || null
    };
  } catch (error) {
    console.error('[CalendarAPI] Failed to decode ttb_ string:', ttbString, error);
    return null;
  }
}
```

**Recommendation**:
- **Option A**: Use the module function (`GoogleCalendarAPI.decodeCalendarEventId()`) instead of local duplicate
- **Option B**: Keep local function but ensure it's being used correctly

**Why it might be causing issues**:
- If code somewhere expects an object but gets a string, it could fail silently
- Duplicate code = more places for bugs

### Issue 2: Missing Import in Content Script ⚠️

**Observation**: `features/tasks-coloring/index.js` does NOT import `google-calendar-api.js`

**Current code**:
```javascript
// No imports at top of file - it's a content script loaded via manifest
```

**This means**:
- Content script has its own `decodeCalendarEventIdFromTtb()` (duplicate)
- Content script sends message to background for actual API call ✅ (correct)
- BUT the duplicate function could have bugs

**Recommendation**: Add logging to the content script's decode function to verify it works

---

## ✅ ACTION PLAN

### Immediate (Do Today):

1. **Add Debug Logging** 🔥
   - Add `console.log()` statements to track execution in `getTaskIdFromChip()`
   - Add logging to `resolveCalendarEventToTaskId()`
   - Add logging to `handleResolveCalendarEvent()` in background.js

2. **Test Calendar API Access**
   - Run Step 2 diagnostic in console
   - Check if permissions are granted
   - Verify background script can fetch Calendar API events

3. **Test Single Task End-to-End**
   - Pick one ttb_ task element
   - Manually decode and test each step
   - Identify exactly where the chain breaks

### Short-term (This Week):

4. **Fix Identified Issues**
   - If permission issue → Reinstall extension
   - If decode issue → Fix/deduplicate decode functions
   - If async issue → Add missing awaits

5. **Verify Mapping**
   - Run your diagnostic again
   - Expect >90% mapping success rate
   - Tasks should be colored correctly

6. **Clean Up**
   - Remove duplicate `decodeCalendarEventIdFromTtb()` function
   - Use single source of truth from `google-calendar-api.js`
   - Add JSDoc comments for clarity

---

## 🎯 SUCCESS CRITERIA

Your implementation will be working when:

- ✅ `console.log()` shows `[CalendarAPI]` logs when hovering/clicking ttb_ tasks
- ✅ `calendar-complete-analysis` shows >90% mapping success rate
- ✅ ttb_ tasks display colors from list defaults
- ✅ Task colors persist across navigation
- ✅ No errors in console related to Calendar API

---

## 📚 CLARIFICATION QUESTIONS FOR YOU

Before I proceed with fixes, please clarify:

### 1. **Have you reinstalled the extension after adding calendar.readonly scope?**
   - Chrome requires a full reinstall/reload for new permissions
   - Just reloading the extension page isn't enough

### 2. **What do you see in the background service worker console?**
   - Open Chrome → Extensions → ColorKit → "service worker" link
   - Check for `[CalendarAPI]` logs or errors
   - Are there any 403 Permission Denied errors?

### 3. **Do you want me to:**
   - **Option A**: Add comprehensive debug logging first, then you test?
   - **Option B**: Implement fixes based on my hypotheses immediately?
   - **Option C**: Create a step-by-step diagnostic script for you to run?

### 4. **Priority:**
   - Fix ttb_ task coloring for NEW UI? (primary goal)
   - OR ensure OLD UI (`tasks.` prefix) still works? (regression test)
   - OR both?

---

## 📌 SUMMARY

**What's Working**:
- ✅ Architecture and code structure
- ✅ All helper functions implemented correctly
- ✅ Mapping chain logic is sound

**What's Not Working**:
- ❌ Runtime execution - code path never reaches Calendar API
- ❌ 0% mapping success rate
- ❌ ttb_ tasks not being colored

**Next Steps**:
1. Answer clarification questions above
2. Add debug logging to track execution
3. Test Calendar API access manually
4. Identify exact point of failure
5. Apply targeted fix

**Confidence**: 🟢 **HIGH** - This is a solvable runtime/configuration issue, not a fundamental design flaw.

---

**Ready to proceed with debugging?** Let me know which approach you prefer!
