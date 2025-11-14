# Completed Tasks Styling - Implementation Plan

## Overview
Add UI controls to allow users to customize the appearance of completed tasks in Google Calendar, including card color, text color, and opacity values for both.

---

## Current State

### ✅ Backend Already Implemented
- **Detection**: `isTaskElementCompleted()` detects completed tasks via line-through text
- **Storage**: `settings.taskListColoring.completedStyling[listId]` schema exists
- **Application**: `buildColorInfo()` applies completed styles when enabled
- **Rendering**: `applyPaint()` supports opacity and uses `!important`

### ❌ Missing Components
- User interface in popup.html/popup.js to configure completed task styling
- No UI controls for:
  - Enable/disable completed styling per list
  - Completed task background color
  - Completed task text color
  - Background opacity (0-100%)
  - Text opacity (0-100%)

---

## Storage Schema

### Current Schema (Already Exists)
```javascript
settings.taskListColoring.completedStyling = {
  "listId_abc123": {
    enabled: true,           // Enable completed styling for this list
    bgColor: "#cccccc",      // Background color for completed tasks
    textColor: "#666666",    // Text color for completed tasks
    bgOpacity: 0.6,          // Background opacity (0-1)
    textOpacity: 0.7         // Text opacity (0-1)
  }
}
```

### Priority System
```
For PENDING tasks:
1. Manual color (cf.taskColors[taskId]) - highest
2. List default color (cf.taskListColors[listId])
3. List text color (cf.taskListTextColors[listId])

For COMPLETED tasks (if completedStyling[listId].enabled):
1. Completed bgColor (or fallback to pending color)
2. Completed textColor (or fallback to pending text color)
3. Completed bgOpacity (0-1, default 0.5 if no bgColor specified)
4. Completed textOpacity (0-1, default 1)
```

---

## Implementation Tasks

### 1. Update `lib/storage.js`

**Add helper functions** (after line 200):

```javascript
// ========================================
// COMPLETED TASK STYLING
// ========================================

/**
 * Enable/disable completed task styling for a list
 * @param {string} listId - Task list ID
 * @param {boolean} enabled - Enable completed styling
 */
async function setCompletedStylingEnabled(listId, enabled) {
  const current = await getSettings();
  const completedStyling = current.taskListColoring?.completedStyling || {};

  const listStyling = completedStyling[listId] || {};
  listStyling.enabled = enabled;

  return setSettings({
    taskListColoring: {
      completedStyling: {
        [listId]: listStyling
      }
    }
  });
}

/**
 * Set completed task background color
 * @param {string} listId - Task list ID
 * @param {string} color - Hex color
 */
async function setCompletedBgColor(listId, color) {
  const current = await getSettings();
  const completedStyling = current.taskListColoring?.completedStyling || {};

  const listStyling = completedStyling[listId] || {};
  listStyling.bgColor = color;

  return setSettings({
    taskListColoring: {
      completedStyling: {
        [listId]: listStyling
      }
    }
  });
}

/**
 * Set completed task text color
 * @param {string} listId - Task list ID
 * @param {string} color - Hex color
 */
async function setCompletedTextColor(listId, color) {
  const current = await getSettings();
  const completedStyling = current.taskListColoring?.completedStyling || {};

  const listStyling = completedStyling[listId] || {};
  listStyling.textColor = color;

  return setSettings({
    taskListColoring: {
      completedStyling: {
        [listId]: listStyling
      }
    }
  });
}

/**
 * Set completed task background opacity
 * @param {string} listId - Task list ID
 * @param {number} opacity - Opacity 0-100 or 0-1
 */
async function setCompletedBgOpacity(listId, opacity) {
  const current = await getSettings();
  const completedStyling = current.taskListColoring?.completedStyling || {};

  const listStyling = completedStyling[listId] || {};
  // Normalize to 0-1 range
  listStyling.bgOpacity = opacity > 1 ? opacity / 100 : opacity;

  return setSettings({
    taskListColoring: {
      completedStyling: {
        [listId]: listStyling
      }
    }
  });
}

/**
 * Set completed task text opacity
 * @param {string} listId - Task list ID
 * @param {number} opacity - Opacity 0-100 or 0-1
 */
async function setCompletedTextOpacity(listId, opacity) {
  const current = await getSettings();
  const completedStyling = current.taskListColoring?.completedStyling || {};

  const listStyling = completedStyling[listId] || {};
  // Normalize to 0-1 range
  listStyling.textOpacity = opacity > 1 ? opacity / 100 : opacity;

  return setSettings({
    taskListColoring: {
      completedStyling: {
        [listId]: listStyling
      }
    }
  });
}

/**
 * Clear all completed task styling for a list
 * @param {string} listId - Task list ID
 */
async function clearCompletedStyling(listId) {
  const current = await getSettings();
  const completedStyling = { ...(current.taskListColoring?.completedStyling || {}) };
  delete completedStyling[listId];

  return setSettings({
    taskListColoring: {
      completedStyling
    }
  });
}

/**
 * Get completed task styling for a list
 * @param {string} listId - Task list ID
 * @returns {Promise<Object|null>}
 */
async function getCompletedStyling(listId) {
  const settings = await getSettings();
  return settings.taskListColoring?.completedStyling?.[listId] || null;
}
```

**Export functions** (add to bottom of file with other exports):
```javascript
window.cc3Storage.setCompletedStylingEnabled = setCompletedStylingEnabled;
window.cc3Storage.setCompletedBgColor = setCompletedBgColor;
window.cc3Storage.setCompletedTextColor = setCompletedTextColor;
window.cc3Storage.setCompletedBgOpacity = setCompletedBgOpacity;
window.cc3Storage.setCompletedTextOpacity = setCompletedTextOpacity;
window.cc3Storage.clearCompletedStyling = clearCompletedStyling;
window.cc3Storage.getCompletedStyling = getCompletedStyling;
```

---

### 2. ~~Update `lib/google-tasks-api.js`~~ (NOT NEEDED!)

**NO CHANGES NEEDED** - We detect completed tasks via DOM (line-through text decoration), not via API!

Google Calendar shows completed tasks in the DOM even though our API fetches `showCompleted=false`. The completed tasks are rendered by Google Calendar with strikethrough text, which we detect in `isTaskElementCompleted()`.

---

### 3. Update `popup.html` - Add CSS Styles

**Add CSS** (after line 1700, in the styles section):

```css
/* Completed Tasks Styling Section */
.completed-tasks-section {
  margin-top: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
  border: 1px solid #fde68a;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
}

.completed-tasks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(245, 158, 11, 0.2);
}

.completed-tasks-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 6px;
}

.completed-tasks-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.completed-tasks-toggle label {
  font-size: 12px;
  color: #78350f;
  font-weight: 600;
}

.completed-tasks-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.completed-color-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.completed-color-label {
  font-size: 11px;
  font-weight: 600;
  color: #78350f;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.completed-opacity-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.opacity-slider-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.opacity-slider {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.8) 100%);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f59e0b;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.opacity-slider::-webkit-slider-thumb:hover {
  background: #d97706;
  transform: scale(1.1);
}

.opacity-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f59e0b;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.opacity-value {
  font-size: 12px;
  font-weight: 700;
  color: #92400e;
  min-width: 40px;
  text-align: right;
}

.completed-tasks-disabled {
  opacity: 0.5;
  pointer-events: none;
  filter: grayscale(50%);
}
```

---

### 4. Update `popup.js` - Add UI Logic

**Location**: Find the function that creates task list cards (around line 1250-1400)

**Add to each task list card** (after the pending color controls):

```javascript
// ========================================
// COMPLETED TASKS STYLING SECTION
// ========================================

async function createCompletedTasksSection(list) {
  const settings = await window.cc3Storage.getSettings();
  const completedStyling = settings.taskListColoring?.completedStyling?.[list.id] || {};

  const section = document.createElement('div');
  section.className = 'completed-tasks-section';

  // Header with toggle
  const header = document.createElement('div');
  header.className = 'completed-tasks-header';

  const title = document.createElement('h4');
  title.innerHTML = '✓ Completed Tasks Styling';

  const toggleWrapper = document.createElement('div');
  toggleWrapper.className = 'completed-tasks-toggle';

  const toggleLabel = document.createElement('label');
  toggleLabel.textContent = 'Enable';
  toggleLabel.style.fontSize = '12px';

  const toggle = document.createElement('div');
  toggle.className = 'switch';
  if (completedStyling.enabled) {
    toggle.classList.add('active');
  }

  toggle.onclick = async () => {
    const newEnabled = !toggle.classList.contains('active');
    toggle.classList.toggle('active');

    await window.cc3Storage.setCompletedStylingEnabled(list.id, newEnabled);

    // Update controls visibility
    controls.classList.toggle('completed-tasks-disabled', !newEnabled);

    // Trigger repaint
    chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
  };

  toggleWrapper.appendChild(toggleLabel);
  toggleWrapper.appendChild(toggle);

  header.appendChild(title);
  header.appendChild(toggleWrapper);

  // Controls container
  const controls = document.createElement('div');
  controls.className = 'completed-tasks-controls';
  if (!completedStyling.enabled) {
    controls.classList.add('completed-tasks-disabled');
  }

  // Background Color
  const bgColorGroup = document.createElement('div');
  bgColorGroup.className = 'completed-color-group';

  const bgLabel = document.createElement('div');
  bgLabel.className = 'completed-color-label';
  bgLabel.textContent = 'Card Color';

  const bgColorPicker = buildTaskListColorPicker({
    list,
    prefix: 'completedBg',
    currentColor: completedStyling.bgColor || '#cccccc',
    storageKey: 'completedStyling',
    toastLabel: 'Completed card color',
    helperText: 'Background color for completed tasks',
    onColorChange: async (color) => {
      await window.cc3Storage.setCompletedBgColor(list.id, color);
      chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
    }
  });

  bgColorGroup.appendChild(bgLabel);
  bgColorGroup.appendChild(bgColorPicker);

  // Text Color
  const textColorGroup = document.createElement('div');
  textColorGroup.className = 'completed-color-group';

  const textLabel = document.createElement('div');
  textLabel.className = 'completed-color-label';
  textLabel.textContent = 'Text Color';

  const textColorPicker = buildTaskListColorPicker({
    list,
    prefix: 'completedText',
    currentColor: completedStyling.textColor || '#666666',
    storageKey: 'completedStyling',
    toastLabel: 'Completed text color',
    helperText: 'Text color for completed tasks',
    onColorChange: async (color) => {
      await window.cc3Storage.setCompletedTextColor(list.id, color);
      chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
    }
  });

  textColorGroup.appendChild(textLabel);
  textColorGroup.appendChild(textColorPicker);

  // Background Opacity Slider
  const bgOpacityGroup = document.createElement('div');
  bgOpacityGroup.className = 'completed-opacity-group';

  const bgOpacityLabel = document.createElement('div');
  bgOpacityLabel.className = 'completed-color-label';
  bgOpacityLabel.textContent = 'Card Opacity';

  const bgOpacityContainer = document.createElement('div');
  bgOpacityContainer.className = 'opacity-slider-container';

  const bgOpacitySlider = document.createElement('input');
  bgOpacitySlider.type = 'range';
  bgOpacitySlider.min = '0';
  bgOpacitySlider.max = '100';
  bgOpacitySlider.value = String(Math.round((completedStyling.bgOpacity || 0.6) * 100));
  bgOpacitySlider.className = 'opacity-slider';

  const bgOpacityValue = document.createElement('span');
  bgOpacityValue.className = 'opacity-value';
  bgOpacityValue.textContent = bgOpacitySlider.value + '%';

  bgOpacitySlider.oninput = async () => {
    bgOpacityValue.textContent = bgOpacitySlider.value + '%';
    const opacity = parseInt(bgOpacitySlider.value, 10) / 100;
    await window.cc3Storage.setCompletedBgOpacity(list.id, opacity);

    // Debounced repaint
    clearTimeout(bgOpacitySlider._repaintTimer);
    bgOpacitySlider._repaintTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
    }, 500);
  };

  bgOpacityContainer.appendChild(bgOpacitySlider);
  bgOpacityContainer.appendChild(bgOpacityValue);
  bgOpacityGroup.appendChild(bgOpacityLabel);
  bgOpacityGroup.appendChild(bgOpacityContainer);

  // Text Opacity Slider
  const textOpacityGroup = document.createElement('div');
  textOpacityGroup.className = 'completed-opacity-group';

  const textOpacityLabel = document.createElement('div');
  textOpacityLabel.className = 'completed-color-label';
  textOpacityLabel.textContent = 'Text Opacity';

  const textOpacityContainer = document.createElement('div');
  textOpacityContainer.className = 'opacity-slider-container';

  const textOpacitySlider = document.createElement('input');
  textOpacitySlider.type = 'range';
  textOpacitySlider.min = '0';
  textOpacitySlider.max = '100';
  textOpacitySlider.value = String(Math.round((completedStyling.textOpacity || 1) * 100));
  textOpacitySlider.className = 'opacity-slider';

  const textOpacityValue = document.createElement('span');
  textOpacityValue.className = 'opacity-value';
  textOpacityValue.textContent = textOpacitySlider.value + '%';

  textOpacitySlider.oninput = async () => {
    textOpacityValue.textContent = textOpacitySlider.value + '%';
    const opacity = parseInt(textOpacitySlider.value, 10) / 100;
    await window.cc3Storage.setCompletedTextOpacity(list.id, opacity);

    // Debounced repaint
    clearTimeout(textOpacitySlider._repaintTimer);
    textOpacitySlider._repaintTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
    }, 500);
  };

  textOpacityContainer.appendChild(textOpacitySlider);
  textOpacityContainer.appendChild(textOpacityValue);
  textOpacityGroup.appendChild(textOpacityLabel);
  textOpacityGroup.appendChild(textOpacityContainer);

  // Add all controls
  controls.appendChild(bgColorGroup);
  controls.appendChild(textColorGroup);
  controls.appendChild(bgOpacityGroup);
  controls.appendChild(textOpacityGroup);

  // Assemble section
  section.appendChild(header);
  section.appendChild(controls);

  return section;
}
```

**Integration**: Add the completed section to each task list card:

```javascript
// In the function that builds task list cards (around line 1360):

// ... existing pending color controls ...

// Add completed tasks section
const completedSection = await createCompletedTasksSection(list);
settingsSection.appendChild(completedSection);

// ... rest of card assembly ...
```

---

### 5. ~~Update `features/tasks-coloring/index.js`~~ (NO CHANGES NEEDED!)

The coloring logic is **already fully implemented**:

- `isTaskElementCompleted()` - detects completed tasks ✅
- `refreshColorCache()` - loads completedStyling ✅
- `getColorForTask()` - passes isCompleted flag ✅
- `buildColorInfo()` - applies completed styles ✅
- `applyPaint()` - applies opacity values ✅

**No changes required!**

---

### 6. Testing Plan

#### Test Cases:

1. **Enable/Disable Toggle**
   - Toggle on → completed tasks get custom styling
   - Toggle off → completed tasks revert to default Google styling

2. **Color Selection**
   - Set completed bg color → completed tasks update immediately
   - Set completed text color → text updates immediately
   - Use vibrant/pastel/dark/custom palettes → all work correctly

3. **Opacity Sliders**
   - Set bg opacity to 0% → transparent background
   - Set bg opacity to 100% → fully opaque
   - Set text opacity to 50% → semi-transparent text
   - Verify opacity applies correctly over calendar grid

4. **Override Google Styles**
   - Google's default: light gray bg, gray text, line-through
   - Our styles: should fully override with `!important`
   - Verify no visual artifacts or conflicts

5. **Priority System**
   - Manual color > list default > no color (pending)
   - Completed styling only applies if enabled
   - Fallback to pending color if completed color not set

6. **Cross-Tab Updates**
   - Change completed styling in popup
   - Verify calendar tab updates immediately

7. **Storage Sync**
   - Change settings on device A
   - Verify settings sync to device B (Chrome Sync)

#### Edge Cases:

- List with no completed styling → falls back to pending style
- List with completed styling disabled → uses pending style
- Task marked complete → switches from pending to completed style
- Task marked incomplete → switches from completed to pending style
- Multiple completed tasks in same list → all styled consistently

---

### 7. File Changes Summary

| File | Changes | Lines | Complexity |
|------|---------|-------|------------|
| `lib/storage.js` | Add 7 helper functions | +150 | Low |
| `lib/google-tasks-api.js` | None | 0 | - |
| `popup/popup.html` | Add CSS styles | +180 | Low |
| `popup/popup.js` | Add `createCompletedTasksSection()` | +200 | Medium |
| `features/tasks-coloring/index.js` | None | 0 | - |
| **Total** | | **+530** | **Low-Medium** |

---

## Implementation Order

1. ✅ **Analyze codebase** - Complete
2. ⏭️ **Update `storage.js`** - Add helper functions (15 min)
3. ⏭️ **Update `popup.html`** - Add CSS (10 min)
4. ⏭️ **Update `popup.js`** - Add UI logic (30 min)
5. ⏭️ **Test manually** - All test cases (20 min)
6. ⏭️ **Fix any bugs** - As needed (10 min)
7. ⏭️ **Commit & push** - Git workflow (5 min)

**Total Estimated Time: 90 minutes**

---

## Success Criteria

✅ Users can enable/disable completed task styling per list
✅ Users can set custom colors for completed task background and text
✅ Users can adjust opacity for completed task background and text (0-100%)
✅ Changes apply instantly to all open calendar tabs
✅ Styles override Google's default completed task styles
✅ Settings sync across devices via Chrome Sync
✅ No performance degradation (uses existing cache system)
✅ Clean, intuitive UI that matches existing design system

---

## Notes

- **No API changes needed** - We detect completed tasks via DOM, not API
- **Backend already complete** - Only UI needs to be added
- **Uses existing infrastructure** - Color pickers, storage, cache, repaint system
- **Minimal code** - ~530 lines total across 3 files
- **Low risk** - Mostly UI, no changes to core coloring logic

