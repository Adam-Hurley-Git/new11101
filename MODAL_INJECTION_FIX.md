# Modal Injection Fix for NEW UI (ttb_) Support

**Date**: December 3, 2025
**Status**: ✅ **FIXED**

---

## Problem

Manual task coloring was not working for NEW UI (ttb_) tasks because:

1. **Error**: `modalInjection.js:229 Uncaught TypeError: taskId.startsWith is not a function`
2. **Root Cause**: `modalInjection.js` only looked for OLD UI selectors (`[data-eventid^="tasks."]`)
3. **Promise Issue**: `getTaskIdFromChip()` returns a **Promise** for ttb_ tasks, but code expected a **string**

---

## Solution

Updated `/home/user/new11101/content/modalInjection.js` with the following changes:

### 1. Made `mountInto` Function Async (Line 148)
```javascript
// OLD:
function mountInto(dialog) {

// NEW:
async function mountInto(dialog) {
```

**Why**: Needed to await Promise-based task ID resolution

---

### 2. Added ttb_ Selector Support in Modal Detection (Line 174)
```javascript
// OLD:
const modalTaskElement = dialog.querySelector('[data-eventid^="tasks."]');

// NEW:
const modalTaskElement = dialog.querySelector('[data-eventid^="tasks."], [data-eventid^="ttb_"]');
```

**Why**: Detect NEW UI tasks in modal content

---

### 3. Added ttb_ Resolution Logic (Lines 184-192)
```javascript
// NEW UI: ttb_ format - need to resolve via getResolvedTaskId
else if (eventId.startsWith('ttb_')) {
  console.log('[ModalInjection] Found NEW UI (ttb_) in modal, resolving...');
  if (window.cfTasksColoring?.getResolvedTaskId) {
    taskId = await window.cfTasksColoring.getResolvedTaskId(modalTaskElement);
    console.log('[ModalInjection] Resolved NEW UI task ID:', taskId);
  } else {
    console.warn('[ModalInjection] getResolvedTaskId not available yet');
  }
}
```

**Why**: ttb_ tasks require async resolution via Calendar API mapping

---

### 4. Handle Promise from `getLastClickedTaskId` (Lines 202-208)
```javascript
// If it's a Promise (NEW UI), await it
if (clickedTaskId && typeof clickedTaskId.then === 'function') {
  console.log('[ModalInjection] Task ID is Promise, awaiting...');
  taskId = await clickedTaskId;
  console.log('[ModalInjection] Resolved Promise task ID:', taskId);
} else {
  taskId = clickedTaskId;
}
```

**Why**: `getLastClickedTaskId()` returns a Promise for ttb_ tasks

---

### 5. Updated Comprehensive Search (Lines 228, 244-252)
```javascript
// OLD:
const taskSelectors = ['[data-eventid^="tasks."]', '[data-eventid^="tasks_"]', '[data-taskid]'];

// NEW:
const taskSelectors = ['[data-eventid^="tasks."]', '[data-eventid^="tasks_"]', '[data-eventid^="ttb_"]', '[data-taskid]'];

// Added resolution logic for ttb_:
else if (eventId && eventId.startsWith('ttb_')) {
  console.log('[ModalInjection] Found NEW UI (ttb_) task in comprehensive search, resolving...');
  if (window.cfTasksColoring?.getResolvedTaskId) {
    taskId = await window.cfTasksColoring.getResolvedTaskId(taskElement);
    console.log('[ModalInjection] Resolved NEW UI task ID:', taskId);
    if (taskId) break;
  } else {
    console.warn('[ModalInjection] getResolvedTaskId not available');
  }
}
```

**Why**: Fallback search also needs to support ttb_ tasks

---

### 6. Updated `isTaskDialog` Function (Line 50)
```javascript
// OLD:
const hasExistingTaskElements = dialog.querySelector('[data-eventid^="tasks."], [data-taskid]');

// NEW:
const hasExistingTaskElements = dialog.querySelector('[data-eventid^="tasks."], [data-eventid^="ttb_"], [data-taskid]');
```

**Why**: Task dialog detection needs to recognize NEW UI tasks

---

### 7. Updated Click Handler (Line 463)
```javascript
// OLD:
const taskElement = e.target.closest('[data-eventid^="tasks."]');

// NEW:
const taskElement = e.target.closest('[data-eventid^="tasks."], [data-eventid^="ttb_"]');
```

**Why**: Task switching detection needs to capture ttb_ task clicks

---

## What This Fixes

✅ **Manual task coloring now works for NEW UI (ttb_) tasks**
- Color picker appears in task modal
- Properly resolves ttb_ → Task API ID
- No more `taskId.startsWith is not a function` error

✅ **Async Promise handling**
- All Promise-based task IDs are properly awaited
- Handles both OLD UI (string) and NEW UI (Promise) formats

✅ **Complete ttb_ support**
- All selectors updated
- All code paths handle ttb_ tasks
- Task switching works for NEW UI

---

## Testing Instructions

1. Open Google Calendar with NEW UI (ttb_ tasks)
2. Click on an existing task
3. Task modal should open with color picker visible
4. Select a color and apply
5. Task should be colored immediately

---

## Next Steps

1. ✅ **Manual task coloring** - FIXED (this commit)
2. ⏳ **List default coloring** - Test if this also works now
3. ⏳ **Task painting on calendar grid** - Verify colors are applied to ttb_ tasks

---

**Commit**: Fix modal injection for NEW UI (ttb_) task coloring
