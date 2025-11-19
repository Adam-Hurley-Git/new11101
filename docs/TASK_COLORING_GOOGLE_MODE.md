# Task Coloring - Google Mode Implementation

**Last Updated**: November 19, 2025
**Related File**: `features/tasks-coloring/index.js`

This document explains how Google mode task coloring works, particularly the opacity handling for completed tasks.

---

## Overview

Google mode allows users to adjust the opacity of completed tasks while using Google Calendar's original colors. The challenge is that Google pre-fades completed task colors, so we need to reverse this fading to allow users to restore full opacity.

---

## How Google Calendar Handles Task Colors

### Pending Tasks
- Display at full color (e.g., `rgb(3, 155, 229)`)
- No fading applied

### Completed Tasks
- Google **pre-fades the background-color** by blending with white
- Uses approximately **30% of original color + 70% white**
- Example: `rgb(3, 155, 229)` → `rgb(179, 225, 247)`

**Important**: Google changes the actual `background-color` CSS value, not just `opacity`. This is why we need to mathematically reverse the blend.

---

## Architecture

### Key Components

1. **Color Capture** (`captureGoogleTaskColors()`)
   - Captures Google's original colors before we paint
   - Stores in dataset attributes on the element
   - Tracks whether captured from pending or completed state

2. **Color Unfading** (`unfadeGoogleColor()`)
   - Reverses Google's white blend mathematically
   - Only applied to colors captured from completed tasks

3. **Paint Application** (`applyPaint()`)
   - Applies colors with user-specified opacity
   - Uses unfaded colors when appropriate

---

## Data Flow

```
┌─────────────────┐
│ Task appears    │
│ on calendar     │
└────────┬────────┘
         ▼
┌─────────────────────────────────┐
│ captureGoogleTaskColors()       │
│ - Skip if already painted       │
│ - Skip if already captured      │
│ - Capture background color      │
│ - Store in dataset.cfGoogleBg   │
│ - Track state in                │
│   cfGoogleBgWasCompleted        │
└────────┬────────────────────────┘
         ▼
┌─────────────────────────────────┐
│ getColorForTask()               │
│ - Google mode returns           │
│   transparent signal            │
│ - buildColorInfo() returns      │
│   bgOpacity from user settings  │
└────────┬────────────────────────┘
         ▼
┌─────────────────────────────────┐
│ applyPaint()                    │
│ - Detect transparent signal     │
│ - Read cfGoogleBg from dataset  │
│ - If cfGoogleBgWasCompleted:    │
│   → unfadeGoogleColor()         │
│ - Apply user's opacity          │
└─────────────────────────────────┘
```

---

## Dataset Attributes

Stored on task elements:

| Attribute | Purpose |
|-----------|---------|
| `dataset.cfGoogleBg` | Original Google background color |
| `dataset.cfGoogleText` | Original Google text color |
| `dataset.cfGoogleBorder` | Original Google border color |
| `dataset.cfGoogleBgWasCompleted` | `'true'` if captured from completed task |
| `dataset.cfTaskBgColor` | Our applied background color |
| `dataset.cfTaskTextColor` | Our applied text color |

---

## The Unfade Math

### Google's Fading Formula
```
faded = original × 0.3 + white × 0.7
```

### Our Unfade Formula (reverse)
```
original = (faded - 255 × 0.7) / 0.3
```

### Example
```javascript
// Captured from completed task:
faded = rgb(179, 225, 247)

// Unfade calculation:
R = (179 - 178.5) / 0.3 = 1.67 ≈ 2
G = (225 - 178.5) / 0.3 = 155
B = (247 - 178.5) / 0.3 = 228.3 ≈ 228

// Result:
unfaded = rgb(2, 155, 228)  // ≈ rgb(3, 155, 229) original
```

---

## Key Code Locations

### Capture Logic
```javascript
// features/tasks-coloring/index.js, lines 534-587
function captureGoogleTaskColors() {
  // Skip if already painted (has MARK class)
  if (target.classList.contains(MARK)) continue;

  // Skip if already captured
  if (target.dataset.cfGoogleBg) continue;

  // Capture and track state
  target.dataset.cfGoogleBg = googleBg;
  target.dataset.cfGoogleBgWasCompleted = isCompleted ? 'true' : 'false';
}
```

### Unfade Function
```javascript
// features/tasks-coloring/index.js, lines 631-654
function unfadeGoogleColor(fadedColor, googleFade = 0.3) {
  const whiteMix = 255 * (1 - googleFade);  // 178.5

  const unfadedR = Math.round((r - whiteMix) / googleFade);
  const unfadedG = Math.round((g - whiteMix) / googleFade);
  const unfadedB = Math.round((b - whiteMix) / googleFade);

  return `rgb(${unfadedR}, ${unfadedG}, ${unfadedB})`;
}
```

### Paint Application
```javascript
// features/tasks-coloring/index.js, lines 816-835
if (isTransparentColor(color)) {
  if (node.dataset.cfGoogleBg) {
    bgColorToApply = node.dataset.cfGoogleBg;

    // Only unfade if captured from completed task
    const capturedWasCompleted = node.dataset.cfGoogleBgWasCompleted === 'true';
    if (capturedWasCompleted) {
      bgColorToApply = unfadeGoogleColor(bgColorToApply);
    }
  }
}

const bgColorValue = colorToRgba(bgColorToApply, bgOpacity);
```

### Google Mode Signal
```javascript
// features/tasks-coloring/index.js, lines 1031-1048
// buildColorInfo() for Google mode returns:
return {
  backgroundColor: 'rgba(255, 255, 255, 0)',  // Transparent = use Google's
  textColor: 'rgba(0, 0, 0, 0)',              // Transparent = use Google's
  bgOpacity: completedStyling?.bgOpacity ?? 0.6,
  textOpacity: completedStyling?.textOpacity ?? 0.6,
};
```

---

## Critical Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| Google fade factor | `0.3` | Google keeps 30% of original color |
| White mix | `178.5` | `255 × 0.7` for the white blend |
| Default opacity | `0.6` | Default UI slider value (60%) |
| MARK class | `cf3-task-painted` | Marks elements we've painted |

---

## Common Issues & Solutions

### Issue: Continuous recapture loop
**Cause**: Capturing our own painted colors as "Google's color"
**Solution**: Skip elements with MARK class and elements that already have cfGoogleBg

### Issue: 100% opacity doesn't match pending
**Cause**: Using wrong fade factor (was 0.6, should be 0.3)
**Solution**: Updated unfadeGoogleColor() default to 0.3

### Issue: Over-saturated colors
**Cause**: Unfading colors that were captured from pending state
**Solution**: Track cfGoogleBgWasCompleted and only unfade when true

### Issue: Colors reset on navigation
**Cause**: DOM elements destroyed, losing dataset attributes
**Solution**: Re-capture when new elements appear (handled by MutationObserver)

---

## Testing Checklist

1. **Pending tasks** should display at full color
2. **Completed tasks at 30% opacity** should look like Google's default
3. **Completed tasks at 100% opacity** should match pending task color exactly
4. **Navigating** between views should preserve colors
5. **Toggling completion** should update colors correctly
6. **Console** should not show continuous "Background changed" logs

### Debug Commands
```javascript
// Check captured colors in DevTools:
document.querySelectorAll('[data-cf-google-bg]').forEach(el => {
  console.log(el.dataset.cfGoogleBg, el.dataset.cfGoogleBgWasCompleted);
});
```

---

## Mode Comparison

| Mode | Background Source | Unfade? | Opacity Adjustable? |
|------|-------------------|---------|---------------------|
| Google | Captured from DOM | Yes (if completed) | Yes |
| Inherit | Pending list color | No | Yes |
| Custom | User-selected color | No | Yes |

---

## Future Considerations

1. **Dark mode**: Unfade math assumes white background. May need adjustment for dark themes.
2. **Different task colors**: Google uses different base colors. All should unfade correctly with same factor.
3. **Google updates**: If Google changes their fade factor, update `unfadeGoogleColor()` default.

---

## Related Files

- `features/tasks-coloring/index.js` - Main implementation
- `features/tasks-coloring/styles.css` - Task styling CSS
- `popup/popup.js` - UI for opacity sliders
- `lib/storage.js` - Settings persistence

---

## Version History

- **Nov 19, 2025**: Fixed unfade factor from 0.6 to 0.3 based on actual captured data
- **Nov 19, 2025**: Added cfGoogleBgWasCompleted tracking to prevent over-saturation
- **Nov 19, 2025**: Fixed continuous recapture by checking MARK class
