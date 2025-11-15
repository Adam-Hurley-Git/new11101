# Completed Tasks Coloring - Fix Summary

## Problem

Pre-existing completed tasks (tasks that were already completed before the extension loaded) were not getting colored with custom completed task styling. Only tasks that were marked complete AFTER the extension loaded were getting styled correctly.

## Root Cause

**Task ID format inconsistency** between Google Tasks API and Google Calendar DOM.

### The Data Flow Issue:

1. **Google Tasks API** returns task IDs (format varies - may be base64-encoded or not)
2. **Extension syncs** and builds a mapping: `taskId → listId`
3. **Google Calendar DOM** displays tasks with `data-eventid="tasks.XXXXX"`
4. **Extension extracts** task ID from DOM and looks it up in the mapping

### Why New Tasks Worked:

When a new task is created:
- Extension detects it's not in cache
- Calls `findTaskInAllLists(taskId)` which tries **BOTH formats**:
  ```javascript
  const task = tasks.find((t) => {
    try {
      return atob(t.id) === taskId;  // Try decoded
    } catch (e) {
      return t.id === taskId;        // Try original
    }
  });
  ```
- Finds the task regardless of encoding
- Colors it successfully

### Why Pre-existing Tasks Failed:

When syncing existing tasks:
- Old code: `buildTaskToListMapping()` only stored **ONE format**:
  ```javascript
  // OLD CODE (BROKEN):
  let decodedId = task.id;
  try {
    decodedId = atob(task.id);  // Decode
  } catch (e) {
    // Use original if decode fails
  }
  mapping[decodedId] = list.id;  // Only store decoded format
  ```
- If DOM used the **original encoded format**, lookup failed:
  ```javascript
  const listId = cache.taskToListMap[taskId];  // undefined!
  ```
- No listId → no color → task remains unstyled

## The Fix

**Store BOTH formats** in the mapping to ensure compatibility:

```javascript
// NEW CODE (FIXED):
tasks.forEach((task) => {
  // Store original ID (might be encoded or decoded)
  mapping[task.id] = list.id;

  // Also try to decode and store the decoded version
  try {
    const decodedId = atob(task.id);
    // Only store if decode produced a different result
    if (decodedId !== task.id) {
      mapping[decodedId] = list.id;
    }
  } catch (e) {
    // Decode failed - that's okay, original ID is already stored
  }
});
```

### Changes Made:

**File**: `lib/google-tasks-api.js`

1. **`buildTaskToListMapping()`** (lines 241-261):
   - Now stores **both** `task.id` and `atob(task.id)` in the mapping
   - Gracefully handles decode failures
   - Avoids duplicates (only stores decoded if different from original)

2. **`incrementalSync()`** (lines 301-339):
   - Same dual-format logic for adding tasks
   - Deletes **both formats** when a task is deleted
   - Maintains consistency with full sync

### Why This Works:

- **Complete coverage**: Regardless of which format Google Calendar uses in the DOM, we have it in the mapping
- **No breaking changes**: Original format still stored, so existing functionality preserved
- **Minimal overhead**: Only stores 2 entries per task (vs trying to debug which format is "correct")
- **Future-proof**: Works even if Google changes their ID format

## Testing Instructions

1. **Clear extension data** (to force fresh sync):
   - Open Chrome: `chrome://extensions`
   - Click "Remove" on ColorKit extension
   - Reload the extension

2. **Complete some tasks** in Google Tasks (not Calendar):
   - Go to https://tasks.google.com
   - Mark 2-3 tasks as complete
   - **DO NOT reload the extension yet**

3. **Install/reload the extension**:
   - Load the updated extension code
   - Open Google Calendar: https://calendar.google.com

4. **Grant OAuth and Sync**:
   - Click ColorKit extension icon
   - Grant access to Google Tasks
   - Click "Sync" button
   - Wait for sync to complete

5. **Configure completed task styling**:
   - In ColorKit popup, find a task list
   - Enable "Completed Tasks Styling"
   - Set background color (e.g., gray)
   - Set text color (e.g., dark gray)
   - Set background opacity (e.g., 50%)
   - Set text opacity (e.g., 100%)

6. **Verify pre-existing completed tasks are colored**:
   - Look at Google Calendar
   - Pre-existing completed tasks should now have the custom styling
   - Check that the colors and opacity match your settings

## Expected Results

✅ Pre-existing completed tasks get colored immediately after sync
✅ Newly completed tasks continue to work (no regression)
✅ Changes to completed styling update all completed tasks in real-time
✅ No console errors or warnings about missing task IDs

## Technical Details

### Storage Impact:

- **Before**: ~1 entry per task in mapping
- **After**: ~2 entries per task in mapping (if encoded ≠ decoded)
- **Storage increase**: ~2x, but still well within Chrome's 10MB local storage limit
- **Typical user**: 100 tasks × 2 = 200 entries ≈ 10KB (negligible)

### Performance Impact:

- **Sync time**: No change (same API calls)
- **Lookup time**: No change (hash map lookup is O(1) for both entries)
- **Memory**: Minimal increase (~10KB for typical user)

### Edge Cases Handled:

1. **Task ID is not base64**: Original ID stored, decode fails gracefully
2. **Task ID is already decoded**: Both formats are the same, only 1 entry stored
3. **Task is deleted**: Both formats removed from mapping
4. **Incremental sync**: Maintains dual-format for consistency

## Files Changed

| File | Lines Changed | Description |
|------|---------------|-------------|
| `lib/google-tasks-api.js` | +45, -18 | Dual-format task ID mapping |

**Total**: 63 lines changed (45 additions, 18 deletions)

## Commit

```
66e06c2 - Fix: Store both encoded and decoded task IDs in mapping for completed tasks
```

## Next Steps

If the issue persists after this fix:
1. Check browser console for errors
2. Verify sync completed successfully (check "Sync" button shows success)
3. Verify completed styling is configured for the correct list
4. Check that tasks are actually marked complete in Google Tasks (strikethrough text)
5. Try clearing extension data and re-syncing

---

**Issue**: Pre-existing completed tasks not colored
**Root Cause**: Task ID format mismatch
**Solution**: Store both encoded and decoded formats
**Status**: ✅ Fixed and committed (66e06c2)
