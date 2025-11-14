# Completed Tasks Root Cause Analysis Plan

## Current Situation

After implementing the dual-format task ID fix, pre-existing completed tasks are STILL not being colored. This means the issue is NOT just about task ID encoding - there's a deeper problem in the data flow.

## Critical Questions to Answer

### 1. Are completed tasks actually in the mapping after sync?

**Test**: After sync, check what's in `cf.taskToListMap`

```javascript
// In browser console (Calendar page):
chrome.storage.local.get('cf.taskToListMap', (data) => {
  console.log('=== MAPPING CONTENTS ===');
  console.log('Total entries:', Object.keys(data['cf.taskToListMap'] || {}).length);
  console.log('Sample entries:', Object.entries(data['cf.taskToListMap'] || {}).slice(0, 10));
});
```

**Expected**: Should contain hundreds of task IDs (both pending and completed)
**If empty/small**: Sync is not working properly

---

### 2. Are completed tasks visible in the Google Calendar DOM?

**Test**: Check if completed tasks are rendered in Calendar view

```javascript
// In browser console (Calendar page):
const allTasks = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
console.log('=== TASKS IN DOM ===');
console.log('Total task elements found:', allTasks.length);

// Check which ones have line-through (completed)
let completedCount = 0;
const completedTasks = [];
allTasks.forEach(task => {
  const textEls = task.querySelectorAll('span, div, p');
  for (const el of textEls) {
    const style = window.getComputedStyle(el);
    const decoration = style.textDecoration || style.textDecorationLine || '';
    if (decoration.includes('line-through')) {
      completedCount++;
      const taskId = task.getAttribute('data-eventid')?.slice(6);
      completedTasks.push({
        taskId,
        element: task,
        text: task.textContent?.substring(0, 50)
      });
      break;
    }
  }
});

console.log('Completed tasks in DOM:', completedCount);
console.log('Sample completed tasks:', completedTasks.slice(0, 5));
```

**Expected**: Should find completed tasks with line-through styling
**If zero**: Google Calendar doesn't show completed tasks in this view OR they're not marked with line-through

---

### 3. Do the task IDs from DOM match the task IDs in the mapping?

**Test**: Compare DOM task IDs with mapping keys

```javascript
// In browser console (Calendar page):
chrome.storage.local.get('cf.taskToListMap', (data) => {
  const mapping = data['cf.taskToListMap'] || {};
  const mappingKeys = Object.keys(mapping);

  const domTasks = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
  const domTaskIds = [];

  domTasks.forEach(task => {
    const eventId = task.getAttribute('data-eventid');
    if (eventId) {
      const taskId = eventId.slice(6); // Remove "tasks." prefix
      domTaskIds.push(taskId);
    }
  });

  console.log('=== TASK ID COMPARISON ===');
  console.log('Task IDs in mapping:', mappingKeys.length);
  console.log('Task IDs in DOM:', domTaskIds.length);

  // Check how many DOM tasks are in the mapping
  const inMapping = domTaskIds.filter(id => mapping[id]);
  const notInMapping = domTaskIds.filter(id => !mapping[id]);

  console.log('DOM tasks found in mapping:', inMapping.length);
  console.log('DOM tasks NOT in mapping:', notInMapping.length);

  if (notInMapping.length > 0) {
    console.log('Sample DOM IDs not in mapping:', notInMapping.slice(0, 5));
    console.log('Sample mapping keys:', mappingKeys.slice(0, 5));
  }
});
```

**Expected**: Most DOM task IDs should be in the mapping
**If not found**: Task ID format is still mismatched

---

### 4. Is the completed styling configuration actually saved?

**Test**: Check if completed styling settings exist

```javascript
// In browser console:
chrome.storage.sync.get('settings', (data) => {
  const completedStyling = data.settings?.taskListColoring?.completedStyling;
  console.log('=== COMPLETED STYLING CONFIG ===');
  console.log('Completed styling exists:', !!completedStyling);
  console.log('Completed styling:', completedStyling);

  // Check each list
  if (completedStyling) {
    Object.entries(completedStyling).forEach(([listId, config]) => {
      console.log(`List ${listId}:`, {
        enabled: config.enabled,
        bgColor: config.bgColor,
        textColor: config.textColor,
        bgOpacity: config.bgOpacity,
        textOpacity: config.textOpacity
      });
    });
  }
});
```

**Expected**: Should show completed styling config for at least one list
**If missing**: Configuration is not being saved properly

---

### 5. Is getColorForTask() being called for completed tasks?

**Test**: Check if the function is even being invoked

This requires looking at console logs during repaint. The debug logging should show:
```
[Task Colors] DEBUG getColorForTask for completed task: { taskId: "...", inCache: true/false, ... }
```

**Expected**: Should see debug logs for completed tasks
**If no logs**: Completed tasks are not being detected as completed

---

## Possible Root Causes

Based on these tests, we can identify the root cause:

### Scenario A: Completed tasks not in mapping
**Symptom**: Mapping is empty or doesn't contain completed task IDs
**Root cause**: API sync is failing or not fetching completed tasks
**Fix**: Debug `fetchTasksInList()` and verify `showCompleted: true` is working

### Scenario B: Completed tasks not in DOM
**Symptom**: No completed tasks found in DOM query
**Root cause**: Google Calendar doesn't render completed tasks in the current view
**Fix**: Need to understand Google Calendar's view modes and ensure we're looking at the right view

### Scenario C: Task ID mismatch (still)
**Symptom**: DOM task IDs don't match mapping keys
**Root cause**: Google uses a different ID format that we haven't accounted for
**Fix**: Log both formats and find the pattern

### Scenario D: Detection failing
**Symptom**: Tasks are in DOM but not detected as completed
**Root cause**: `isTaskElementCompleted()` is not finding line-through styling
**Fix**: Inspect the actual DOM structure of completed tasks and update detection logic

### Scenario E: Configuration not saved
**Symptom**: No completed styling config in storage
**Root cause**: UI is not saving settings properly
**Fix**: Debug the save flow in `popup.js`

### Scenario F: Cache not refreshed
**Symptom**: Old cache data being used after sync
**Root cause**: Cache not invalidating after sync
**Fix**: Force cache invalidation after sync completes

---

## Investigation Steps

### Step 1: Run all diagnostic tests above
Copy each test into browser console and record results

### Step 2: Identify which scenario matches the symptoms
Based on test results, determine root cause

### Step 3: Design targeted fix
Once we know the exact failure point, implement the fix

### Step 4: Verify fix works
Test with pre-existing completed tasks

---

## Next Action Required

**USER: Please run the diagnostic tests above and provide the console output**

This will tell us exactly where the system is failing and what the actual root cause is. Without this data, we're just guessing.

---

## Additional Observations to Note

1. **When do completed tasks appear?**
   - Do they show in Day view? Week view? Month view?
   - Do they show in the Tasks panel on the right side?
   - Do they show on the calendar grid itself?

2. **How are completed tasks styled by Google?**
   - Open DevTools and inspect a completed task
   - What classes/styles does Google apply?
   - Is there actually a line-through decoration?

3. **What happens when you complete a task while extension is running?**
   - Does it get colored immediately?
   - Check console for debug logs
   - Does the task ID appear in the mapping?

These observations will help us understand Google Calendar's behavior with completed tasks.
