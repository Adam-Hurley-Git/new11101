# Clear Button Implementation Plan - Day Coloring Feature

**Date**: 2025-11-29
**Branch**: claude/analyze-day-coloring-019SqFUZYLJoPfYfDjTBTiJw

---

## Objective

Add clear buttons under each day color swatch that:
1. Reset the day color to white (#ffffff)
2. Show a disabled state when color is already white
3. Update visual appearance to indicate "no color" state
4. Maintain all existing functionality without breakage

---

## Current UI Structure

```html
<div class="weekdays">
  <div class="day-color-item" data-day="0">
    <div class="day-label">Sun</div>
    <div class="day-color-preview" id="preview0"></div>
    <!-- 🎯 INSERT CLEAR BUTTON HERE -->
    <div class="day-details" id="details0">
      <!-- Color picker, opacity controls, etc. -->
    </div>
  </div>
  <!-- Repeat for Mon-Sat (data-day="1" through "6") -->
</div>
```

---

## Implementation Plan

### Phase 1: HTML Structure (popup/popup.html)

**Location**: After each `.day-color-preview` div (Lines 3106, 3185, 3264, etc.)

**New Element**:
```html
<div class="day-color-preview" id="preview0" style="background-color: #ffd5d5"></div>

<!-- ✨ ADD THIS -->
<button class="day-clear-btn" id="clearBtn0" data-day="0" title="Reset to default (white)">
  <span class="clear-icon">×</span> Clear
</button>

<div class="day-details" id="details0">
```

**Changes Required**:
- Add clear button after each of the 7 `.day-color-preview` divs
- Each button must have:
  - `class="day-clear-btn"`
  - `id="clearBtn{dayIndex}"`
  - `data-day="{dayIndex}"`
  - Title text for tooltip

---

### Phase 2: CSS Styling (popup/popup.html)

**Location**: Inside `<style>` tag (around line 100-2600)

**New CSS Classes**:

```css
/* Clear button - positioned below color preview */
.day-clear-btn {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  color: #5f6368;
  background: #f8f9fa;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.day-clear-btn:hover:not(:disabled) {
  background: #e8eaed;
  border-color: #c6c9cc;
  color: #202124;
}

.day-clear-btn:active:not(:disabled) {
  background: #d2d4d6;
  transform: scale(0.98);
}

.day-clear-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  color: #80868b;
  background: #f8f9fa;
  border-color: #e8eaed;
}

.clear-icon {
  font-size: 14px;
  font-weight: bold;
  margin-right: 2px;
}

/* Visual state for "cleared" preview */
.day-color-preview.cleared {
  background: repeating-linear-gradient(
    45deg,
    #f0f0f0,
    #f0f0f0 10px,
    #ffffff 10px,
    #ffffff 20px
  ) !important;
  border: 1px dashed #dadce0 !important;
}
```

---

### Phase 3: JavaScript Logic (popup/popup.js)

#### 3.1 Initial State Setup

**Location**: Inside `setupWeekdayControls()` function (around line 6360-6440)

**Add after existing day initialization**:

```javascript
// Initialize clear button for each day
for (let i = 0; i < 7; i++) {
  const clearBtn = document.getElementById(`clearBtn${i}`);
  const preview = document.getElementById(`preview${i}`);

  if (clearBtn) {
    // Set initial state based on current color
    const currentColor = settings.weekdayColors?.[String(i)] || defaultColors[String(i)];
    updateClearButtonState(i, currentColor);

    // Add click handler
    clearBtn.onclick = async (e) => {
      e.stopPropagation(); // Prevent day-color-item click
      await handleClearDay(i);
    };
  }
}
```

#### 3.2 Clear Handler Function

**Location**: Add new function in popup.js (around line 5700-5800, near color handling functions)

```javascript
/**
 * Handle clearing a day's color
 * @param {number} dayIndex - Day index (0-6)
 */
async function handleClearDay(dayIndex) {
  const whiteColor = '#ffffff';
  const defaultOpacity = 30;

  console.log(`Clearing day ${dayIndex} to white`);

  try {
    // 1. Set color to white
    settings = await window.cc3Storage.setWeekdayColor(dayIndex, whiteColor);

    // 2. Reset opacity to default
    settings = await window.cc3Storage.setWeekdayOpacity(dayIndex, defaultOpacity);

    // 3. Update all UI elements
    updateColorUI(dayIndex, whiteColor);
    updateOpacityDisplay(dayIndex, defaultOpacity);
    updatePreview(dayIndex, whiteColor, defaultOpacity);
    updateClearButtonState(dayIndex, whiteColor);

    // 4. Save settings and notify calendar
    await saveSettings();

    // 5. Show feedback
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    showToast(`${dayNames[dayIndex]} color cleared to default`);

  } catch (error) {
    console.error('Error clearing day color:', error);
    showToast('Failed to clear color', 'error');
  }
}
```

#### 3.3 Clear Button State Management

**Location**: Add new function in popup.js

```javascript
/**
 * Update clear button state based on current color
 * @param {number} dayIndex - Day index (0-6)
 * @param {string} color - Current color (hex)
 */
function updateClearButtonState(dayIndex, color) {
  const clearBtn = document.getElementById(`clearBtn${dayIndex}`);
  const preview = document.getElementById(`preview${dayIndex}`);

  if (!clearBtn || !preview) return;

  // Check if color is white or close to white
  const isWhite = color.toLowerCase() === '#ffffff' ||
                  color.toLowerCase() === '#fff' ||
                  color.toLowerCase() === 'white';

  if (isWhite) {
    // Disable button and show cleared state
    clearBtn.disabled = true;
    clearBtn.title = 'Already at default (white)';
    preview.classList.add('cleared');
  } else {
    // Enable button
    clearBtn.disabled = false;
    clearBtn.title = 'Reset to default (white)';
    preview.classList.remove('cleared');
  }
}
```

#### 3.4 Update Color UI Function

**Location**: Add new helper function

```javascript
/**
 * Update all color-related UI elements for a day
 * @param {number} dayIndex - Day index (0-6)
 * @param {string} color - New color (hex)
 */
function updateColorUI(dayIndex, color) {
  // Update color input
  const colorInput = document.getElementById(`color${dayIndex}`);
  if (colorInput) {
    colorInput.value = color;
  }

  // Update hex input
  const hexInput = document.getElementById(`hex${dayIndex}`);
  if (hexInput) {
    hexInput.value = color.toUpperCase();
  }

  // Update color preview in picker
  const colorPreview = document.getElementById(`colorPreview${dayIndex}`);
  if (colorPreview) {
    colorPreview.style.backgroundColor = color;
  }
}
```

#### 3.5 Modify Existing Color Change Handlers

**Location**: Modify existing color change handlers (around line 5740-5760)

**Add clear button state update**:

```javascript
// Existing color palette click handler
colorSwatch.onclick = async (e) => {
  const color = e.target.dataset.color;
  const dayIndex = parseInt(paletteEl.dataset.day);

  // ... existing code ...

  settings = await window.cc3Storage.setWeekdayColor(dayIndex, color);
  settings = await window.cc3Storage.setWeekdayOpacity(dayIndex, 100);

  // ... existing code ...

  // ✨ ADD THIS: Update clear button state
  updateClearButtonState(dayIndex, color);

  await saveSettings();
};
```

**Also update**:
- Color input onchange handler
- Hex input onchange handler
- Color picker direct input handler

---

### Phase 4: Storage Integration (lib/storage.js)

**No changes needed** - existing functions already support white color:
- `setWeekdayColor(dayIndex, '#ffffff')` ✅
- `setWeekdayOpacity(dayIndex, 30)` ✅

---

### Phase 5: Feature Integration (dayColoring.js)

**No changes needed** - the feature will automatically apply white backgrounds:

```javascript
// Existing code already handles white correctly
function generateCalendarCSS(settings) {
  for (let col = 0; col < 7; col++) {
    const color = settings.weekdayColors?.[String(weekday)];

    // White color will create: rgba(255, 255, 255, 0.3)
    // This is visually imperceptible → essentially "no color"
    const rgba = hexToRgba(color, opacity / 100);
  }
}
```

**Optional Enhancement** (not required):
- Could skip CSS generation for white colors to save DOM operations
- Would be a performance optimization, not functional requirement

---

## Detailed File Changes

### File 1: popup/popup.html

**Changes**: Add clear button to all 7 day-color-item sections

**Line Numbers** (approximate):
- Sunday (day 0): After line 3106
- Monday (day 1): After line 3185
- Tuesday (day 2): After line 3264
- Wednesday (day 3): After line 3343
- Thursday (day 4): After line 3422
- Friday (day 5): After line 3501
- Saturday (day 6): After line 3580

**Template to insert**:
```html
<button class="day-clear-btn" id="clearBtn{N}" data-day="{N}" title="Reset to default (white)">
  <span class="clear-icon">×</span> Clear
</button>
```

Replace `{N}` with 0-6 for each day.

**CSS Addition**:
Add new CSS classes inside `<style>` tag (around line 1450-1500, after `.day-color-preview` styles)

---

### File 2: popup/popup.js

**New Functions** (add around line 5700-5900):
1. `handleClearDay(dayIndex)` - Main clear logic
2. `updateClearButtonState(dayIndex, color)` - Button state management
3. `updateColorUI(dayIndex, color)` - UI update helper

**Modifications to Existing Functions**:

**Location 1**: `setupWeekdayControls()` (around line 6360-6440)
- Add clear button initialization loop
- Add click handlers for all 7 clear buttons

**Location 2**: Color palette click handlers (around line 5740)
- Add `updateClearButtonState(dayIndex, color)` after color save

**Location 3**: Color input onchange handlers (around line 6390)
- Add `updateClearButtonState(dayIndex, color)` after color save

**Location 4**: Hex input onchange handlers (around line 6410)
- Add `updateClearButtonState(dayIndex, color)` after color save

**Location 5**: Settings initialization (around line 6320)
- Add initial clear button state check on load

---

## Visual Design Specifications

### Clear Button

**Normal State**:
- Width: 100% of day-color-item
- Height: ~24px
- Background: #f8f9fa (light gray)
- Border: 1px solid #dadce0
- Text: #5f6368 (medium gray)
- Font: 11px, weight 500
- Border radius: 4px
- Margin-top: 4px

**Hover State**:
- Background: #e8eaed (slightly darker)
- Border: #c6c9cc (darker border)
- Text: #202124 (darker text)

**Active State**:
- Background: #d2d4d6
- Transform: scale(0.98) (slight shrink effect)

**Disabled State**:
- Opacity: 0.4
- Cursor: not-allowed
- Background: #f8f9fa (same as normal)
- Border: #e8eaed (lighter)
- Text: #80868b (light gray)

### Cleared Preview Swatch

**Visual Indicator**:
- Background: Diagonal stripe pattern (45°)
  - Color 1: #f0f0f0
  - Color 2: #ffffff
  - Stripe width: 10px each
- Border: 1px dashed #dadce0

---

## Testing Checklist

### Functionality Tests

- [ ] Clear button appears for all 7 days
- [ ] Clear button disabled when color is already white
- [ ] Clear button enabled when color is not white
- [ ] Clicking clear button sets color to white
- [ ] Clicking clear button resets opacity to 30%
- [ ] Preview swatch shows "cleared" visual state
- [ ] Selecting a non-white color re-enables clear button
- [ ] Selecting a non-white color removes "cleared" visual state
- [ ] Changes save to chrome.storage.sync
- [ ] Calendar tab receives updated settings
- [ ] Toast notification shows on clear
- [ ] Clear button doesn't expand/collapse day item

### Visual Tests

- [ ] Clear button aligns with color preview width
- [ ] Clear button has correct spacing (4px margin-top)
- [ ] Hover effect works smoothly
- [ ] Active effect (scale) works
- [ ] Disabled state looks visually distinct
- [ ] Cleared preview pattern displays correctly
- [ ] Button text is legible
- [ ] Icon (×) displays correctly

### Edge Cases

- [ ] Rapidly clicking clear button (debounce)
- [ ] Clearing all 7 days at once
- [ ] Clearing → selecting color → clearing again
- [ ] Page reload maintains cleared state
- [ ] Different week starts (Sun/Mon/Sat)
- [ ] Clearing while opacity slider is open
- [ ] Clearing while color picker is expanded

### Regression Tests

- [ ] Existing color selection still works
- [ ] Opacity controls still work
- [ ] Color palette tabs still work
- [ ] Hex input still works
- [ ] Direct color picker still works
- [ ] Settings sync across tabs
- [ ] Calendar coloring still applies
- [ ] Day/Week/Month views still colored
- [ ] Observers still maintain colors
- [ ] Week start setting still works

---

## Implementation Sequence

### Step 1: Add HTML (Sunday only - test case)
1. Add clear button for Sunday (data-day="0") only
2. Verify visual appearance
3. Ensure no layout breakage

### Step 2: Add CSS
1. Add all CSS classes
2. Test button states manually
3. Verify cleared preview pattern

### Step 3: Add JavaScript Logic
1. Implement `updateClearButtonState()`
2. Implement `handleClearDay()`
3. Implement `updateColorUI()`
4. Add initialization code
5. Test with Sunday only

### Step 4: Add to Remaining Days
1. Copy clear button HTML to Mon-Sat
2. Test all 7 days
3. Verify each button has correct data-day attribute

### Step 5: Integration Testing
1. Test color changes → button state updates
2. Test clear → calendar updates
3. Test persistence across page reloads
4. Test with different settings

### Step 6: Edge Case Testing
1. Test rapid clicks
2. Test all cleared
3. Test undo (re-select color)
4. Test with expanded/collapsed states

---

## Rollback Plan

If issues arise:

1. **HTML Rollback**: Remove `<button class="day-clear-btn">` elements
2. **CSS Rollback**: Remove `.day-clear-btn` and `.day-color-preview.cleared` CSS
3. **JS Rollback**: Remove new functions, revert modified handlers
4. **Commit Revert**: `git revert <commit-hash>`

No database/storage schema changes, so rollback is simple DOM/code revert.

---

## Success Criteria

✅ Clear buttons visible for all 7 days
✅ Clear functionality works reliably
✅ Visual states match design specifications
✅ No existing functionality broken
✅ Changes persisted to storage
✅ Calendar updates reflect cleared colors
✅ Code is maintainable and documented
✅ All regression tests pass

---

**End of Plan** - Ready for implementation
