# Completed Tasks Styling - Bug Fix Plan

## Issues Identified

### 1. UI Overspill - Layout Issue
**Problem**: 2-column grid causing overflow in popup (520px width)
**Current**: `grid-template-columns: 1fr 1fr;` (side-by-side)
**Fix**: Change to stacked vertical layout (single column)

**CSS Changes** (`popup/popup.html`):
```css
.completed-tasks-controls {
  display: grid;
  grid-template-columns: 1fr; /* Change from "1fr 1fr" to "1fr" */
  gap: 12px;
  margin-bottom: 12px;
}
```

---

### 2. UI Buggy - Interaction Issues
**Problem**: Color picker interactions may be unclear, sliders need better feedback
**Fix**: Add hover states and visual feedback

**CSS Changes** (`popup/popup.html`):

```css
/* Color picker preview hover */
.task-list-color-preview {
  /* existing styles... */
  transition: all 0.2s ease;
}

.task-list-color-preview:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: #1a73e8;
}

/* Opacity slider improvements */
.opacity-slider {
  /* existing styles... */
  cursor: pointer;
  transition: all 0.2s ease;
}

.opacity-slider:hover {
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.3) 0%, rgba(245, 158, 11, 1) 100%);
}

.opacity-slider:active::-webkit-slider-thumb {
  transform: scale(1.2);
}

.opacity-slider:active::-moz-range-thumb {
  transform: scale(1.2);
}

/* Completed section toggle hover */
.completed-tasks-toggle .switch {
  transition: all 0.2s ease;
}

.completed-tasks-toggle .switch:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Color group hover - highlight active group */
.completed-color-group:hover {
  background: rgba(254, 252, 232, 0.5);
  border-radius: 8px;
  padding: 8px;
  margin: -8px;
}

.completed-opacity-group:hover {
  background: rgba(254, 252, 232, 0.5);
  border-radius: 8px;
  padding: 8px;
  margin: -8px;
}
```

---

### 3. Text Opacity at 100% Not Fully Opaque

**Problem**: Google Calendar applies multiple CSS properties to completed tasks that reduce text opacity:
1. `opacity` property on text elements
2. `text-decoration-color` with alpha
3. Possible `filter` effects
4. Child element opacity inheritance

**Root Cause Analysis**:

Google Calendar's completed task CSS (approximate):
```css
.completed-task {
  opacity: 0.6; /* Reduces entire element */
}

.completed-task span {
  text-decoration: line-through;
  text-decoration-color: rgba(0, 0, 0, 0.4);
  opacity: 0.7; /* Child opacity multiplies with parent */
}
```

Our current code applies:
- ✅ `color: textColorValue !important;`
- ✅ `-webkit-text-fill-color: textColorValue !important;`
- ❌ **Missing**: `opacity: 1 !important;` on text elements
- ❌ **Missing**: `opacity: 1 !important;` on container
- ❌ **Missing**: `text-decoration-color` override

**Fix Required** (`features/tasks-coloring/index.js`):

Update `applyPaint()` function to add opacity overrides:

```javascript
function applyPaint(node, color, textColorOverride = null, bgOpacity = 1, textOpacity = 1) {
  if (!node || !color) return;

  node.classList.add(MARK);
  const text = textColorOverride || pickContrastingText(color);
  node.dataset.cfTaskTextColor = textColorOverride ? text.toLowerCase() : '';

  const bgColorValue = colorToRgba(color, bgOpacity);
  const textColorValue = colorToRgba(text, textOpacity);

  node.dataset.cfTaskBgColor = bgColorValue;
  node.dataset.cfTaskTextActual = textColorValue;

  // Container styles
  node.style.setProperty('--cf-task-text-color', textColorValue, 'important');
  node.style.setProperty('background-color', bgColorValue, 'important');
  node.style.setProperty('border-color', bgColorValue, 'important');
  node.style.setProperty('color', textColorValue, 'important');
  node.style.setProperty('-webkit-text-fill-color', textColorValue, 'important');
  node.style.setProperty('mix-blend-mode', 'normal', 'important');
  node.style.setProperty('filter', 'none', 'important');

  // NEW: Force container opacity to 1 (Google may set lower opacity on completed tasks)
  node.style.setProperty('opacity', '1', 'important');

  // Text elements
  const textElements = node.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6');
  for (const textEl of textElements) {
    textEl.style.setProperty('color', textColorValue, 'important');
    textEl.style.setProperty('-webkit-text-fill-color', textColorValue, 'important');
    textEl.style.setProperty('mix-blend-mode', 'normal', 'important');
    textEl.style.setProperty('filter', 'none', 'important');

    // NEW: Override text element opacity (Google may set lower opacity)
    textEl.style.setProperty('opacity', '1', 'important');

    // NEW: Override text-decoration-color for completed tasks (line-through color)
    textEl.style.setProperty('text-decoration-color', textColorValue, 'important');
  }

  // SVG elements
  const svgElements = node.querySelectorAll('svg');
  for (const svg of svgElements) {
    svg.style.setProperty('color', textColorValue, 'important');
    svg.style.setProperty('fill', textColorValue, 'important');

    // NEW: Override SVG opacity
    svg.style.setProperty('opacity', '1', 'important');
  }
}
```

**Also Update `clearPaint()`** to remove new properties:

```javascript
function clearPaint(node) {
  if (!node) return;

  node.style.removeProperty('background-color');
  node.style.removeProperty('border-color');
  node.style.removeProperty('color');
  node.style.removeProperty('-webkit-text-fill-color');
  node.style.removeProperty('--cf-task-text-color');
  node.style.removeProperty('mix-blend-mode');
  node.style.removeProperty('filter');
  node.style.removeProperty('opacity'); // NEW
  delete node.dataset.cfTaskTextColor;
  delete node.dataset.cfTaskBgColor;
  delete node.dataset.cfTaskTextActual;

  node.querySelectorAll?.('span, div, p, h1, h2, h3, h4, h5, h6').forEach((textEl) => {
    textEl.style.removeProperty('color');
    textEl.style.removeProperty('-webkit-text-fill-color');
    textEl.style.removeProperty('mix-blend-mode');
    textEl.style.removeProperty('filter');
    textEl.style.removeProperty('opacity'); // NEW
    textEl.style.removeProperty('text-decoration-color'); // NEW
  });

  node.querySelectorAll?.('svg').forEach((svg) => {
    svg.style.removeProperty('color');
    svg.style.removeProperty('fill');
    svg.style.removeProperty('opacity'); // NEW
  });

  node.classList.remove(MARK);
}
```

---

## Implementation Steps

### Step 1: Fix UI Overspill (popup.html)
**File**: `popup/popup.html`
**Line**: ~1792
**Change**:
```css
/* Before */
.completed-tasks-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

/* After */
.completed-tasks-controls {
  display: grid;
  grid-template-columns: 1fr; /* Single column for no overflow */
  gap: 12px;
  margin-bottom: 12px;
}
```

---

### Step 2: Add Hover Effects (popup.html)
**File**: `popup/popup.html`
**Location**: After `.completed-tasks-disabled` (~line 1874)

**Add**:
```css
/* Hover effects for better UX */
.task-list-color-preview {
  transition: all 0.2s ease;
}

.task-list-color-preview:hover:not(.completed-tasks-disabled *) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: #1a73e8;
}

.opacity-slider {
  cursor: pointer;
  transition: background 0.2s ease;
}

.opacity-slider:hover {
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.3) 0%, rgba(245, 158, 11, 1) 100%);
}

.opacity-slider:active::-webkit-slider-thumb {
  transform: scale(1.2);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.opacity-slider:active::-moz-range-thumb {
  transform: scale(1.2);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.completed-tasks-toggle .switch {
  transition: all 0.2s ease;
}

.completed-tasks-toggle .switch:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.completed-color-group,
.completed-opacity-group {
  transition: all 0.2s ease;
  padding: 4px;
  margin: -4px;
  border-radius: 8px;
}

.completed-color-group:hover:not(.completed-tasks-disabled *),
.completed-opacity-group:hover:not(.completed-tasks-disabled *) {
  background: rgba(254, 252, 232, 0.6);
  box-shadow: 0 1px 4px rgba(245, 158, 11, 0.1);
}
```

---

### Step 3: Fix Text Opacity (features/tasks-coloring/index.js)

**File**: `features/tasks-coloring/index.js`
**Line**: ~614-648

**Update `applyPaint()` function**:

Add opacity overrides to:
1. Container node: `node.style.setProperty('opacity', '1', 'important');`
2. Text elements: `textEl.style.setProperty('opacity', '1', 'important');`
3. Text elements: `textEl.style.setProperty('text-decoration-color', textColorValue, 'important');`
4. SVG elements: `svg.style.setProperty('opacity', '1', 'important');`

**Update `clearPaint()` function**:

Add opacity property removal:
1. Container: `node.style.removeProperty('opacity');`
2. Text elements: `textEl.style.removeProperty('opacity');`
3. Text elements: `textEl.style.removeProperty('text-decoration-color');`
4. SVG elements: `svg.style.removeProperty('opacity');`

---

## Testing Plan

### Test 1: UI Layout
- ✅ Completed section displays in single column
- ✅ No horizontal overflow in popup
- ✅ All controls visible and accessible

### Test 2: Hover Effects
- ✅ Color picker preview highlights on hover
- ✅ Sliders show enhanced gradient on hover
- ✅ Slider thumbs scale up when dragging
- ✅ Toggle switch highlights on hover
- ✅ Color/opacity groups highlight on hover
- ✅ No hover effects when section is disabled

### Test 3: Text Opacity
- ✅ Set text opacity to 100% → text is fully opaque
- ✅ Set text opacity to 50% → text is semi-transparent
- ✅ Set text opacity to 0% → text is invisible
- ✅ Line-through color matches text color
- ✅ No Google Calendar opacity overrides visible

### Test 4: Combined Opacity
- ✅ Background 100%, Text 100% → both fully opaque
- ✅ Background 50%, Text 50% → both semi-transparent
- ✅ Background 100%, Text 50% → bg opaque, text semi
- ✅ Background 50%, Text 100% → bg semi, text opaque

### Test 5: Edge Cases
- ✅ Completed task with manual color override
- ✅ Completed task with list default color
- ✅ Task marked complete → styling applies
- ✅ Task marked incomplete → styling removes
- ✅ Multiple completed tasks in same list

---

## Files Changed Summary

| File | Changes | Lines | Impact |
|------|---------|-------|--------|
| `popup/popup.html` | Update CSS layout + hover effects | ~50 | Low |
| `features/tasks-coloring/index.js` | Add opacity overrides | ~10 | Critical |

**Total Estimated Changes**: ~60 lines
**Risk Level**: Low (CSS) + Medium (JS opacity overrides)
**Testing Time**: 15 minutes

---

## Success Criteria

✅ Completed section fits within popup width (no overflow)
✅ Hover effects provide clear visual feedback
✅ Text opacity at 100% is fully opaque (no Google overrides visible)
✅ Text opacity slider works correctly from 0-100%
✅ Background opacity slider works correctly from 0-100%
✅ Line-through color matches text color setting
✅ No visual regressions in pending task styling

---

## Notes

- **Critical**: The opacity fix is the most important - ensures user settings are respected
- **CSS Specificity**: Using `!important` ensures our styles override Google's defaults
- **Performance**: Opacity changes don't require DOM reflows, so no performance impact
- **Backwards Compatibility**: Existing completed styling continues to work

