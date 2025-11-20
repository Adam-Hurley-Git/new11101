# ColorKit - Critical Code Locations Reference

Quick lookup table for all critical patterns and their exact file locations.

---

## Instant Feedback Mechanisms

### 1. In-Memory Cache System
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Cache variables | `features/tasks-coloring/index.js` | 130-139 | Store cached data + timestamp |
| refreshColorCache() | `features/tasks-coloring/index.js` | 967-1009 | Load cache or fetch fresh data |
| invalidateColorCache() | `features/tasks-coloring/index.js` | 1014-1021 | Force refresh on next call |
| Cache invalidation triggers | `features/tasks-coloring/index.js` | 1648-1673 | Storage listener that invalidates cache |

### 2. Debounced Repainting
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Repaint queue flag | `features/tasks-coloring/index.js` | 541 | Prevents duplicate scheduled repaints |
| doRepaint() main function | `features/tasks-coloring/index.js` | 1295-1464 | Core repainting logic with throttling |
| Throttling logic | `features/tasks-coloring/index.js` | 1318-1323 | 25ms → 100ms dynamic throttle |
| repaintSoon() dispatcher | `features/tasks-coloring/index.js` | 1466-1482 | Schedule repaint (normal or immediate) |

### 3. Navigation Detection
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| MutationObserver setup | `features/tasks-coloring/index.js` | 1579-1610 | Detect DOM mutations (navigation) |
| Mutation counting | `features/tasks-coloring/index.js` | 1580-1584 | Identify navigation patterns |
| isNavigating flag | `features/tasks-coloring/index.js` | 1576 | Prevent repaint throttle during nav |
| Multi-stage repaints | `features/tasks-coloring/index.js` | 1596-1598 | Fire at 10ms, 50ms, 150ms delays |
| Reset timeout | `features/tasks-coloring/index.js` | 1600-1604 | Hard reset after 500ms |

### 4. Parallel API Searches
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| findTaskInAllLists() | `lib/google-tasks-api.js` | 495-570 | Find task in any list (fast + fallback) |
| Fast path search | `lib/google-tasks-api.js` | 500-532 | Search last 30 seconds (parallel) |
| Fallback search | `lib/google-tasks-api.js` | 535-567 | Full search if fast path fails |
| Cache update logic | `lib/google-tasks-api.js` | 528-530, 562-564 | Store found task in mapping |

### 5. Color Priority System
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| getColorForTask() | `features/tasks-coloring/index.js` | 1042-1127 | Determine color (manual > list > none) |
| Priority 1: Manual | `features/tasks-coloring/index.js` | 1051-1101 | Highest priority colors |
| Priority 2: List | `features/tasks-coloring/index.js` | 1104-1123 | Default colors for task's list |
| Priority 3: None | `features/tasks-coloring/index.js` | 1126 | No color to apply |
| Transparent handling | `features/tasks-coloring/index.js` | 699-705 | Use Google's original colors |
| buildColorInfo() | `features/tasks-coloring/index.js` | 1129-1228 | Build final color info object |

---

## Edge Case Handling

### 1. Double Initialization Prevention
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| initialized flag | `features/tasks-coloring/index.js` | 127 | Guard against duplicate init |
| Guard check | `features/tasks-coloring/index.js` | 1486-1491 | Skip if already initialized |

### 2. Stale Element Cleanup
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| taskElementReferences | `features/tasks-coloring/index.js` | 124 | WeakMap → Element references |
| cleanupStaleReferences() | `features/tasks-coloring/index.js` | 141-147 | Remove detached DOM nodes |
| Cleanup call | `features/tasks-coloring/index.js` | 1327 | Called at start of doRepaint() |

### 3. Modal vs. Grid Distinction
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| getPaintTarget() | `features/tasks-coloring/index.js` | 32-53 | Check if element in modal |
| Modal check | `features/tasks-coloring/index.js` | 35 | Skip modal elements |
| paintTaskImmediately() | `features/tasks-coloring/index.js` | 365-406 | Apply paint to grid tasks only |
| Modal filter | `features/tasks-coloring/index.js` | 375-379 | Skip modal tasks during paint |

### 4. Google Color Capture
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| captureGoogleTaskColors() | `features/tasks-coloring/index.js` | 551-606 | Capture original colors BEFORE paint |
| Skip check | `features/tasks-coloring/index.js` | 564-572 | Don't recapture our painted colors |
| Capture timing | `features/tasks-coloring/index.js` | 1315 | Called BEFORE painting in doRepaint() |
| Unfade logic | `features/tasks-coloring/index.js` | 680-693 | Reverse Google's completed task fade |
| applyPaint() usage | `features/tasks-coloring/index.js` | 828-920 | Use captured colors in painting |

### 5. Reset Flag System
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| isResetting flag | `features/tasks-coloring/index.js` | 545 | Block repaint during reset |
| Storage listener check | `features/tasks-coloring/index.js` | 1654-1664 | Skip repaint if resetting |
| Message handler | `features/tasks-coloring/index.js` | 1688-1699 | Set/reset flag during clear |

### 6. Smart Storage Listener in Popup
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Storage listener | `popup/popup.js` | 6517-6555 | Detect change type + conditionally reload |
| Detection logic | `popup/popup.js` | 6525-6538 | Check if ONLY completedStyling changed |
| JSON comparison | `popup/popup.js` | 6529-6537 | Deep compare to find changed property |
| Conditional reload | `popup/popup.js` | 6546-6548 | Only reload if non-cosmetic change |

---

## Message Passing Architecture

### Message Handlers in Background
| Message Type | File | Lines | Handler Function |
|--------------|------|-------|------------------|
| NEW_TASK_DETECTED | `background.js` | 200-202 | handleNewTaskDetected() |
| TASK_LISTS_UPDATED | `background.js` | 750-752 | broadcastToCalendarTabs() |
| SYNC_TASK_LISTS | `background.js` | 187-190 | syncTaskLists() |
| SUBSCRIPTION_CANCELLED | `background.js` | 354 | broadcastToCalendarTabs() |
| SUBSCRIPTION_UPDATED | `background.js` | 228-234 | broadcastToCalendarTabs() |
| CHECK_SUBSCRIPTION | `background.js` | 155-158 | checkSubscriptionStatus() |

### Message Handlers in Content
| Message Type | File | Lines | Handler Function |
|--------------|------|-------|------------------|
| TASK_LISTS_UPDATED | `features/tasks-coloring/index.js` | 1676-1686 | invalidate cache + repaint |
| SUBSCRIPTION_CANCELLED | `content/index.js` | 235-238 | disableAllFeatures() |
| SUBSCRIPTION_UPDATED | `content/index.js` | 239-252 | revalidate + reload if needed |

---

## State Management & Polling

### Polling State Machine
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Polling state var | `background.js` | 636 | Current state: SLEEP/IDLE/ACTIVE |
| activeCalendarTabs | `background.js` | 637 | Track open calendar tabs |
| lastUserActivity | `background.js` | 638 | Timestamp of user activity |
| updatePollingState() | `background.js` | 955-973 | Determine new state |
| transitionPollingState() | `background.js` | 976-998 | Set alarm based on state |

### Tab Lifecycle Listeners
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| onActivated | `background.js` | 1001-1010 | Tab became active |
| onRemoved | `background.js` | 1012-1014 | Tab closed |
| onUpdated | `background.js` | 1016-1020 | Tab URL changed |

### Full Sync vs. Incremental
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| syncTaskLists() | `background.js` | 686-782 | Main sync logic |
| Full sync decision | `background.js` | 698-718 | Check if full sync needed |
| Incremental sync | `background.js` | 727-732 | Fetch changes since last sync |
| buildTaskToListMapping() | `lib/google-tasks-api.js` | 333-402 | Full sync (replace entire mapping) |
| incrementalSync() | `lib/google-tasks-api.js` | 410-478 | Incremental sync (merge changes) |

---

## Foundation/Initialization

### Script Load Order (Must maintain!)
| File | Line in manifest | Purpose | Creates |
|------|------------------|---------|---------|
| lib/storage.js | 36 | Storage API abstraction | `window.cc3Storage` |
| content/featureRegistry.js | 37 | Feature loader | `window.cc3Features` |
| features/shared/utils.js | 38 | Color picker utils | `window.cc3SharedUtils` |
| features/calendar-coloring/ | 39-42 | Day coloring feature | Registers with registry |
| features/tasks-coloring/index.js | 43 | Task coloring feature | **LARGEST FILE** |
| features/time-blocking/ | 44-45 | Time blocking feature | Registers with registry |
| content/toolbar.js | 46 | Toolbar injection | Adds toolbar to page |
| content/modalInjection.js | 47 | Modal injection | Injects color picker |
| content/index.js | 49 | **ENTRY POINT** | Initializes everything |

### Feature Registry
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Feature registry | `content/featureRegistry.js` | 4-161 | Global feature registry |
| register() | `content/featureRegistry.js` | 10-21 | Register feature |
| boot() | `content/featureRegistry.js` | 35-80 | Initialize all features |
| updateFeature() | `content/featureRegistry.js` | 83-124 | Update feature settings |

### Initialization Flow
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Subscription check | `content/index.js` | 7-27 | validateSubscriptionBeforeInit() |
| Feature boot wait | `content/index.js` | 57-74 | Wait for dependencies |
| Subscription validation | `content/index.js` | 76-80 | Only init if subscription valid |
| Feature boot | `content/index.js` | 84 | Initialize all features |
| Activity tracking | `content/index.js` | 110 | Enable smart polling |

---

## Storage Structure

### Storage Keys (Sync)
| Key | File | Purpose |
|-----|------|---------|
| `settings` | `lib/storage.js` | Main settings object |
| `cf.taskColors` | `features/tasks-coloring/index.js` | Manual task colors |
| `cf.taskListColors` | `features/tasks-coloring/index.js` | List default colors |
| `cf.taskListTextColors` | `features/tasks-coloring/index.js` | List text colors |
| `customDayColors` | `features/calendar-coloring/index.js` | User's saved colors |

### Storage Keys (Local)
| Key | File | Purpose |
|-----|------|---------|
| `cf.taskToListMap` | `lib/google-tasks-api.js` | Task ID → List ID mapping |
| `cf.taskListsMeta` | `lib/google-tasks-api.js` | List metadata (id, title, updated) |
| `subscriptionStatus` | `lib/subscription-validator.js` | Subscription state |
| `pushSubscription` | `background.js` | Web Push subscription endpoint |

---

## Performance-Critical Functions

### Must Not Block Main Thread
| Function | File | Async | Purpose |
|----------|------|-------|---------|
| doRepaint() | `features/tasks-coloring/index.js` | Yes | Painting (can be slow with 100+ tasks) |
| refreshColorCache() | `features/tasks-coloring/index.js` | Yes | Storage access (slow) |
| findTaskInAllLists() | `lib/google-tasks-api.js` | Yes | API calls (very slow) |
| broadcastToCalendarTabs() | `background.js` | Yes | Message sending |

### Must Be Cached
| Data | Cache Location | Lifetime | Invalidated By |
|------|-----------------|----------|------------------|
| Color mapping | taskToListMapCache | 30 seconds | storage changes |
| Manual colors | manualColorsCache | 30 seconds | storage changes |
| List colors | listColorsCache | 30 seconds | storage changes |
| OAuth token | cachedToken | 55 minutes | 401 error |

---

## Common Mistakes to Avoid

### ❌ Don't Do This

```javascript
// DON'T: Remove timestamp check from cache
if (taskToListMapCache) {  // Bad! Never expires
  return taskToListMapCache;
}

// DON'T: Remove modal detection
const target = getPaintTarget(taskElement);  // Returns null for modals, that's OK
applyPaint(target, color);  // Might be null, that's expected

// DON'T: Remove Google color capture
async function doRepaint(bypassThrottling = false) {
  // ... skip captureGoogleTaskColors()
  // Now can't recover original colors!
}

// DON'T: Remove Promise.all
const results = [];
for (const list of lists) {  // Sequential - slow!
  results.push(await searchList(list));
}

// DON'T: Remove storage listener invalidation
if (!isResetting) {  // What if you remove this check?
  repaintSoon();  // Might repaint with stale cache during reset
}
```

### ✅ Do This Instead

```javascript
// DO: Check timestamp before using cache
const now = Date.now();
if (taskToListMapCache && now - cacheLastUpdated < CACHE_LIFETIME) {
  return taskToListMapCache;  // Valid, use it
}

// DO: Let getPaintTarget filter modals
const target = getPaintTarget(taskElement);  // Returns null for modals
if (target) {  // Only paint non-modal elements
  applyPaint(target, color);
}

// DO: Capture before painting
async function doRepaint(bypassThrottling = false) {
  captureGoogleTaskColors();  // FIRST - before any painting
  // ... rest of paint logic
}

// DO: Use Promise.all for parallel
const searchPromises = lists.map(list => searchList(list));
const results = await Promise.all(searchPromises);  // Parallel - fast!

// DO: Check flags during cleanup
if (!isResetting) {  // Guards against stale cache
  repaintSoon();  // Only repaint if not currently resetting
}
```

