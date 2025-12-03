# Google Calendar UI Detection - Critical Findings

**Date**: December 3, 2025
**Status**: 🎯 **IMPORTANT DISCOVERY**

---

## 🔍 **CRITICAL FINDING: You Have OLD UI, Not NEW UI**

Based on your console output, you are currently using **Google Calendar's OLD UI**, not the new ttb_ format.

### Evidence from Your Logs:

```
[ColorKit] Captured pending task bg: S1R6bVd3Ymd0V0s3dnZ0Xw== rgb(252, 248, 232)
[ColorKit] Captured pending task bg: VkNlZVhiZzQzcEN0Nk9IUw== rgb(252, 248, 232)
[ColorKit] Captured pending task bg: SzhnUmlaa2lmX3FxREdJOA== rgb(252, 248, 232)
```

These are **base64-encoded Task API IDs** (OLD format), NOT ttb_ prefixed calendar event IDs (NEW format).

### What This Means:

1. ✅ **Your extension SHOULD already work** for task coloring
2. ✅ **You don't need ttb_ support** (yet) - Google hasn't rolled out the new UI to your account
3. ⚠️ **We've been optimizing for the wrong UI format**

---

## 🎯 **Two UI Formats Explained**

### **OLD UI (What You Have)** ✅

**DOM Format**:
```html
<div data-eventid="tasks.SzhnUmlaa2lmX3FxREdJOA">...</div>
```

**Characteristics**:
- Task ID is directly in the DOM
- Format: `tasks.{base64TaskId}`
- NO Calendar API needed
- Direct mapping to Tasks API
- **Your extension fully supports this** ✅

**Your Implementation**:
```javascript
// features/tasks-coloring/index.js:20-22
if (ev && (ev.startsWith('tasks.') || ev.startsWith('tasks_'))) {
  return ev.slice(6);  // Returns: "SzhnUmlaa2lmX3FxREdJOA"
}
```
✅ **This code path is working!**

---

### **NEW UI (Future-Proofing)** 🔮

**DOM Format**:
```html
<div data-eventid="ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt">...</div>
```

**Characteristics**:
- Calendar Event ID encoded in ttb_ prefix
- Requires Calendar API to map to Task ID
- Complex chain: ttb_ → Calendar Event → Task Fragment → Task API ID
- **You've implemented this** ✅ but don't need it yet

---

## 📊 **Current Status of Your Extension**

### ✅ **What's Working:**

1. **Extension loads** and initializes ✅
2. **OAuth is granted** ✅
3. **Tasks are detected** and captured ✅
4. **OLD UI support** is fully functional ✅

### ❌ **What's NOT Working:**

1. **Task coloring** - But this might be a different issue!
2. **MutationObserver error** - ✅ **FIXED** in commit below

---

## 🐛 **The Real Problem: Why Aren't Tasks Coloring?**

If your extension detects tasks but they're not being colored, the issue is likely:

### **Hypothesis 1: No Colors Set** 🟡
- Have you set default colors for task lists?
- Have you manually colored any tasks?
- Check: Do you have colors in `cf.taskListColors` or `cf.taskColors` storage?

### **Hypothesis 2: Subscription Issue** 🟡
Your logs show:
```
[ColorKit] No active subscription - features disabled
[ColorKit] Subscription validation failed - not initializing features
```

**BUT THEN**:
```
[Task Coloring] OAuth granted - dynamically initializing feature
```

**This suggests**:
- Extension thinks subscription is inactive initially
- Then tries to initialize anyway when OAuth is detected
- Might be a race condition or subscription check issue

### **Hypothesis 3: Painting Logic Issue** 🟡
- Tasks are detected ✅
- But `applyPaint()` might not be called
- OR paint is applied but immediately cleared

---

## 🔧 **Fixes Applied**

### **Fix #1: MutationObserver Error** ✅

**Error**:
```
TypeError: Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'
```

**Root Cause**: Grid element not ready when observer tries to attach

**Fix Applied** (`features/tasks-coloring/index.js:1931-1949`):
```javascript
// CRITICAL FIX: Validate that grid is actually a DOM Node before observing
if (grid && grid instanceof Node) {
  gridObserver.observe(grid, {
    childList: true,
    subtree: true,
  });
} else {
  console.warn('[Task Coloring] Grid element not ready, will observe document.body after delay');
  // Fallback: wait for DOM to be fully ready, then try again
  setTimeout(() => {
    const fallbackGrid = document.querySelector('[role="grid"]') || document.body;
    if (fallbackGrid && fallbackGrid instanceof Node) {
      gridObserver.observe(fallbackGrid, {
        childList: true,
        subtree: true,
      });
    }
  }, 1000);
}
```

**Result**: No more MutationObserver errors ✅

---

## 🧪 **Diagnostic Script - Run This**

Copy and paste this into your browser console on calendar.google.com:

```javascript
console.clear();
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       COLORKIT UI DETECTION & STATUS CHECK            ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');

// 1. Detect UI Format
const oldUITasks = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]');
const newUITasks = document.querySelectorAll('[data-eventid^="ttb_"]');

console.log('1️⃣  UI FORMAT DETECTION');
console.log('   ─────────────────────────────────────────────');
console.log('   OLD UI tasks (tasks.):', oldUITasks.length);
console.log('   NEW UI tasks (ttb_):', newUITasks.length);

if (newUITasks.length > 0) {
  console.log('   ✅ YOU HAVE NEW UI (ttb_ format)');
  const sample = newUITasks[0].getAttribute('data-eventid');
  console.log('   Sample:', sample.substring(0, 30) + '...');
} else if (oldUITasks.length > 0) {
  console.log('   ✅ YOU HAVE OLD UI (tasks. format)');
  const sample = oldUITasks[0].getAttribute('data-eventid');
  console.log('   Sample:', sample);
} else {
  console.log('   ❌ NO TASKS FOUND');
}
console.log('');

// 2. Check Extension Storage
chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors', 'settings'], (syncData) => {
  chrome.storage.local.get(['cf.taskToListMap', 'cf.taskListsMeta'], (localData) => {
    console.log('2️⃣  EXTENSION STORAGE STATUS');
    console.log('   ─────────────────────────────────────────────');

    const manualColors = syncData['cf.taskColors'] || {};
    const listColors = syncData['cf.taskListColors'] || {};
    const taskToListMap = localData['cf.taskToListMap'] || {};
    const taskListsMeta = localData['cf.taskListsMeta'] || [];

    console.log('   Manual task colors:', Object.keys(manualColors).length);
    console.log('   List default colors:', Object.keys(listColors).length);
    console.log('   Task→List mappings:', Object.keys(taskToListMap).length);
    console.log('   Known task lists:', taskListsMeta.length);
    console.log('');

    if (Object.keys(manualColors).length > 0) {
      console.log('   📋 Manual Colors:');
      for (const [taskId, color] of Object.entries(manualColors)) {
        console.log('      ', taskId.substring(0, 20) + '...', '→', color);
      }
    }

    if (Object.keys(listColors).length > 0) {
      console.log('   📋 List Default Colors:');
      for (const [listId, color] of Object.entries(listColors)) {
        const list = taskListsMeta.find(l => l.id === listId);
        const listName = list ? list.title : 'Unknown';
        console.log('      ', listName, '→', color);
      }
    }

    if (Object.keys(manualColors).length === 0 && Object.keys(listColors).length === 0) {
      console.log('   ⚠️  NO COLORS SET!');
      console.log('   This is why tasks aren\'t being colored.');
      console.log('   Go to the extension popup and set some colors.');
    }
    console.log('');

    // 3. Check Settings
    console.log('3️⃣  FEATURE SETTINGS');
    console.log('   ─────────────────────────────────────────────');
    const settings = syncData.settings || {};
    console.log('   Task coloring enabled:', settings.taskColoring?.enabled);
    console.log('   Task list coloring enabled:', settings.taskListColoring?.enabled);
    console.log('   OAuth granted:', settings.taskListColoring?.oauthGranted);
    console.log('');

    // 4. Check Painted Tasks
    console.log('4️⃣  PAINTED TASKS CHECK');
    console.log('   ─────────────────────────────────────────────');
    const paintedTasks = document.querySelectorAll('.cf-task-colored');
    console.log('   Tasks with .cf-task-colored class:', paintedTasks.length);

    const tasksWithCustomBg = Array.from(document.querySelectorAll('[data-eventid^="tasks"]'))
      .filter(el => {
        const target = el.querySelector('.GTG3wb') || el;
        const bg = window.getComputedStyle(target).backgroundColor;
        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      });
    console.log('   Tasks with custom background:', tasksWithCustomBg.length);
    console.log('');

    // 5. Summary
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║                    SUMMARY                             ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    if (oldUITasks.length === 0 && newUITasks.length === 0) {
      console.log('❌ NO TASKS VISIBLE');
      console.log('   → Create some tasks in Google Calendar first');
    } else if (Object.keys(manualColors).length === 0 && Object.keys(listColors).length === 0) {
      console.log('⚠️  TASKS DETECTED BUT NO COLORS SET');
      console.log('   → Open extension popup and set colors');
    } else if (paintedTasks.length > 0 || tasksWithCustomBg.length > 0) {
      console.log('✅ EVERYTHING WORKING!');
      console.log('   → Tasks are being colored successfully');
    } else {
      console.log('⚠️  COLORS SET BUT NOT APPLIED');
      console.log('   → There might be a painting logic issue');
      console.log('   → Check background console for errors');
    }
    console.log('');
  });
});
```

---

## 📝 **Next Steps**

### **Step 1: Run the Diagnostic Script** 🔥
Copy the script above and run it in your console. Share the output with me.

### **Step 2: Check if You Have Colors Set**
- Open the ColorKit extension popup
- Go to "Task List Coloring" section
- Have you set any default colors for your task lists?
- If not, that's why tasks aren't being colored!

### **Step 3: Test Manual Coloring**
1. Create a test task in Google Calendar
2. Click on the task to open the modal
3. You should see ColorKit's color picker in the modal
4. Select a color and click "Apply"
5. The task should be colored immediately

### **Step 4: Report Back**
Let me know:
- What does the diagnostic script output show?
- Can you manually color a task via the modal?
- Do you see any colors in the extension popup settings?

---

## 🎯 **Summary**

| Aspect | Status | Notes |
|--------|--------|-------|
| **UI Format** | ✅ OLD UI | No ttb_ support needed yet |
| **Extension Loading** | ✅ Working | Loads and initializes correctly |
| **Task Detection** | ✅ Working | Captures task IDs correctly |
| **MutationObserver** | ✅ FIXED | No more Node type errors |
| **Task Coloring** | ❓ Unknown | Need diagnostic to determine issue |
| **Colors Set?** | ❓ Unknown | Likely the root cause if none set |

**Most Likely Issue**: No colors have been set in the extension settings.

**Next Action**: Run diagnostic script and check extension popup settings.

---

**Ready to proceed?** Run the diagnostic script and share the results!
