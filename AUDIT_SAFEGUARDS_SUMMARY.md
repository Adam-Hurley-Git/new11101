# ColorKit Extension - Critical Safeguards for Audit Fixes

## Quick Reference

This document highlights the most fragile parts of the codebase that require careful handling when fixing audit issues.

---

## 🔴 Highest Risk Areas

### 1. **In-Memory Cache System** (features/tasks-coloring/index.js:130-1009)

**What It Does**: Reduces storage reads from 50/sec to 0.07/sec (99.86% improvement)

**Critical Elements**:
- `cacheLastUpdated` timestamp (line 135)
- `refreshColorCache()` function (line 967)
- `invalidateColorCache()` function (line 1014)
- Cache invalidation triggers in storage listener (line 1648-1673)

**If You Break It**: 
- Storage reads spike from 2-3/30sec to 100+/30sec
- Performance degrades noticeably
- Browser may lock up with 100+ tasks

**Safe Modifications**:
- ✅ Adjust `CACHE_LIFETIME` (currently 30000ms)
- ✅ Add additional cache fields if needed
- ❌ Don't remove the timestamp check
- ❌ Don't remove invalidation triggers

---

### 2. **Debounced Repaint System** (features/tasks-coloring/index.js:1466-1482)

**What It Does**: Prevents 100+ repaints/sec during rapid DOM mutations

**Critical Elements**:
- `repaintQueued` flag (line 541)
- `doRepaint()` throttling logic (line 1318-1323)
- Three different repaint modes (immediate/normal/retry)
- `repaintSoon()` dispatcher (line 1466)

**If You Break It**:
- UI freezes during rapid changes
- Battery drain on laptops
- CPU spike to 100%

**Safe Modifications**:
- ✅ Adjust throttle intervals (25ms → 100ms)
- ✅ Add bypass flags for specific operations
- ❌ Don't remove the queue flag
- ❌ Don't remove throttling entirely

---

### 3. **Navigation Detection** (features/tasks-coloring/index.js:1574-1610)

**What It Does**: Detects Google Calendar page transitions using MutationObserver

**Critical Elements**:
- `mutationCount` detection (line 1580-1584)
- `isNavigating` flag (line 1576)
- Multi-stage repaint during navigation (line 1596-1598)
- 500ms timeout to reset state (line 1600-1604)

**If You Break It**:
- Tasks don't color during navigation
- Colors lag by 1+ second
- Content appears unstyled temporarily

**Safe Modifications**:
- ✅ Increase 500ms timeout if navigation is slow
- ✅ Adjust 10/50/150ms repaint delays
- ❌ Don't remove the multi-stage repaint
- ❌ Don't remove the `isNavigating` flag

---

### 4. **Modal vs. Grid Distinction** (features/tasks-coloring/index.js:32-67)

**What It Does**: Prevents painting task modals (which would break editing)

**Critical Elements**:
- `getPaintTarget()` modal check (line 35)
- `closest([role="dialog"])` in all paint functions
- Modal element detection in `paintTaskImmediately()` (line 375-379)

**If You Break It**:
- Modal form becomes uneditable (colors override form styling)
- User can't change task details
- Color picker in modal conflicts with form styles

**Safe Modifications**:
- ✅ Refine modal detection if Google changes selectors
- ❌ Don't remove modal checks
- ❌ Don't paint anything inside `[role="dialog"]`

---

### 5. **Google Color Capture** (features/tasks-coloring/index.js:551-606, 828-920)

**What It Does**: Captures original Google colors BEFORE painting for recovery

**Critical Elements**:
- `captureGoogleTaskColors()` function (line 551)
- `target.dataset.cfGoogleBg` storage (line 571)
- Capture timing BEFORE `applyPaint()` (line 1315)
- Unfading logic for completed tasks (line 680-693)

**If You Break It**:
- Text-only coloring shows wrong colors
- Completed task styling looks faded incorrectly
- Can't recover original colors after painting

**Safe Modifications**:
- ✅ Adjust unfade formula if needed
- ✅ Change capture triggers
- ❌ Don't skip capture step
- ❌ Don't capture after painting

---

### 6. **Smart Storage Listener in Popup** (popup/popup.js:6517-6555)

**What It Does**: Prevents DOM destruction while user drags opacity sliders

**Critical Elements**:
- `onlyCompletedStylingChanged` detection (line 6525-6538)
- Conditional reload based on detection (line 6546)
- JSON deep comparison logic (line 6529-6537)

**If You Break It**:
- Task list DOM rebuilds while user dragging
- Slider becomes unresponsive
- Scroll position resets mid-drag
- Opacity values appear to "jump"

**Safe Modifications**:
- ✅ Add more detected-only properties
- ✅ Refine the comparison logic
- ❌ Don't remove the conditional check
- ❌ Don't always reload task lists

---

## 🟡 Medium Risk Areas

### 7. **Parallel API Searches** (lib/google-tasks-api.js:495-570)

**What It Does**: Speeds up new task discovery from 10+ seconds to <1 second

**Critical Elements**:
- Fast path with 30-second time filter (line 500)
- Promise.all for parallel execution (line 523)
- Fallback to full search (line 535-570)
- Cache update on success (line 528-530)

**If You Break It**: New tasks take 10+ seconds to color

**Safe Modifications**:
- ✅ Adjust time filter (30 seconds)
- ✅ Reorder fast/fallback paths
- ❌ Don't remove parallel execution
- ❌ Don't remove cache update

---

### 8. **Color Priority System** (features/tasks-coloring/index.js:1042-1127)

**What It Does**: Determines which color to use (manual > list > none)

**Critical Elements**:
- Priority 1: Manual colors (line 1051-1101)
- Priority 2: List default colors (line 1104-1123)
- Priority 3: No color (line 1126)
- Transparent color handling (line 699-705)

**If You Break It**: Color precedence becomes ambiguous

**Safe Modifications**:
- ✅ Change which priority level wins
- ✅ Add more color sources
- ❌ Don't remove the priority checks
- ❌ Don't lose the transparent handling

---

## 🟢 Lower Risk Areas

### 9. **Double Initialization Prevention** (features/tasks-coloring/index.js:1484-1491)

**Simple guard**: Just prevents listeners from being added twice

**Safe Modifications**:
- ✅ Add initialization tracking for other features
- ✅ Log when re-initialization happens
- ❌ Don't remove the guard

---

### 10. **Polling State Machine** (background.js:636-998)

**Manages sync frequency** (SLEEP/IDLE/ACTIVE)

**Safe Modifications**:
- ✅ Adjust poll frequencies (5-min/15-min)
- ✅ Change activity tracking
- ✅ Modify tab lifecycle listeners
- ❌ Don't remove state transitions

---

## Critical Interdependencies

### Script Load Order (Manifest.json line 35-50)

If changed, these break:
1. `lib/storage.js` must load first → `window.cc3Storage` 
2. `featureRegistry.js` must load early → `window.cc3Features`
3. `shared/utils.js` must load before tasks-coloring → `window.cc3SharedUtils`
4. `content/index.js` must load LAST → waits for dependencies

---

### Message Type Expectations

If you add/change message types, verify:

**Background handler** receives:
```javascript
{ type: 'MESSAGE_TYPE', customField: value }
```

**Content handler** returns:
```javascript
{ success: true/false, data: ... }
```

**Critical messages that MUST NOT break**:
- `NEW_TASK_DETECTED` → Background API search
- `TASK_LISTS_UPDATED` → Content repaint trigger
- `SUBSCRIPTION_CANCELLED` → Disable all features
- `SUBSCRIPTION_UPDATED` → Revalidate access

---

## Audit-Safe Modification Guidelines

### ✅ SAFE: These are isolated, low-risk changes

1. Adjust numeric constants:
   - Cache lifetime (30000ms)
   - Repaint throttle intervals (25ms/100ms)
   - Navigation timeout (500ms)
   - Poll frequencies (5min/15min)

2. Add logging/debugging:
   - More `console.log()` statements
   - Telemetry measurements
   - Performance profiling

3. Refine selectors:
   - Update DOM class selectors if Google changes CSS
   - Add fallback selectors
   - Improve modal detection

4. Optimize algorithms:
   - Better binary search in caches
   - Smarter color contrast calculation
   - More efficient DOM queries

### ❌ DANGEROUS: These break core functionality

1. **Removing guards**:
   - Double initialization check
   - Modal detection
   - Google color capture
   - Storage listeners
   - Cache invalidation

2. **Changing control flow**:
   - Removing `return true` from async message handlers
   - Removing Promise.all parallel execution
   - Removing throttling logic
   - Removing multi-stage repaints

3. **Altering storage structure**:
   - Changing cache key names
   - Removing timestamp fields
   - Restructuring nested objects

---

## Testing Checklist Before Committing

When you fix audit issues, verify these scenarios:

- [ ] Load extension with 100+ tasks
- [ ] Create new task → colors appear <1 second
- [ ] Switch calendar views (day/week/month) → tasks color during transition
- [ ] Drag opacity slider continuously → no jank, no scroll reset
- [ ] Disable feature → colors removed instantly
- [ ] Enable feature → colors reappear instantly
- [ ] Change color in popup → appears on calendar <500ms
- [ ] Open 2 calendar tabs → both update when color changes
- [ ] Leave calendar idle 5+ min → still colors new tasks quickly
- [ ] Check DevTools → storage reads <1/sec average

---

## File Sizes & Performance Targets

| File | Size | Typical Runtime |
|------|------|---|
| features/tasks-coloring/index.js | 1700+ lines | Should NOT block page |
| background.js | 1000+ lines | Runs in service worker |
| popup/popup.js | 6700+ lines | Lazy loads when opened |
| lib/google-tasks-api.js | 650+ lines | Async, called on demand |

**If any file gets much larger, consider splitting into modules.**

---

## Emergency Fix Patterns

### If users report: "Colors don't appear"

1. Check: Is `captureGoogleTaskColors()` being called?
2. Check: Is `doRepaint()` throttle too aggressive?
3. Check: Is cache invalidation working?
4. Last resort: Force `refreshColorCache()` to always refresh (remove timestamp check)

### If users report: "Performance is sluggish"

1. Check: Storage read count (DevTools)
2. Verify: Cache is being used (check `cacheLastUpdated`)
3. Check: Repaint throttle isn't too low
4. Last resort: Increase `CACHE_LIFETIME` to 60000ms

### If users report: "Slider doesn't work"

1. Check: `onlyCompletedStylingChanged` detection is correct
2. Verify: Storage listener isn't reloading DOM
3. Check: No overlapping listeners
4. Last resort: Temporarily disable storage listener during slider drag

