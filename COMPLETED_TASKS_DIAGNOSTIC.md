# Completed Tasks Coloring - Diagnostic Guide

## Problem Statement
Pre-existing completed tasks (tasks that were already completed before the extension loaded) are not getting colored with the custom completed task styling. Only tasks that are marked complete AFTER the extension loads get the styling applied.

## What We Need to Find Out

The data flow has multiple potential failure points:
1. **API Sync**: Are completed tasks being fetched from Google Tasks API?
2. **Task Mapping**: Are completed tasks being added to the task-to-list mapping?
3. **Task ID Matching**: Do task IDs in the DOM match task IDs from the API?
4. **Cache Loading**: Is the cache being loaded correctly with the mapping?
5. **Task Detection**: Are completed tasks being detected in the DOM?
6. **Color Lookup**: Is the list ID lookup working for completed tasks?
7. **Styling Application**: Are completed styling settings configured and applied?

---

## Step-by-Step Diagnostic Process

### Step 1: Fresh Extension Reload

1. **Open Chrome Extensions**: `chrome://extensions`
2. **Click "Reload"** on ColorKit extension
3. **Refresh Google Calendar tab**: Press F5

### Step 2: Open Browser Console

1. **On Google Calendar tab**: Press F12
2. **Click "Console"** tab
3. **Clear console**: Click the 🚫 icon
4. **Keep console open** for all following steps

### Step 3: Grant OAuth and Sync

1. **Open ColorKit popup** (click extension icon)
2. **If not granted, click "Grant Access"** and approve
3. **Click "Sync" button**
4. **Watch console logs** - You should see:

```
[Task Colors] Received TASK_LISTS_UPDATED - forcing full repaint
[Task Colors] DEBUG Cache state before repaint: {
  mappingSize: X,
  firstFewKeys: [...],
  sampleMapping: {...}
}
```

**📋 CHECKPOINT 1: Copy and save this log**

**What to check:**
- `mappingSize`: Should be > 0 (number of tasks in mapping)
- `sampleMapping`: Should show task IDs mapping to list IDs
- Example: `{ "abc123": "listId_xyz", "def456": "listId_xyz" }`

**If mappingSize = 0:**
- ❌ **Sync failed** - Tasks aren't being fetched from API
- Check if OAuth was granted correctly
- Check if you have any task lists in Google Tasks

### Step 4: Configure Completed Task Styling

1. **In ColorKit popup**: Find a task list
2. **Enable "Completed Tasks Styling"** toggle
3. **Set colors and opacity** for completed tasks
4. **Watch console logs** - You should see:

```
[Task Colors] Settings changed: { completedStyling: {...} }
[Task Colors] Repaint summary: {
  totalTasksFound: X,
  completedFound: Y,
  completedColored: Z,
  completedTaskIds: [...]
}
```

**📋 CHECKPOINT 2: Copy and save this log**

**What to check:**
- `totalTasksFound`: Total tasks on calendar (should match what you see)
- `completedFound`: Number of completed tasks detected
- `completedColored`: Number of completed tasks that got colored
- `completedTaskIds`: Array of task IDs for completed tasks

**Expected Results:**
- ✅ `completedFound > 0` (if you have completed tasks visible)
- ✅ `completedColored = completedFound` (all should be colored)

**If completedFound = 0:**
- ❌ **Completed tasks not detected**
- Are there actually completed tasks on your calendar?
- Do they have strikethrough text decoration?

**If completedColored < completedFound:**
- ❌ **Some completed tasks aren't getting colored**
- This is the main issue we need to debug

### Step 5: Deep Dive - Individual Task Analysis

For each completed task that isn't colored, you should see a log like:

```
[Task Colors] DEBUG getColorForTask for completed task: {
  taskId: "abc123",
  inCache: false,  ← KEY INDICATOR
  listId: undefined,
  hasCompletedStyling: false,
  completedStylingEnabled: undefined,
  completedBgColor: undefined,
  completedTextColor: undefined,
  listBgColor: null,
  cacheKeys: 10
}
```

**📋 CHECKPOINT 3: Copy and save this log for each completed task**

**What to check:**

**If `inCache: false`:**
- ❌ **Task is NOT in the mapping**
- The task ID from the DOM doesn't match any task ID in the mapping
- Possible causes:
  - Task ID encoding mismatch (base64 vs decoded)
  - Task wasn't synced from API
  - Task is in a different list than expected

**If `inCache: true` but `listId: undefined`:**
- ❌ **Mapping lookup failed**
- Should not happen if inCache is true

**If `listId` is set but `hasCompletedStyling: false`:**
- ❌ **Completed styling not configured for this list**
- You need to configure completed styling for this specific list

**If `completedStylingEnabled: false`:**
- ❌ **Completed styling is disabled for this list**
- Enable it in the popup

**You may also see:**
```
[Task Colors] ⚠️ No color found for completed task abc123: {
  taskInMapping: false,
  listId: undefined,
  listHasColor: false
}
```

This confirms the task isn't being found in the mapping.

### Step 6: Compare Task IDs

1. **In console logs**: Find `completedTaskIds` array from Checkpoint 2
2. **In console logs**: Find `sampleMapping` object from Checkpoint 1
3. **Compare**: Do the task IDs match?

**Example:**
```
completedTaskIds: ["abc123", "def456"]
sampleMapping: { "abc123": "listId_xyz", "ghi789": "listId_xyz" }
```

In this example:
- ✅ `"abc123"` is in both - should work
- ❌ `"def456"` is NOT in mapping - won't work
- The issue: Task `"def456"` wasn't synced from API

### Step 7: Special Case - Error Alert

If you see this red error:

```
⚠️ FOUND COMPLETED TASKS BUT NONE WERE COLORED!
{
  completedTaskIds: [...],
  mappingHasKeys: true/false
}
```

**If `mappingHasKeys: false`:**
- ❌ **Mapping is completely empty**
- Sync didn't run or failed
- Go back to Step 3 and sync again

**If `mappingHasKeys: true`:**
- ❌ **Mapping exists but task IDs don't match**
- The task IDs in your calendar don't match the task IDs from the API
- This is a critical encoding/ID mismatch issue

---

## What to Send Me

**Please copy and paste the following from your console:**

1. **From Checkpoint 1** (after sync):
   ```
   [Task Colors] DEBUG Cache state before repaint: {...}
   ```

2. **From Checkpoint 2** (after configuring styling):
   ```
   [Task Colors] Repaint summary: {...}
   ```

3. **From Checkpoint 3** (individual task analysis):
   ```
   [Task Colors] DEBUG getColorForTask for completed task: {...}
   ```
   (Copy 2-3 examples if you have multiple completed tasks)

4. **Any red errors or warnings** you see

5. **Screenshots**:
   - Your Google Calendar showing the completed tasks
   - The ColorKit popup showing your completed task styling configuration

---

## Possible Root Causes (Based on Diagnosis)

### Scenario A: Mapping is Empty (`mappingSize: 0`)
**Diagnosis**: Sync isn't working
**Fix**: Check OAuth, verify task lists exist, re-grant permissions

### Scenario B: Completed Tasks Not Detected (`completedFound: 0`)
**Diagnosis**: `isTaskElementCompleted()` isn't finding strikethrough
**Fix**: Improve detection logic to handle different DOM structures

### Scenario C: Task IDs Don't Match (`inCache: false`)
**Diagnosis**: Task ID encoding mismatch between API and DOM
**Fix**: Adjust encoding/decoding logic, try both encoded and decoded IDs

### Scenario D: Styling Not Configured (`hasCompletedStyling: false`)
**Diagnosis**: User hasn't configured completed styling for this list
**Fix**: No code fix needed, user needs to configure it

### Scenario E: Some Tasks Work, Others Don't
**Diagnosis**: Inconsistent task ID formats or partial sync
**Fix**: Make sync more robust, handle multiple ID formats

---

## Quick Self-Diagnosis

**Q: Do you see completed tasks on your calendar?**
- No → You need to complete some tasks first
- Yes → Continue

**Q: Do those tasks have strikethrough text?**
- No → They might not actually be completed
- Yes → Continue

**Q: When you press Sync, does `mappingSize` show a number > 0?**
- No → Sync is failing, check OAuth
- Yes → Continue

**Q: Does `completedFound` match the number of completed tasks you see?**
- No → Detection is failing
- Yes → Continue

**Q: Are the `completedTaskIds` showing reasonable-looking task IDs?**
- No → ID extraction is failing
- Yes → Continue

**Q: Are those task IDs present in the `sampleMapping`?**
- No → **THIS IS THE ISSUE** - ID mismatch
- Yes → Check if completed styling is configured and enabled

---

## Next Steps

Once you send me the console logs, I can:
1. Identify exactly which scenario is occurring
2. Implement a targeted fix
3. Test and verify the fix works

The comprehensive logging will tell us exactly where the flow breaks!

