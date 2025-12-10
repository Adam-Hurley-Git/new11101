# Deep Analysis: Recurring Task Color Bug

## Problem Statement
When setting a manual color with "Apply to all instances" checked:
- **First instance (from API)**: Shows list default color ❌
- **Other instances (DOM-only)**: Show correct recurring color ✅

All instances have the same fingerprint (e.g., "zfv|10:30pm").

## Analysis Plan

### 1. Storage Write Flow
**Goal**: Trace how recurring color is saved when "Apply to all instances" is clicked

**Code Path**:
```
User clicks "Apply" with "all instances" checked
  ↓
Line 943-944: Apply button handler
  ↓
await clearTaskColor(taskId);  // Clear single-instance color
  ↓
await window.cc3Storage.setRecurringTaskColor(fingerprint.fingerprint, selectedColor);
  ↓
lib/storage.js: setRecurringTaskColor()
  ↓
chrome.storage.sync.set({ 'cf.recurringTaskColors': updated })
  ↓
Storage listener fires at line 2441
```

**Questions**:
- Is the color actually saved to `cf.recurringTaskColors`?
- What is the fingerprint value?
- Does storage listener fire correctly?

### 2. Storage Read Flow
**Goal**: Trace how colors are retrieved during repaint

**Code Path**:
```
doRepaint() called
  ↓
Line 2096/2132: getColorForTask(id, null, { element: chip, isCompleted })
  ↓
refreshColorCache() - reads cf.recurringTaskColors
  ↓
Priority checks in getColorForTask()
```

**Questions**:
- Is `cf.recurringTaskColors` properly loaded into cache?
- What does the cache contain?
- Is the fingerprint key present in cache?

### 3. Priority Resolution in getColorForTask()
**Goal**: Trace EXACTLY what happens for first instance vs other instances

**Code Path for FIRST instance**:
```
getColorForTask(taskId, null, { element: chip, isCompleted })
  ↓
refreshColorCache() returns cache with recurringTaskColors
  ↓
PRIORITY 1 check: manualColors[taskId]
  - What is taskId?
  - Is it in manualColors?
  - Should it be? (We cleared it at line 943)
  ↓
PRIORITY 2 check: recurringTaskColors[fingerprint]
  - Does element exist?
  - Can extractTaskFingerprint() extract fingerprint?
  - Does fingerprint match storage key?
  - Is recurringColor found in cache?
  ↓
PRIORITY 3 check: listColors[listId]
  - Why does it reach here?
```

**Code Path for OTHER instances**:
```
Same path, but:
- Different taskId?
- Same fingerprint?
- Why does Priority 2 work for these?
```

### 4. Element Passing
**Goal**: Verify correct element is passed to getColorForTask

**Key Distinction**:
- `chip` = Container element with `data-eventid` and `.XuJrye` child
- `target` = Paint target from `getPaintTarget(chip)` (usually button)

**Question**:
- Is `chip` passed to getColorForTask? (YES - see line 2096, 2132)
- Does chip contain `.XuJrye`? (Must verify for first instance)
- Is extractTaskFingerprint() called on correct element?

### 5. Cache Invalidation
**Goal**: Check if cache is invalidated properly after setting recurring color

**Code Path**:
```
setRecurringTaskColor saves to storage
  ↓
Line 2441: Storage listener for cf.recurringTaskColors fires
  ↓
invalidateColorCache() - sets cacheLastUpdated = 0
  ↓
repaintSoon() - triggers doRepaint
  ↓
doRepaint calls refreshColorCache()
  ↓
Cache is stale (now - 0 < CACHE_LIFETIME is false)
  ↓
Re-reads from storage with new recurring color
```

**Questions**:
- Does invalidateColorCache() actually run?
- Is cache refreshed before getColorForTask is called?
- Does new recurring color appear in cache?

### 6. Repaint Trigger Flow
**Goal**: Trace all repaints that happen after setting recurring color

**Expected Flow**:
```
User clicks Apply
  ↓
Storage updated
  ↓
Line 2441: Storage listener fires
  ↓
repaintSoon() called
  ↓
Line 962: paintTaskImmediately(taskId, null) called
  ↓
Line 967: setTimeout(() => repaintSoon(true), 150)
```

**Questions**:
- How many repaints are triggered?
- In what order?
- Do they interfere with each other?
- Does paintTaskImmediately run BEFORE or AFTER storage listener repaint?

### 7. Key Difference Between Instances
**Goal**: Identify EXACTLY what differs between first and other instances

**Known Facts**:
- First instance: Has taskId in API data, has listId in taskToListMap
- Other instances: DOM-only, different taskIds, NO listId in taskToListMap

**Critical Question**:
- Does Priority 3 check ONLY fire for first instance because it has listId?
- Do other instances SKIP Priority 3 because they have no listId?
- If so, WHY does Priority 2 fail for first instance?

## Hypothesis to Test

**Hypothesis A**: Cache not refreshed before first repaint
- First repaint uses stale cache without new recurring color
- Later repaint refreshes cache with new recurring color
- First instance colored by first repaint, others by later repaint

**Hypothesis B**: Element passed to getColorForTask is wrong
- For first instance, wrong element passed (target instead of chip)
- Target doesn't contain `.XuJrye`, fingerprint extraction fails
- Falls through to Priority 3

**Hypothesis C**: Priority 2 check happens but fails silently
- Fingerprint extracted correctly
- But fingerprint doesn't match storage key (encoding issue?)
- Falls through to Priority 3

**Hypothesis D**: Race condition in storage updates
- clearTaskColor and setRecurringTaskColor trigger multiple storage events
- Storage listeners fire out of order
- First repaint sees intermediate state

**Hypothesis E**: First instance has single-instance color in cache
- Even though we call clearTaskColor, cache still has old value
- Priority 1 check finds stale manual color
- Never reaches Priority 2

## Next Steps

1. Add comprehensive logging to trace actual execution
2. Log cache contents before each priority check
3. Log which priority matches and why
4. Compare logs for first instance vs other instances
5. Identify exact divergence point
6. Fix based on evidence, not assumptions
