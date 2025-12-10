# TRUE ROOT CAUSE: Recurring Task Color Bug

## Problem
When setting a manual color with "Apply to all instances" checked:
- **First instance (from API)**: Shows list default color ❌
- **Other instances (DOM-only)**: Show correct recurring color ✅

## TRUE ROOT CAUSE (Found via Console Log Analysis)

Google Calendar DOM has **NESTED elements** with the SAME `data-eventid` attribute:

```html
<div data-eventid="tasks_CpmpnDyL3smswR0R">  <!-- Outer container -->
  <div class="XuJrye">task: mgc, Not completed, December 11, 2025, 7pm</div>
  <div data-eventid="tasks_CpmpnDyL3smswR0R">  <!-- Nested DIV -->
    <!-- No .XuJrye child here -->
  </div>
</div>
```

**Impact on `doRepaint()` function:**

```javascript
// Line 2166: Query ALL tasks
const calendarTasks = document.querySelectorAll('[data-eventid^="tasks_"]');

// This query returns BOTH elements:
// 1. Outer DIV (has .XuJrye child) ✅
// 2. Nested DIV (no .XuJrye child) ❌

for (const chip of calendarTasks) {
  const id = await getResolvedTaskId(chip);
  // Both elements have same taskId: "CpmpnDyL3smswR0R"

  const colors = await getColorForTask(id, null, { element: chip });
  // First call: element has .XuJrye → fingerprint extracted → Priority 2 matches ✅
  // Second call: element has NO .XuJrye → fingerprint fails → Falls to Priority 3 ❌
}
```

## Evidence from Console Logs

**Line 29988-30012 (First element - Works correctly):**
```
taskId: CpmpnDyL3smswR0R
Element tag: DIV
Element data-eventid: tasks_CpmpnDyL3smswR0R
Element has .XuJrye child: true
.XuJrye textContent: task: mgc, Not completed, December 11, 2025, 7pm
Fingerprint extraction result: {title: 'mgc', time: '7pm', fingerprint: 'mgc|7pm'}
Found recurring color: #ff6d01
✅ PRIORITY 2 MATCH - Will return recurring color: #ff6d01
```

**Line 30014-30035 (Second element - Fails):**
```
taskId: CpmpnDyL3smswR0R  ← SAME taskId
Element tag: DIV
Element data-eventid: tasks_CpmpnDyL3smswR0R  ← SAME data-eventid
Element has .XuJrye child: false  ← DIFFERENT element (nested DIV)
❌ PRIORITY 2 - Could not extract fingerprint
No listId, skipping Priority 3
RETURNING NULL (no color)
```

## Why This Affects First Instance Only

**First instance (from API)**:
- Has listId in `taskToListMap`
- Gets colored by Priority 2 (recurring color) on first pass ✅
- Gets RE-COLORED by Priority 3 (list default) on second pass ❌
- Second pass overwrites first pass because `applyPaint()` changes DOM

**Other instances (DOM-only)**:
- NO listId in `taskToListMap`
- Gets colored by Priority 2 (recurring color) on first pass ✅
- Second pass returns NULL (no listId, so Priority 3 skipped)
- NULL color doesn't overwrite existing color ✅

## The Fix

**Option 1: Skip duplicate taskIds (Recommended)**

Add check in second loop to skip tasks already processed:

```javascript
for (const chip of calendarTasks) {
  const id = await getResolvedTaskId(chip);

  if (id) {
    // CRITICAL: Skip if already processed
    if (processedTaskIds.has(id)) {
      continue;
    }

    // ... rest of processing
  }
}
```

This prevents the nested DIV from overwriting the color set by the outer DIV.

**Why Previous Fixes Didn't Work:**

1. **Removed `doRepaint()` from `paintTaskImmediately()`** - Didn't help because double-processing happens in the main `doRepaint()` loop, not from `paintTaskImmediately()`

2. **Changed `paintTaskImmediately()` to pass `null` color** - Didn't help because the bug is in `doRepaint()`, not `paintTaskImmediately()`

3. **Removed delayed `repaintSoon()` calls** - Didn't help because the bug occurs in a single `doRepaint()` call, not across multiple repaints

4. **Swapped order of clear/set operations** - Didn't help because the issue is double-processing, not storage listener race conditions

5. **Stopped passing `manualColorMap` to `getColorForTask()`** - Didn't help because both passes use the same cache, so both see the same data

6. **Changed priority order** - Wrong approach, priorities are correct

All fixes failed because they addressed symptoms, not the root cause: **duplicate element processing**.

## Test After Fix

Expected behavior:
- Each unique taskId processed exactly ONCE per `doRepaint()` cycle
- No nested element re-coloring
- First instance shows recurring color ✅
- All other instances show recurring color ✅
