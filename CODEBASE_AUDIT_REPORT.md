# ColorKit Extension - Codebase Audit Report

**Date**: November 20, 2025
**Auditor**: Claude Code
**Version Audited**: 0.0.3

---

## Executive Summary

Comprehensive audit of the ColorKit Chrome extension codebase identified **40 issues** across critical systems:

| Severity | Count | Category |
|----------|-------|----------|
| CRITICAL | 4 | Silent failures, memory leaks |
| HIGH | 11 | Race conditions, data corruption |
| MEDIUM | 18 | Performance, validation, code quality |
| LOW | 7 | Code smells, documentation |

**Top Priority Fixes Required:**
1. Promise rejection handling in storage.js (silent failures)
2. Listener accumulation memory leaks
3. Fetch timeout implementation
4. Async handler fixes in background.js

---

## CRITICAL Issues (Fix Immediately)

### 1. Promise Callbacks Never Reject - Silent Failures
**File**: `lib/storage.js`
**Lines**: 145, 156, 289, 328, 360, 368, 417, 426, 741, 749, 757

Chrome Storage API callbacks are wrapped in Promises without reject handlers. If API fails, functions hang indefinitely or return undefined.

**Affected Functions**:
- `getSettings()`, `setSettings()`
- `setTaskListDefaultColor()`, `clearTaskListDefaultColor()`
- `getTaskListColors()`, `getTaskListTextColors()`
- `getTaskListsMeta()`, `getTaskToListMap()`
- `get()`, `set()`, `getAll()`

**Current Code** (line 144-149):
```javascript
async function getSettings() {
  return new Promise((resolve) => {  // NO REJECT
    chrome.storage.sync.get({ settings: defaultSettings }, (res) => {
      resolve(deepMerge(defaultSettings, res.settings || {}));
    });
  });
}
```

**Fix**:
```javascript
async function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get({ settings: defaultSettings }, (res) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(deepMerge(defaultSettings, res.settings || {}));
    });
  });
}
```

---

### 2. Listener Accumulation Memory Leak
**File**: `lib/storage.js`
**Lines**: 160-170

`onSettingsChanged()` adds new listeners without removal mechanism. In long-running content scripts, listeners accumulate causing memory leaks and duplicate callback executions.

**Current Code**:
```javascript
function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    const { newValue } = changes.settings;
    if (newValue) callback(newValue);
  });
}
```

**Fix**:
```javascript
function onSettingsChanged(callback) {
  const listener = (changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    const { newValue } = changes.settings;
    if (newValue) callback(newValue);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
```

---

### 3. Unhandled Async in onMessageExternal
**File**: `background.js`
**Lines**: 131-144

`handleWebAppMessage()` is async but not awaited. Response sent before auth/payment operations complete, causing race conditions.

**Current Code**:
```javascript
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (sender.url && sender.url.startsWith(CONFIG.WEB_APP_URL)) {
    handleWebAppMessage(message);  // ASYNC NOT AWAITED
    sendResponse({ received: true, status: 'success' });
  }
  return true;
});
```

**Fix**:
```javascript
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (sender.url && sender.url.startsWith(CONFIG.WEB_APP_URL)) {
    handleWebAppMessage(message)
      .then(() => sendResponse({ received: true, status: 'success' }))
      .catch(err => sendResponse({ received: false, error: err.message }));
    return true;  // Keep channel open for async response
  }
  return false;
});
```

---

### 4. Modal Injection - Untracked Timeouts
**File**: `content/modalInjection.js`
**Lines**: 249-277

Up to 30 nested setTimeout calls per modal open, never cleaned up. Accumulates on rapid task switching.

**Fix**: Store timeout IDs and clear on modal close/switch.

---

## HIGH Priority Issues

### 5. No Timeout on API Calls
**File**: `lib/google-tasks-api.js`
**Lines**: 114, 167, 241, 301

All `fetch()` calls have no timeout. If Google API hangs, entire extension freezes.

**Fix**: Add AbortController with 5-10 second timeout:
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);
try {
  const response = await fetch(url, { signal: controller.signal, ... });
} finally {
  clearTimeout(timeout);
}
```

---

### 6. Dual-Key Storage Inconsistency
**File**: `lib/storage.js`
**Lines**: 314-315, 376

Text colors written to both `cf.taskListTextColors` AND `settings.taskListColoring.pendingTextColors`. If one write fails, data becomes inconsistent.

**Fix**: Use single source of truth. Remove duplicate storage key.

---

### 7. Cache Read-Modify-Write Race Condition
**File**: `lib/google-tasks-api.js`
**Lines**: 528-530, 562-564

Concurrent task lookups can overwrite each other's cache updates:
```javascript
const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get(...);
const updatedMapping = { ...(mapping || {}), [taskId]: listId };
await chrome.storage.local.set({ 'cf.taskToListMap': updatedMapping });
```

**Fix**: Use atomic update or locking mechanism.

---

### 8. Nested Callback Race Condition
**File**: `lib/storage.js`
**Lines**: 382-413

`getDefaultColorForTask()` nests Chrome API callbacks without error handling. If outer call fails, Promise hangs forever.

---

### 9. USER_ACTIVITY Handler Not Awaited
**File**: `background.js`
**Line**: 220

`updatePollingState()` is async but called without await. Response sent before alarm operations complete.

---

### 10. Missing Error Handlers on Alarms
**File**: `background.js`
**Lines**: 978, 983-992

Alarm create/delete operations have no try-catch. Silent failures cause polling to stop.

---

### 11. Day Coloring - Multiple Active Intervals
**File**: `features/calendar-coloring/core/dayColoring.js`
**Lines**: 825-841, 951-968

`setInterval` instances not cleared when settings change. Creates runaway timers.

---

### 12. Activity Tracking Listeners Never Removed
**File**: `content/index.js`
**Lines**: 145-161

Click, keydown, visibility listeners persist even when extension disabled.

---

### 13. Toolbar Storage Listener Accumulation
**File**: `content/toolbar.js`
**Lines**: 127-130

Storage change listener accumulates on each mount/unmount cycle.

---

### 14. No Validation of Decoded Task IDs
**File**: `lib/google-tasks-api.js`
**Lines**: 364-372, 434-438, 507-510, 541-544

Base64 decoding used without UTF-8 validation. Could store binary garbage as task IDs.

---

### 15. Inconsistent Opacity Validation
**File**: `lib/storage.js`
**Lines**: 186, 518, 544, 552

Opacity functions accept invalid values (NaN, negative, >100) without validation.

---

## MEDIUM Priority Issues

### 16. Missing Return Type Consistency
**File**: `lib/storage.js`
**Lines**: 286, 303, 325, 343, 444, 469, 494, 519, 545, 571, 595

Functions return `undefined` on early exit instead of Promise. Causes await to hang.

### 17. Token Lock Bypass
**File**: `lib/google-tasks-api.js`
**Lines**: 32-62

Token fetch lock doesn't fully prevent concurrent requests in all scenarios.

### 18. Unvalidated Token Refresh
**File**: `lib/subscription-validator.js`
**Line**: 141

`CONFIG.SUPABASE_ANON_KEY` could be undefined, sending empty string to API.

### 19. Polling Interval Documentation Mismatch
**File**: `background.js`
**Lines**: 982, 988

CLAUDE.md says 1min/5min polling, code does 5min/15min.

### 20. Incomplete applyListColorToExistingTasks
**File**: `background.js`
**Lines**: 893-934

Loop counts tasks but doesn't actually apply colors. Returns misleading count.

### 21. Concurrent State Transitions
**File**: `background.js`
**Lines**: 955-973

`updatePollingState()` called from multiple places without serialization.

### 22. Debug Code in Production
**File**: `features/calendar-coloring/core/dayColoring.js`
**Lines**: 102-141

`debugDayViewStructure()` logs extensively, should be removed or gated.

### 23. Day View Periodic Reapply
**File**: `features/calendar-coloring/core/dayColoring.js`
**Lines**: 951-968

Forces DOM repainting every 2 seconds unnecessarily.

### 24. Function Property State
**File**: `features/calendar-coloring/core/dayColoring.js`
**Line**: 327

Using `paint.__raf` to store state on function object is anti-pattern.

### 25. Modal Race Condition
**File**: `content/modalInjection.js`
**Lines**: 144-310

Color picker injection happens asynchronously while task changes.

### 26. Settings Change Overlap
**File**: `features/calendar-coloring/core/dayColoring.js`
**Lines**: 1066-1141

Multiple observers can be created before old ones cleaned up.

### 27. DOM Element Timeout Storage
**File**: Multiple locations

Timeouts stored on DOM elements prevent garbage collection.

### 28. Feature Registry Missing Disable
**File**: `content/featureRegistry.js`

No mechanism to cleanly disable/teardown features.

### 29. Column CSS Observer Always Running
**File**: `features/columnCss.js`

MutationObserver continues running even when feature disabled.

### 30. Month Coloring Global Resize Listener
**File**: `features/calendar-coloring/core/monthColoring.js`

Global resize listener never removed.

### 31. Incomplete Merge Validation
**File**: `lib/storage.js`
**Lines**: 112-114

`deepMerge()` silently accepts primitives instead of objects.

### 32. Misleading Error Messages
**File**: `lib/google-tasks-api.js`
**Lines**: 121-126

Comment says "retry once" but function doesn't actually retry.

---

## LOW Priority Issues

### 33. Dead Code in REPLACE_KEYS
**File**: `lib/storage.js`
**Line**: 105

`'textColors'` key never initialized in defaultSettings.

### 34. Redundant Return Statement
**File**: `background.js`
**Line**: 240

Outer `return true` after switch statement is redundant.

### 35-40. Minor Code Quality Issues
- Inconsistent naming conventions
- Missing JSDoc comments
- Unused imports
- Console.log statements in production
- Magic numbers without constants

---

## Recommendations

### Immediate Actions (Week 1)
1. Add `chrome.runtime.lastError` checks to all storage callbacks
2. Return unsubscribe functions from listener registrations
3. Add fetch timeouts with AbortController
4. Fix async handlers in background.js

### Short-term (Week 2-3)
1. Consolidate dual-key storage to single source of truth
2. Implement proper feature teardown in registry
3. Add input validation for opacity and color values
4. Clear intervals/timeouts on feature disable

### Medium-term (Month 1)
1. Add comprehensive error logging system
2. Implement proper state machine for polling
3. Add unit tests for storage and API modules
4. Performance audit with Chrome DevTools

---

## Files Requiring Most Attention

1. **lib/storage.js** - 15 issues (critical error handling)
2. **lib/google-tasks-api.js** - 8 issues (timeouts, validation)
3. **background.js** - 7 issues (async handling, alarms)
4. **features/calendar-coloring/core/dayColoring.js** - 5 issues (memory leaks)
5. **content/modalInjection.js** - 3 issues (timeout management)

---

## Conclusion

The codebase has solid architecture but significant gaps in error handling, resource cleanup, and input validation. The most critical issues are silent failures that can cause the extension to hang or behave unpredictably. Addressing the CRITICAL and HIGH priority issues should be the immediate focus before adding new features.

