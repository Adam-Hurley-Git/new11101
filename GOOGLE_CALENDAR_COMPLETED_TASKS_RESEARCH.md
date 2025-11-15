# Google Calendar Completed Tasks - Behavior Research

## Critical Question: Does Google Calendar Actually Display Completed Tasks?

This is the fundamental question we need to answer first. If Google Calendar doesn't render completed tasks in the calendar grid view by default, then our extension will never see them in the DOM, regardless of our mapping.

---

## Research Steps

### 1. Understanding Google Calendar's Task Display

**Task locations in Google Calendar:**

1. **Calendar Grid** - Tasks appear as chips on specific dates
2. **Tasks Panel** (right sidebar) - Dedicated tasks list view
3. **Month View** - Tasks may appear as small items in day cells

**Key question**: In which views do completed tasks appear?

---

### 2. Google Calendar Settings for Tasks

**Check these settings:**

1. In Google Calendar, click the gear icon (Settings)
2. Go to "View options"
3. Look for task-related settings:
   - "Show completed tasks" checkbox?
   - "Hide completed tasks" toggle?
   - Any filters for task display?

**Also check:**
1. In the left sidebar, find "My tasks" or task list names
2. Check if there's a "Show completed tasks" option per list
3. In the Tasks panel (right sidebar), check for view filters

---

### 3. Manual Test: Where Do Completed Tasks Appear?

**Test procedure:**

1. **Create a test task in Google Tasks** (https://tasks.google.com)
   - Create a task: "Test Task for ColorKit"
   - Set a date: Today
   - Save the task

2. **View in Google Calendar** (https://calendar.google.com)
   - Open Day view
   - Verify you can see the task on the calendar grid
   - Note: Does it appear as a chip? What's the DOM structure?

3. **Complete the task IN GOOGLE TASKS**
   - Go back to https://tasks.google.com
   - Mark "Test Task for ColorKit" as complete
   - It should now have a strikethrough

4. **Return to Google Calendar**
   - Refresh the page if needed
   - **CRITICAL**: Is the task still visible on the calendar grid?
   - Check all views:
     - Day view
     - Week view
     - Month view
     - Tasks panel (right sidebar)

5. **Document what you observe:**
   - ✅ Completed task IS visible in: [list views here]
   - ❌ Completed task NOT visible in: [list views here]

---

## Hypothesis Testing

### Hypothesis 1: Google Calendar HIDES completed tasks by default

**If TRUE:**
- Completed tasks won't appear in the DOM at all
- Our extension can't color what isn't rendered
- **Solution**: Need to:
  1. Find Google Calendar's setting/API to show completed tasks
  2. Programmatically enable it when our extension loads
  3. OR accept that we can only color completed tasks in views where they're visible

**Test**: Follow manual test above and check if completed task disappears from calendar grid

---

### Hypothesis 2: Completed tasks ARE visible but styled differently

**If TRUE:**
- Completed tasks appear in DOM but with different classes/attributes
- Our selector `[data-eventid^="tasks."]` might not find them
- **Solution**: Update DOM selectors to include completed task elements

**Test**: Use DevTools to inspect a completed task and compare its HTML to a pending task

---

### Hypothesis 3: Completed tasks only show in specific views

**If TRUE:**
- Completed tasks visible in some views (e.g., Month view) but not others (e.g., Day view)
- Our extension works in some views but not others
- **Solution**: Document which views support completed tasks and update documentation

**Test**: Check all calendar views (Day, Week, Month, Year, Schedule) for completed task visibility

---

## DOM Inspection: What Does a Completed Task Look Like?

**Steps:**

1. In Google Calendar, find a completed task (if visible)
2. Open DevTools (F12)
3. Use Inspector to click on the completed task element
4. **Document the HTML structure:**

```html
<!-- Example - REPLACE WITH ACTUAL HTML -->
<div data-eventid="tasks.XXXXX" class="???" style="???">
  <div class="GTG3wb" ...>
    <span style="text-decoration: line-through;">Task Name</span>
  </div>
</div>
```

**Key things to check:**
- Does it have `data-eventid` attribute?
- What classes are applied?
- Is there a `data-completed` or similar attribute?
- How is the strikethrough applied? (inline style? class?)
- Are there any visual differences from pending tasks?

---

## API Behavior: What Does fetchTasksInList Return?

**Add this debug code to `lib/google-tasks-api.js`:**

```javascript
// In fetchTasksInList(), after fetching tasks:
console.log('[API] Fetched tasks from list:', listId, {
  totalTasks: allTasks.length,
  completedCount: allTasks.filter(t => t.status === 'completed').length,
  pendingCount: allTasks.filter(t => t.status === 'needsAction').length,
  sampleCompleted: allTasks.filter(t => t.status === 'completed').slice(0, 3).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    completed: t.completed
  })),
  samplePending: allTasks.filter(t => t.status === 'needsAction').slice(0, 3).map(t => ({
    id: t.id,
    title: t.title,
    status: t.status
  }))
});
```

**Then:**
1. Reload extension
2. Press "Sync" button
3. Check console logs

**Look for:**
- Are completed tasks being fetched from the API? (completedCount > 0)
- What's the `status` field value? (`completed` or `needsAction`)
- Do completed tasks have different IDs/structure?

---

## Comparison: New vs Pre-existing Completed Tasks

**Why do NEW completed tasks work but OLD ones don't?**

**Test this:**

1. **With extension loaded:**
   - Create a new task in Google Tasks: "New Task"
   - Set date to today
   - View in Google Calendar - should appear
   - Complete the task in Google Tasks
   - Return to Google Calendar
   - **Does it get colored with completed styling?** ✅ YES (this works)

2. **With extension loaded:**
   - Find a task that was completed BEFORE extension was installed
   - View in Google Calendar
   - **Does it get colored with completed styling?** ❌ NO (this fails)

**Question**: What's the difference?

**Possible answers:**
- **DOM difference**: Newly completed tasks have different HTML structure
- **Timing difference**: New tasks trigger a repaint, old tasks don't
- **Mapping difference**: New tasks trigger API lookup, old tasks rely on cache
- **Visibility difference**: New tasks are visible longer before Google hides them

---

## The Real Question: Can We Actually See Pre-existing Completed Tasks?

**Critical test:**

1. Go to Google Tasks (https://tasks.google.com)
2. Find a task you completed yesterday or earlier
3. Note its name and date
4. Go to Google Calendar (https://calendar.google.com)
5. Navigate to the date where that task should appear
6. **Can you see it on the calendar grid?**

**If NO:**
- Google Calendar hides completed tasks by default
- Our extension can't color invisible elements
- **We need to find how to make Google show completed tasks**

**If YES:**
- The task IS visible
- Our extension should be able to color it
- The issue is in our detection/coloring logic

---

## Expected Findings

Based on this research, we expect to find ONE of these scenarios:

### Scenario A: Completed tasks are hidden by Google
- **Symptom**: Can't see pre-existing completed tasks on calendar at all
- **Root cause**: Google Calendar UI hides completed tasks by default
- **Solution**: Find Google Calendar setting/API to show completed tasks, or document limitation

### Scenario B: Completed tasks visible but different selector needed
- **Symptom**: Can see completed tasks but they have different HTML structure
- **Root cause**: Our selector doesn't match completed task elements
- **Solution**: Update selector to include completed task elements

### Scenario C: Completed tasks visible only briefly
- **Symptom**: Task appears when first completed, then disappears later
- **Root cause**: Google hides tasks after some time period
- **Solution**: Document timing limitation or find way to force display

---

## Action Required

**USER: Please perform the manual tests described above and report:**

1. **Can you see pre-existing completed tasks on the Google Calendar grid?**
   - If YES: Where? (Day view, Week view, Month view?)
   - If NO: Can you see them anywhere in Google Calendar at all?

2. **When you complete a task (with extension loaded), does it:**
   - Immediately get colored with completed styling? ✅/❌
   - Stay visible on the calendar? ✅/❌
   - Disappear after some time? ✅/❌

3. **Is there a setting in Google Calendar to "Show completed tasks"?**
   - Check Settings → View options
   - Check left sidebar → Tasks list options
   - Check Tasks panel (right sidebar) → View filters

4. **What does a completed task look like in DevTools?**
   - Inspect the HTML of a completed task element
   - Copy the full HTML structure

Once we have this information, we can design the correct solution.
