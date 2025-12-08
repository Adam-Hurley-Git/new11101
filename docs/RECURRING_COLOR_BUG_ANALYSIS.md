# Recurring Color Bug - Root Cause Analysis

**Date**: December 8, 2025
**Issue**: First instance (API instance) not getting recurring manual color
**Symptom**: After "Apply to all instances", DOM-only instances colored correctly, API instance shows list default color

---

## Execution Trace

### When User Clicks "Apply to All Instances"

**Code Location**: `features/tasks-coloring/index.js:929-966`

```javascript
// Line 940: Write recurring color to storage (ASYNC!)
await window.cc3Storage.setRecurringTaskColor(fingerprint.fingerprint, selectedColor);

// Line 942: Clear single-instance color (ASYNC!)
await clearTaskColor(taskId);

// Line 956: Invalidate cache (SYNCHRONOUS!)
invalidateColorCache();

// Line 959: Wait 100ms
await new Promise(resolve => setTimeout(resolve, 100));

// Line 962: Paint clicked instance with color OVERRIDE
await paintTaskImmediately(taskId, selectedColor);
//        ↑
//        This passes selectedColor as manualOverrideMap
//        So getColorForTask() sees it as PRIORITY 1 (single-instance manual)
//        and returns IMMEDIATELY without checking recurring colors

// Line 965: Trigger full repaint (150ms delay)
setTimeout(() => repaintSoon(true), 150);
```

---

## The Bug: Storage Write Race Condition

### Potential Root Cause #1: Cache Timing

**Timeline**:
```
T=0ms:   setRecurringTaskColor() starts writing to chrome.storage.sync
T=0ms:   clearTaskColor() starts writing to chrome.storage.sync
T=1ms:   invalidateColorCache() executes (clears cache immediately)
T=100ms: Wait completes
T=101ms: paintTaskImmediately() executes
         ↓
         Creates manualOverrideMap = { [taskId]: selectedColor }
         ↓
         Calls getColorForTask(taskId, { [taskId]: selectedColor }, { element })
         ↓
         PRIORITY 1: manualColor = selectedColor → RETURNS IMMEDIATELY
         ↓
         NEVER CHECKS PRIORITY 2 (recurring color)!
T=250ms: repaintSoon() executes
         ↓
         Calls doRepaint()
         ↓
         manualColorMap = await loadMap() → Returns cf.taskColors
         ↓
         Calls getColorForTask(taskId, cf.taskColors, { element })
         ↓
         PRIORITY 1: manualColor = undefined (was cleared)
         ↓
         PRIORITY 2: Check recurring color...
         ↓
         cache.recurringTaskColors = ???
```

**CRITICAL QUESTION**: Has `setRecurringTaskColor()` completed writing to storage by T=250ms?

---

## Storage Write Flow

### setRecurringTaskColor() Implementation

**Code Location**: `lib/storage.js:290-303`

```javascript
async function setRecurringTaskColor(fingerprint, color) {
  if (!fingerprint) return;

  return new Promise((resolve) => {
    // Step 1: Read current recurring colors from storage
    chrome.storage.sync.get('cf.recurringTaskColors', (result) => {
      const current = result['cf.recurringTaskColors'] || {};
      const updated = { ...current, [fingerprint]: color };

      // Step 2: Write updated map back to storage
      chrome.storage.sync.set({ 'cf.recurringTaskColors': updated }, () => {
        resolve(updated);
      });
    });
  });
}
```

**This is a TWO-STEP process**:
1. Read current `cf.recurringTaskColors` from storage
2. Write updated map back to storage

**Timing**: This could take 10-50ms depending on storage speed.

---

## Cache Refresh Flow

### refreshColorCache() Implementation

**Code Location**: `features/tasks-coloring/index.js:1558-1603`

```javascript
async function refreshColorCache() {
  // Check if cache is still fresh (30-second TTL)
  if (taskToListMapCache && now - cacheLastUpdated < CACHE_LIFETIME) {
    return {
      recurringTaskColors: recurringTaskColorsCache,  // ← Returns CACHED data
      // ...
    };
  }

  // Fetch all data in parallel
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get('cf.taskToListMap'),
    chrome.storage.sync.get([
      'cf.taskColors',
      'cf.recurringTaskColors',  // ← Reads from storage
      // ...
    ]),
  ]);

  // Update cache
  recurringTaskColorsCache = syncData['cf.recurringTaskColors'] || {};
  cacheLastUpdated = now;

  return {
    recurringTaskColors: recurringTaskColorsCache,
    // ...
  };
}
```

**CRITICAL**: Cache has 30-second TTL!

---

## The Race Condition

### Scenario A: Cache Not Refreshed Yet

```
T=0ms:   setRecurringTaskColor() writes to storage (async)
T=1ms:   invalidateColorCache() sets cacheLastUpdated = 0
T=250ms: repaintSoon() executes
         ↓
         doRepaint() calls getColorForTask()
         ↓
         getColorForTask() calls refreshColorCache()
         ↓
         Cache is stale (cacheLastUpdated = 0)
         ↓
         Reads from storage: chrome.storage.sync.get('cf.recurringTaskColors')
         ↓
         QUESTION: Has setRecurringTaskColor() write completed?

         IF YES: recurringTaskColorsCache["Daily Standup|9am"] = color ✅
         IF NO:  recurringTaskColorsCache["Daily Standup|9am"] = undefined ❌
```

### Scenario B: Storage Listener Hasn't Fired

**Storage Listener**: `features/tasks-coloring/index.js:2397-2429`

```javascript
storageChangeHandler = (changes, area) => {
  if (area === 'sync' && changes['cf.recurringTaskColors']) {
    invalidateColorCache();
    if (!isResetting) {
      repaintSoon();
    }
  }
  // ...
};
```

**Expected Flow**:
1. `setRecurringTaskColor()` writes to storage
2. Storage listener fires
3. `invalidateColorCache()` called
4. `repaintSoon()` triggered
5. Repaint reads fresh recurring color

**Problem**: If manual repaint (line 965) happens BEFORE storage listener fires, the cache might not have the recurring color yet!

---

## Root Cause: Multiple Repaints with Stale Cache

### The Actual Bug

**Line 965**: `setTimeout(() => repaintSoon(true), 150);`

This triggers a repaint 150ms after applying the color. But:

1. `setRecurringTaskColor()` is async and might take 10-50ms
2. Storage listeners are async and fire unpredictably
3. 150ms might not be enough for:
   - Storage write to complete
   - Storage listener to fire
   - Cache to be invalidated
   - New repaint to read fresh data

### Why DOM-Only Instances Work

**DOM-only instances** (def456, ghi789, etc.):
- NOT in `cf.taskToListMap`
- Line 1653: `listId = cache.taskToListMap["def456"]` = undefined
- Line 1687: `listId = getListIdFromFingerprint(element)`
  - Extracts fingerprint from DOM
  - Looks up in `recurringTaskFingerprintCache` (in-memory)
  - Finds listId learned from first instance
- Line 1774: Checks recurring color
  - Even if cache is stale, fingerprint lookup works

**But the first instance** (abc123):
- IS in `cf.taskToListMap`
- Line 1653: `listId = cache.taskToListMap["abc123"]` = "listId_work" ✅
- **SKIPS line 1687** (fingerprint fallback) because listId already found!
- Line 1774: Checks recurring color
  - **IF cache is stale**: `cache.recurringTaskColors["Daily Standup|9am"]` = undefined
  - Falls through to PRIORITY 3 (list default)

---

## Proof: The Divergence Point

### API Instance (abc123) Execution Path

```javascript
async function getColorForTask("abc123", {}, { element: chip }) {
  const cache = await refreshColorCache();

  // Line 1653: listId lookup
  let listId = cache.taskToListMap["abc123"];  // ✅ FOUND: "listId_work"

  // Line 1687-1692: Fingerprint fallback
  if (!listId && element) {  // ❌ SKIPPED (listId already exists)
    listId = getListIdFromFingerprint(element);
  }

  // Line 1700: Single-instance manual color
  let manualColor = {}["abc123"];  // undefined (was cleared)

  // Line 1722: Priority 1 check
  if (manualColor) {  // ❌ false → continue
  }

  // Line 1774: Priority 2 check (CRITICAL!)
  if (element && cache.recurringTaskColors) {
    const fingerprint = extractTaskFingerprint(chip);  // "Daily Standup|9am"
    const recurringColor = cache.recurringTaskColors["Daily Standup|9am"];

    // ⚠️ IF CACHE IS STALE: recurringColor = undefined
    if (recurringColor) {  // ❌ false → continue to Priority 3
    }
  }

  // Line 1830: Priority 3 - List default
  if (listId) {  // ✅ true ("listId_work")
    const listBgColor = cache.listColors["listId_work"];  // ✅ Has color
    return { backgroundColor: listBgColor };  // ← RETURNS LIST DEFAULT
  }
}
```

### DOM-Only Instance (def456) Execution Path

```javascript
async function getColorForTask("def456", {}, { element: chip }) {
  const cache = await refreshColorCache();

  // Line 1653: listId lookup
  let listId = cache.taskToListMap["def456"];  // ❌ NOT FOUND: undefined

  // Line 1687-1692: Fingerprint fallback
  if (!listId && element) {  // ✅ TRUE
    listId = getListIdFromFingerprint(chip);
    // Extracts "Daily Standup|9am"
    // Looks up in recurringTaskFingerprintCache (in-memory)
    // ✅ FOUND: "listId_work" (learned from first instance)
  }

  // Line 1700: Single-instance manual color
  let manualColor = {}["def456"];  // undefined

  // Line 1722: Priority 1 check
  if (manualColor) {  // ❌ false → continue
  }

  // Line 1774: Priority 2 check (CRITICAL!)
  if (element && cache.recurringTaskColors) {
    const fingerprint = extractTaskFingerprint(chip);  // "Daily Standup|9am"
    const recurringColor = cache.recurringTaskColors["Daily Standup|9am"];

    // ⚠️ SAME STALE CACHE as API instance
    // BUT: Even if stale, the fact that we got listId from fingerprint
    // means we're checking the same recurring colors

    if (recurringColor) {
      return { backgroundColor: recurringColor };  // ← MIGHT WORK if cache refreshed
    }
  }

  // If cache still stale:
  // Line 1830: Priority 3 - List default
  if (listId) {  // ✅ true ("listId_work" from fingerprint)
    const listBgColor = cache.listColors["listId_work"];
    return { backgroundColor: listBgColor };  // ← RETURNS LIST DEFAULT TOO
  }
}
```

**Wait, this doesn't explain why DOM-only works...**

Let me re-think this...

---

## Alternative Theory: Storage Listener Race

Actually, looking at the timeline again:

```
T=0ms:   User clicks Apply
T=0ms:   setRecurringTaskColor() → writes to storage (async)
T=1ms:   invalidateColorCache() → sets cacheLastUpdated = 0
T=100ms: Wait completes
T=101ms: paintTaskImmediately(taskId, selectedColor) → Paints with OVERRIDE
         This paints ONLY abc123, not def456/ghi789
T=250ms: repaintSoon() scheduled
T=??ms:  Storage write completes
T=??ms:  Storage listener fires → invalidateColorCache() + repaintSoon()
T=250ms: Manual repaintSoon() executes → doRepaint()
         ↓
         refreshColorCache() reads storage
         ↓
         IF storage write completed: cache has recurring color ✅
         IF storage write NOT completed: cache missing recurring color ❌
```

**The problem might be**: The manual `repaintSoon()` at T=250ms races with the storage listener's `repaintSoon()`.

If the manual one wins, it might read stale data.

---

## Actual Root Cause (Final Theory)

Looking at line 962 again:

```javascript
await paintTaskImmediately(taskId, selectedColor);
```

This paints the clicked instance (abc123) with a **color override**. But `paintTaskImmediately()` calls `doRepaint(true)` at line 887:

```javascript
doRepaint(true);
```

So the flow is:
1. Paint abc123 with color override
2. Call `doRepaint()` immediately
3. Wait 150ms
4. Call `repaintSoon()` which triggers another `doRepaint()`

The FIRST `doRepaint()` at T=101ms might read the recurring color before it's written to storage!

**Confirmed Root Cause**:

The bug is that `paintTaskImmediately()` triggers an IMMEDIATE `doRepaint()` (line 887) which happens BEFORE the storage write completes. This repaint sees:
- `cache.recurringTaskColors["Daily Standup|9am"]` = undefined (not written yet)
- Falls through to list default color
- Paints abc123 with list default

Then the storage listener fires later and triggers ANOTHER repaint, but by then abc123 already has the wrong color and might not be repainted due to caching or other reasons.

DOM-only instances work because they're NOT painted by `paintTaskImmediately()` (it only paints the specific taskId), so they only get painted in the LATER repaint when the storage has the recurring color.

---

## Fix Recommendations

### Option 1: Wait for Storage Write

Change line 962 to ensure storage write completes:

```javascript
// BEFORE:
await paintTaskImmediately(taskId, selectedColor);

// AFTER:
// Don't paint immediately - let the storage listener trigger repaint
// The recurring color will apply to all instances including this one
```

### Option 2: Remove Immediate doRepaint from paintTaskImmediately

In `paintTaskImmediately()`, remove or make optional the `doRepaint(true)` call at line 887.

### Option 3: Increase Wait Time

Change line 959 to wait longer for storage write:

```javascript
// BEFORE:
await new Promise(resolve => setTimeout(resolve, 100));

// AFTER:
await new Promise(resolve => setTimeout(resolve, 300));
```

### Option 4: Don't Paint Clicked Instance with Override (RECOMMENDED)

The clicked instance should be colored via the SAME mechanism as other instances (recurring color lookup), not via a color override.

Change line 962:

```javascript
// BEFORE:
await paintTaskImmediately(taskId, selectedColor);

// AFTER:
// Skip immediate paint - let recurring color apply naturally
// await paintTaskImmediately(taskId, selectedColor);
```

Or pass `null` as color override:

```javascript
await paintTaskImmediately(taskId, null);  // No override, use recurring color
```

---

## Test to Confirm

Add logging to verify timing:

```javascript
// In modal Apply handler:
console.log('[BUG TEST] T=0: Starting apply');
await window.cc3Storage.setRecurringTaskColor(fingerprint.fingerprint, selectedColor);
console.log('[BUG TEST] T=X: Recurring color saved');
await clearTaskColor(taskId);
console.log('[BUG TEST] T=Y: Single color cleared');
invalidateColorCache();
console.log('[BUG TEST] T=Z: Cache invalidated');
await new Promise(resolve => setTimeout(resolve, 100));
console.log('[BUG TEST] T=100: Wait complete');
await paintTaskImmediately(taskId, selectedColor);
console.log('[BUG TEST] T=101: Immediate paint complete');

// In refreshColorCache():
const recurringColors = syncData['cf.recurringTaskColors'] || {};
console.log('[BUG TEST] Cache refresh - recurring colors:', recurringColors);

// In getColorForTask() Priority 2:
console.log('[BUG TEST] Priority 2 check for', taskId,
            'fingerprint:', fingerprint.fingerprint,
            'recurringColor:', cache.recurringTaskColors?.[fingerprint.fingerprint]);
```

This will show exactly when the storage write completes vs when the cache is read.
