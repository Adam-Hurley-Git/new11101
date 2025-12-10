// features/tasks-coloring/index.js

function isTasksChip(el) {
  return !!el && el.nodeType === 1 && el.matches?.('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"]');
}

/**
 * Get task ID from a DOM element (supports both old and new UI)
 * OLD UI: data-eventid="tasks.{taskId}" → returns taskId synchronously
 * NEW UI: data-eventid="ttb_{base64}" → returns Promise<taskId>
 * @param {HTMLElement} el - DOM element
 * @returns {string|Promise<string>|null} Task ID (may be Promise for new UI)
 */
function getTaskIdFromChip(el) {
  if (!el || !el.getAttribute) return null;

  const ev = el.getAttribute('data-eventid');

  // OLD UI: tasks. or tasks_ prefix (direct task ID)
  if (ev && (ev.startsWith('tasks.') || ev.startsWith('tasks_'))) {
    console.log('[TaskColoring] OLD UI detected:', ev);
    return ev.slice(6); // Remove tasks. or tasks_ prefix
  }

  // NEW UI: ttb_ prefix (requires calendar event mapping)
  if (ev && ev.startsWith('ttb_')) {
    console.log('[TaskColoring] NEW UI (ttb_) detected:', ev.substring(0, 40) + '...');
    // Decode ttb_ to get calendar event ID
    const calendarEventId = decodeCalendarEventIdFromTtb(ev);
    console.log('[TaskColoring] Decoded Calendar Event ID:', calendarEventId);
    if (calendarEventId) {
      // Return Promise that resolves to task API ID
      console.log('[TaskColoring] Calling resolveCalendarEventToTaskId()...');
      return resolveCalendarEventToTaskId(calendarEventId);
    }
    console.warn('[TaskColoring] Failed to decode ttb_');
    return null;
  }

  // Fallback: data-taskid attribute
  const taskId = el.getAttribute('data-taskid');
  if (taskId) {
    console.log('[TaskColoring] Using data-taskid fallback:', taskId);
    return taskId;
  }

  // Search parent elements
  let current = el;
  while (current && current !== document.body) {
    const parentEv = current.getAttribute?.('data-eventid');

    // OLD UI in parent
    if (parentEv && (parentEv.startsWith('tasks.') || parentEv.startsWith('tasks_'))) {
      console.log('[TaskColoring] OLD UI in parent:', parentEv);
      return parentEv.slice(6); // Remove tasks. or tasks_ prefix
    }

    // NEW UI in parent
    if (parentEv && parentEv.startsWith('ttb_')) {
      console.log('[TaskColoring] NEW UI in parent:', parentEv.substring(0, 40) + '...');
      const calendarEventId = decodeCalendarEventIdFromTtb(parentEv);
      if (calendarEventId) {
        console.log('[TaskColoring] Calling resolveCalendarEventToTaskId() from parent...');
        return resolveCalendarEventToTaskId(calendarEventId);
      }
    }

    // data-taskid in parent
    const parentTaskId = current.getAttribute?.('data-taskid');
    if (parentTaskId) {
      console.log('[TaskColoring] Using parent data-taskid fallback:', parentTaskId);
      return parentTaskId;
    }

    current = current.parentNode;
  }

  console.log('[TaskColoring] No task ID found for element');
  return null;
}

/**
 * Helper to ensure we always get a resolved task ID (handles both sync and async)
 * @param {HTMLElement} el - DOM element
 * @returns {Promise<string|null>} Task ID
 */
async function getResolvedTaskId(el) {
  const result = getTaskIdFromChip(el);

  // If result is a Promise, await it
  if (result && typeof result.then === 'function') {
    return await result;
  }

  // Otherwise return directly
  return result;
}

function getPaintTarget(chip) {
  if (!chip) return null;

  const isInModal = chip.closest('[role="dialog"]');
  if (isInModal) return null;

  const taskButton = chip.querySelector?.('.GTG3wb') || chip.closest?.('.GTG3wb');
  if (taskButton && !taskButton.closest('[role="dialog"]')) {
    return taskButton;
  }

  if (chip.matches('[role="button"]')) {
    return chip;
  }

  const buttonElement = chip.querySelector?.('[role="button"]');
  if (buttonElement) {
    return buttonElement;
  }

  return chip;
}

function getGridRoot() {
  return document.querySelector('[role="grid"]') || document.body;
}

async function findTaskElementOnCalendarGrid(taskId) {
  // OLD UI: Search by exact task ID
  // NOTE: Recurring task instances have unique IDs and are matched by fingerprint, not by ID
  const oldUiElements = document.querySelectorAll(
    `[data-eventid="tasks.${taskId}"], ` +
    `[data-eventid="tasks_${taskId}"]`
  );
  for (const el of oldUiElements) {
    if (!el.closest('[role="dialog"]')) {
      return el;
    }
  }

  // NEW UI: Search all ttb_ elements and resolve them
  const newUiElements = document.querySelectorAll('[data-eventid^="ttb_"]');
  for (const ttbElement of newUiElements) {
    if (ttbElement.closest('[role="dialog"]')) {
      continue; // Skip modal elements
    }
    const resolvedId = await getResolvedTaskId(ttbElement);
    if (resolvedId === taskId) {
      return ttbElement;
    }
  }

  return null;
}

function findTaskButtonsByCharacteristics() {
  const taskButtons = [];
  const potentialTaskSelectors = ['[data-eventid*="task"]', '[data-taskid]', '.GTG3wb'];

  for (const selector of potentialTaskSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (!el.closest('[role="dialog"]') && getTaskIdFromChip(el)) {
        taskButtons.push(el);
      }
    }
  }
  return taskButtons;
}

function findTaskByContent(taskName, taskDate) {
  if (lastClickedTaskId && taskElementReferences.has(lastClickedTaskId)) {
    const storedElement = taskElementReferences.get(lastClickedTaskId);
    if (storedElement && document.contains(storedElement)) {
      return storedElement;
    }
  }

  const calendarTasks = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"]');
  for (const task of calendarTasks) {
    const taskText = task.textContent?.toLowerCase() || '';
    if (taskText.includes(taskName.toLowerCase())) {
      return task;
    }
  }

  return null;
}

async function resolveTaskIdFromEventTarget(t) {
  let taskId = await getResolvedTaskId(t);
  if (taskId) return taskId;

  const chip = t?.closest?.('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"]');
  if (chip) {
    taskId = await getResolvedTaskId(chip);
    if (taskId) return taskId;
  }

  let current = t?.parentNode;
  while (current && current !== document.body) {
    taskId = await getResolvedTaskId(current);
    if (taskId) return taskId;
    current = current.parentNode;
  }

  return null;
}

const KEY = 'cf.taskColors';
let taskElementReferences = new Map();

// Initialization guard to prevent duplicate listeners/observers
let initialized = false;

// Store references to listeners/observers for cleanup
let clickHandler = null;
let gridObserver = null;
let urlObserver = null;
let popstateHandler = null;
let repaintIntervalId = null;
let storageChangeHandler = null;
let modalSettingsUnsubscribe = null;

// PERFORMANCE: In-memory cache to avoid constant storage reads
let taskToListMapCache = null;
let listColorsCache = null;
let listTextColorsCache = null;
let completedStylingCache = null;
let manualColorsCache = null;
let recurringTaskColorsCache = null; // Manual colors for ALL instances of recurring tasks
let cacheLastUpdated = 0;
const CACHE_LIFETIME = 30000; // 30 seconds
let cachedColorMap = null;
let colorMapLastLoaded = 0;
const COLOR_MAP_CACHE_TIME = 1000; // Cache for 1 second

// CALENDAR EVENT MAPPING CACHE (NEW UI - ttb_ prefix)
let calendarEventMappingCache = null; // In-memory cache: calendarEventId → taskApiId
let calendarMappingLastUpdated = 0;
const CALENDAR_MAPPING_CACHE_LIFETIME = 30000; // 30 seconds

// RECURRING TASK FINGERPRINT CACHE (title + time → listId)
// Used to match recurring instances that aren't in the API mapping
let recurringTaskFingerprintCache = new Map(); // In-memory cache: "title|time" → listId

/**
 * Lookup value in map with base64 fallbacks
 * Tries: direct → decoded (atob) → encoded (btoa)
 * @param {Object} map - Object to search
 * @param {string} taskId - Task ID to lookup
 * @returns {*} Value if found, null otherwise
 */
function lookupWithBase64Fallback(map, taskId) {
  if (!map || !taskId) return null;

  // Try direct lookup
  if (map[taskId]) return map[taskId];

  // Try decoded (if taskId is base64)
  try {
    const decoded = atob(taskId);
    if (decoded !== taskId && map[decoded]) {
      return map[decoded];
    }
  } catch (e) {}

  // Try encoded (if taskId is decoded)
  try {
    const encoded = btoa(taskId);
    if (encoded !== taskId && map[encoded]) {
      return map[encoded];
    }
  } catch (e) {}

  return null;
}

/**
 * Get opacity values for completed manual/recurring tasks
 * @param {Object} completedStyling - Completed styling config for this list
 * @param {Object} cache - Color cache
 * @returns {{bgOpacity: number, textOpacity: number}}
 */
function getCompletedOpacities(completedStyling, cache) {
  let bgOpacity = 0.3;  // Default 30% for completed tasks
  let textOpacity = 0.3;  // Default 30% for completed tasks

  if (completedStyling) {
    // Use the task's own list opacity settings
    if (completedStyling.bgOpacity !== undefined) {
      bgOpacity = normalizeOpacityValue(completedStyling.bgOpacity, 0.3);
    }
    if (completedStyling.textOpacity !== undefined) {
      textOpacity = normalizeOpacityValue(completedStyling.textOpacity, 0.3);
    }
  } else {
    // No list for this task - find highest opacity across all lists
    const allCompletedStyling = cache.completedStyling || {};
    for (const listStyles of Object.values(allCompletedStyling)) {
      if (listStyles?.bgOpacity !== undefined) {
        const normalized = normalizeOpacityValue(listStyles.bgOpacity, 0.3);
        if (normalized > bgOpacity) bgOpacity = normalized;
      }
      if (listStyles?.textOpacity !== undefined) {
        const normalized = normalizeOpacityValue(listStyles.textOpacity, 0.3);
        if (normalized > textOpacity) textOpacity = normalized;
      }
    }
  }

  return { bgOpacity, textOpacity };
}

/**
 * Decode ttb_ prefixed data-eventid to calendar event ID
 * @param {string} ttbString - String like "ttb_MTVxbWhvcjNjN3Y3ZjYwcnAwdGVxMGxhazMgYWRhbS5odXJsZXkucHJpdmF0ZUBt"
 * @returns {string|null} Calendar event ID or null
 */
function decodeCalendarEventIdFromTtb(ttbString) {
  if (!ttbString || !ttbString.startsWith('ttb_')) {
    return null;
  }

  try {
    const base64Part = ttbString.slice(4); // Remove "ttb_" prefix
    const decoded = atob(base64Part); // Decode base64
    const parts = decoded.split(' '); // Split on space
    return parts[0] || null; // Return calendar event ID
  } catch (error) {
    console.error('[TaskColoring] Failed to decode ttb_ string:', ttbString, error);
    return null;
  }
}

/**
 * Refresh calendar event mapping cache from storage
 * @returns {Promise<Object>} Calendar event mapping cache
 */
async function refreshCalendarMappingCache() {
  const now = Date.now();

  // Return cached data if still fresh
  if (calendarEventMappingCache && now - calendarMappingLastUpdated < CALENDAR_MAPPING_CACHE_LIFETIME) {
    return calendarEventMappingCache;
  }

  // Fetch from storage
  return new Promise((resolve) => {
    chrome.storage.local.get('cf.calendarEventMapping', (result) => {
      calendarEventMappingCache = result['cf.calendarEventMapping'] || {};
      calendarMappingLastUpdated = now;
      resolve(calendarEventMappingCache);
    });
  });
}

/**
 * Resolve calendar event ID to task API ID
 * Uses cache first, falls back to Calendar API if needed
 * @param {string} calendarEventId - Calendar event ID
 * @returns {Promise<string|null>} Task API ID or null
 */
async function resolveCalendarEventToTaskId(calendarEventId) {
  if (!calendarEventId) {
    console.warn('[TaskColoring] resolveCalendarEventToTaskId called with empty ID');
    return null;
  }

  console.log('[TaskColoring] resolveCalendarEventToTaskId called for:', calendarEventId);

  try {
    // Check cache first
    const cache = await refreshCalendarMappingCache();
    if (cache[calendarEventId]) {
      console.log('[TaskColoring] ✅ Found in cache:', cache[calendarEventId].taskFragment);
      return cache[calendarEventId].taskFragment; // Return decoded fragment (matches OLD UI format)
    }

    console.log('[TaskColoring] ⚠️ NOT in cache, sending message to background...');

    // Cache miss - need to fetch from Calendar API
    // Send message to background script to handle API call
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'RESOLVE_CALENDAR_EVENT',
          calendarEventId: calendarEventId,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[TaskColoring] ❌ Chrome runtime error:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }

          if (!response) {
            console.error('[TaskColoring] ❌ No response from background script');
            resolve(null);
            return;
          }

          if (response.success && response.taskFragment) {
            console.log('[TaskColoring] ✅ Background resolved:', response.taskFragment);
            // Update cache (use taskFragment as primary - it's the decoded format compatible with OLD UI)
            if (calendarEventMappingCache) {
              calendarEventMappingCache[calendarEventId] = {
                taskApiId: response.taskFragment, // Store decoded fragment for consistency
                taskFragment: response.taskFragment,
                lastVerified: new Date().toISOString(),
              };
            }
            resolve(response.taskFragment); // Return decoded fragment (matches OLD UI format)
          } else {
            console.error('[TaskColoring] ❌ Background resolution failed:', response.error);
            resolve(null);
          }
        },
      );
    });
  } catch (error) {
    console.error('[TaskColoring] ❌ Exception in resolveCalendarEventToTaskId:', error);
    return null;
  }
}

/**
 * Invalidate calendar mapping cache (called on storage changes)
 */
function invalidateCalendarMappingCache() {
  calendarMappingLastUpdated = 0;
  calendarEventMappingCache = null;
}

/**
 * Extract title and time from task element to create a fingerprint
 * Used for matching recurring task instances that aren't in the API mapping
 * @param {HTMLElement} element - Task element
 * @returns {{title: string|null, time: string|null, fingerprint: string|null}}
 */
function extractTaskFingerprint(element) {
  if (!element) return { title: null, time: null, fingerprint: null };

  // Find the text content element (.XuJrye contains the task info)
  const textElement = element.querySelector('.XuJrye');
  if (!textElement) return { title: null, time: null, fingerprint: null };

  const textContent = textElement.textContent || '';

  // Extract title (after "task: " and before first comma)
  // Format: "task: recur tasksss, Not completed, December 7, 2025, 2pm"
  const titleMatch = textContent.match(/task:\s*([^,]+)/);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Extract time (last segment, e.g., "2pm", "3pm", "10:30am")
  // Matches: "2pm", "10am", "3:30pm", etc.
  const timeMatch = textContent.match(/(\d+(?::\d+)?(?:am|pm))\s*$/i);
  const time = timeMatch ? timeMatch[1].toLowerCase() : null;

  // Create fingerprint (null if either title or time is missing)
  const fingerprint = (title && time) ? `${title}|${time}` : null;

  if (fingerprint) {
    console.log('[TaskColoring] Extracted fingerprint:', { title, time, fingerprint });
  }

  return { title, time, fingerprint };
}

/**
 * Store a task's fingerprint in the recurring task cache
 * @param {HTMLElement} element - Task element that was successfully colored
 * @param {string} listId - List ID that this task belongs to
 */
function storeFingerprintForRecurringTasks(element, listId) {
  if (!element || !listId) return;

  const { fingerprint } = extractTaskFingerprint(element);
  if (fingerprint) {
    recurringTaskFingerprintCache.set(fingerprint, listId);
    console.log('[TaskColoring] Stored recurring task fingerprint:', fingerprint, '→', listId);
  }
}

/**
 * Try to find a list ID for a task using its fingerprint (for recurring instances)
 * @param {HTMLElement} element - Task element
 * @returns {string|null} List ID if found via fingerprint match
 */
function getListIdFromFingerprint(element) {
  if (!element) return null;

  const { fingerprint } = extractTaskFingerprint(element);
  if (!fingerprint) return null;

  const listId = recurringTaskFingerprintCache.get(fingerprint);
  if (listId) {
    console.log('[TaskColoring] ✅ Found list via fingerprint match:', fingerprint, '→', listId);
  }

  return listId || null;
}

// ========================================
// GLOBAL MESSAGE HANDLER (Always Active)
// ========================================
// This handler is registered globally and remains active even when the feature is disabled.
// This allows dynamic initialization when OAuth is granted after page load.
// Pattern matches time-blocking feature (features/time-blocking/index.js:22-36)
let globalTaskColoringMessageHandler = async (message, sender, sendResponse) => {
  // Handle TASK_LISTS_UPDATED (sent after OAuth grant or sync)
  if (message.type === 'TASK_LISTS_UPDATED') {
    console.log('[Task Coloring] Received TASK_LISTS_UPDATED');

    try {
      const settings = await window.cc3Storage.getSettings();
      const taskListColoring = settings?.taskListColoring;

      // Dynamic initialization: If OAuth granted but feature not yet initialized
      if (taskListColoring?.oauthGranted && !initialized) {
        console.log('[Task Coloring] OAuth granted - dynamically initializing feature');
        initTasksColoring();
      }

      // If already initialized, just refresh caches and repaint
      if (initialized) {
        invalidateColorCache();
        taskElementReferences.clear();
        // Force multiple aggressive repaints to catch all tasks
        repaintSoon(true); // Immediate
        setTimeout(() => repaintSoon(true), 100);
        setTimeout(() => repaintSoon(true), 500);
        setTimeout(() => repaintSoon(true), 1000);
      }
    } catch (error) {
      console.error('[Task Coloring] Error handling TASK_LISTS_UPDATED:', error);
    }
  }

  // Handle RESET_LIST_COLORS
  if (message.type === 'RESET_LIST_COLORS') {
    // Only handle if initialized
    if (initialized) {
      // Set flag to prevent storage listener from triggering repaint
      isResetting = true;

      // Unpaint all tasks from the specified list
      const { listId } = message;
      if (listId) {
        await unpaintTasksFromList(listId);
        console.log(`[ColorKit] Reset colors for list: ${listId}`);
      }

      // Reset flag after a delay (page will reload anyway)
      setTimeout(() => {
        isResetting = false;
      }, 2000);
    }
  }

  // Handle REPAINT_TASKS (for real-time updates)
  if (message.type === 'REPAINT_TASKS') {
    if (initialized) {
      invalidateColorCache();
      repaintSoon(true);
    }
  }
};

// Register the global message handler immediately (always listening)
chrome.runtime.onMessage.addListener(globalTaskColoringMessageHandler);
console.log('[Task Coloring] Global message handler registered');

function cleanupStaleReferences() {
  for (const [taskId, element] of taskElementReferences.entries()) {
    if (!element.isConnected) {
      taskElementReferences.delete(taskId);
    }
  }
}

// Clean up all listeners and observers when feature is disabled
function cleanupListeners() {
  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
  }

  if (gridObserver) {
    gridObserver.disconnect();
    gridObserver = null;
  }

  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }

  if (popstateHandler) {
    window.removeEventListener('popstate', popstateHandler);
    popstateHandler = null;
  }

  if (repaintIntervalId) {
    clearInterval(repaintIntervalId);
    repaintIntervalId = null;
  }

  if (storageChangeHandler) {
    chrome.storage.onChanged.removeListener(storageChangeHandler);
    storageChangeHandler = null;
  }

  // Note: We no longer remove the message handler here because it's now global
  // and should remain active even when the feature is disabled (for dynamic initialization)

  if (modalSettingsUnsubscribe) {
    modalSettingsUnsubscribe();
    modalSettingsUnsubscribe = null;
  }

  // Reset initialization flag so feature can be re-initialized
  initialized = false;
}

// MUTEX LOCK: Prevents race conditions in concurrent storage operations
// All writes are serialized through this promise chain to ensure atomic read-modify-write
let storageWriteLock = Promise.resolve();

async function loadMap() {
  const now = Date.now();
  if (cachedColorMap && now - colorMapLastLoaded < COLOR_MAP_CACHE_TIME) {
    return cachedColorMap;
  }

  return new Promise((res) =>
    chrome.storage.sync.get(KEY, (o) => {
      if (chrome.runtime.lastError) {
        // Storage read failed - return empty map to maintain functionality
        cachedColorMap = {};
        colorMapLastLoaded = now;
        res(cachedColorMap);
        return;
      }
      cachedColorMap = o[KEY] || {};
      colorMapLastLoaded = now;
      res(cachedColorMap);
    }),
  );
}

async function saveMap(map) {
  return new Promise((res) => chrome.storage.sync.set({ [KEY]: map }, () => {
    if (chrome.runtime.lastError) {
      // Storage write failed - resolve anyway to not break flow
    }
    res();
  }));
}

async function setTaskColor(taskId, color) {
  // Queue this operation behind any pending operations to prevent race conditions
  // This ensures atomic read-modify-write even with concurrent calls
  const operation = storageWriteLock.then(async () => {
    const map = await loadMap();
    map[taskId] = color;
    cachedColorMap = map; // Update cache immediately
    colorMapLastLoaded = Date.now(); // Refresh cache timestamp
    await saveMap(map);
    return map;
  }).catch(err => {
    console.error('Error in setTaskColor:', err);
    // Return cached map on error to maintain functionality
    return cachedColorMap || {};
  });

  // Update lock to point to this operation for next caller to wait on
  storageWriteLock = operation.catch(() => {}); // Catch here so next operation isn't blocked by errors

  return operation;
}

async function clearTaskColor(taskId) {
  // Queue this operation behind any pending operations to prevent race conditions
  const operation = storageWriteLock.then(async () => {
    const map = await loadMap();
    delete map[taskId];
    cachedColorMap = map; // Update cache immediately
    colorMapLastLoaded = Date.now(); // Refresh cache timestamp
    await saveMap(map);
    return map;
  }).catch(err => {
    console.error('Error in clearTaskColor:', err);
    // Return cached map on error to maintain functionality
    return cachedColorMap || {};
  });

  // Update lock to point to this operation for next caller to wait on
  storageWriteLock = operation.catch(() => {}); // Catch here so next operation isn't blocked by errors

  return operation;
}

async function buildInlineTaskColorRow(initial) {
  const initialColor = initial || '#4285f4';

  // Check if shared utilities are available
  if (!window.cc3SharedUtils?.createCustomColorPicker) {
    console.warn('Custom color picker utilities not available, falling back to HTML5 picker');
    return buildFallbackColorRow(initialColor);
  }

  // Load inline colors from settings
  let inlineColors = null;
  try {
    if (window.cc3Storage) {
      const settings = await window.cc3Storage.getSettings();
      inlineColors = settings?.taskColoring?.inlineColors;
    }
  } catch (error) {
    console.warn('Could not load inline colors from settings:', error);
  }

  let currentColor = initialColor;

  // Create the custom color picker with modal-specific configuration
  const colorPicker = window.cc3SharedUtils.createCustomColorPicker({
    initialColor: currentColor,
    openDirection: 'up', // Open upward in modals
    position: 'modal', // Modal positioning mode
    enableTabs: true,
    inlineColors: inlineColors, // Pass inline colors from settings
    onColorChange: (color) => {
      currentColor = color;
    },
    onApply: () => {
      // This will be handled by the modal Apply button
    },
    onClear: () => {
      // This will be handled by the modal Clear button
    },
  });

  // Create Apply and Clear buttons for the modal UI
  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply';
  applyBtn.style.cssText = `
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    background: #1a73e8;
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    margin-left: 8px;
  `;

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = `
    padding: 6px 16px;
    border: 1px solid #dadce0;
    border-radius: 4px;
    background: #f8f9fa;
    color: #3c4043;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    margin-left: 8px;
  `;

  // Add click event prevention to stop bubbling
  [applyBtn, clearBtn].forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
  });

  // Return API that matches the original interface
  return {
    colorPicker,
    colorInput: {
      get value() {
        return colorPicker.getColor();
      },
      set value(color) {
        colorPicker.setColor(color);
      },
      addEventListener: (event, handler) => {
        if (event === 'change') {
          // Store the handler to call when apply is clicked
          applyBtn._changeHandler = handler;
        }
      },
      dispatchEvent: (event) => {
        if (event.type === 'change' && applyBtn._changeHandler) {
          applyBtn._changeHandler(event);
        }
      },
    },
    applyBtn,
    clearBtn,
    presetContainer: null, // Not needed with custom picker
  };
}

// Fallback to HTML5 color picker if custom picker is not available
async function buildFallbackColorRow(initial) {
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = initial || '#4285f4';
  colorInput.style.cssText = `
    width: 37px;
    height: 37px;
    border: 2px solid #dadce0;
    border-radius: 50%;
    cursor: pointer;
    margin-right: 8px;
    transition: all 0.2s ease;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    padding: 0;
    background: none;
  `;

  // Add hover effect
  colorInput.onmouseover = () => {
    colorInput.style.borderColor = '#1a73e8';
    colorInput.style.transform = 'scale(1.05)';
  };
  colorInput.onmouseout = () => {
    colorInput.style.borderColor = '#dadce0';
    colorInput.style.transform = 'scale(1)';
  };

  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply';
  applyBtn.style.cssText = `
    padding: 4px 8px;
    border: 1px solid #dadce0;
    border-radius: 4px;
    background: #fff;
    color: #3c4043;
    cursor: pointer;
    font-size: 11px;
    margin-right: 6px;
    min-width: 50px;
    height: 24px;
  `;

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = `
    padding: 4px 8px;
    border: 1px solid #dadce0;
    border-radius: 4px;
    background: #f8f9fa;
    color: #3c4043;
    cursor: pointer;
    font-size: 11px;
    min-width: 50px;
    height: 24px;
  `;

  return { colorInput, applyBtn, clearBtn, presetContainer: null };
}

async function paintTaskImmediately(taskId, colorOverride = null, textColorOverride = null) {
  if (!taskId) return;

  const manualOverrideMap = colorOverride ? { [taskId]: colorOverride } : null;

  // OLD UI: Search by exact task ID
  // NOTE: Recurring task instances have unique IDs and are matched by fingerprint, not by ID
  const oldUiSelector =
    `[data-eventid="tasks.${taskId}"], ` +
    `[data-eventid="tasks_${taskId}"], ` +
    `[data-taskid="${taskId}"]`;
  const oldUiElements = document.querySelectorAll(oldUiSelector);

  // NEW UI: Search all ttb_ elements and resolve them
  const newUiElements = document.querySelectorAll('[data-eventid^="ttb_"]');

  // Combine both OLD and NEW UI elements
  const allTaskElements = [...oldUiElements];

  // Resolve NEW UI elements and check if they match the taskId
  for (const ttbElement of newUiElements) {
    const resolvedId = await getResolvedTaskId(ttbElement);
    if (resolvedId === taskId) {
      allTaskElements.push(ttbElement);
    }
  }

  console.log('[TaskColoring] paintTaskImmediately: Found', allTaskElements.length, 'elements for task', taskId);

  const manualReferenceMap = manualOverrideMap;

  const modalElement = document.querySelector('[role="dialog"]');

  for (const taskElement of allTaskElements) {
    if (modalElement && modalElement.contains(taskElement)) {
      continue;
    }

    const target = getPaintTarget(taskElement);
    if (!target) {
      continue;
    }

    const isCompleted = isTaskElementCompleted(taskElement);
    const colorInfo = await getColorForTask(taskId, manualReferenceMap, {
      element: taskElement,
      isCompleted,
      overrideTextColor: textColorOverride,
    });

    if (colorInfo) {
      applyPaint(target, colorInfo.backgroundColor, colorInfo.textColor, colorInfo.bgOpacity, colorInfo.textOpacity, isCompleted);

      if (!taskElementReferences.has(taskId)) {
        taskElementReferences.set(taskId, taskElement);
      }
    } else {
      clearPaint(target);
      taskElementReferences.delete(taskId);
    }
  }
}

async function injectTaskColorControls(dialogEl, taskId, onChanged) {
  if (!dialogEl || !taskId) return;

  // Don't inject for temporary or new task IDs - only for existing tasks
  if (taskId.startsWith('test-task-') || taskId.startsWith('temp-') || taskId.startsWith('new-task-')) {
    // Skip injection for temporary/new task IDs
    return;
  }

  const existingColorPicker = dialogEl.querySelector('.cf-task-color-inline-row');
  if (existingColorPicker) return;

  // Require actual task elements with real task IDs for injection
  const hasExistingTaskElements = dialogEl.querySelector('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"], [data-taskid]');

  // Only inject if we have evidence this is an existing task modal
  if (!hasExistingTaskElements) {
    // No existing task elements found - appears to be create new event modal, skip injection
    return;
  }

  const map = await loadMap();
  const initialColor = map[taskId] || '#4285f4';
  const { colorPicker, colorInput, applyBtn, clearBtn, presetContainer } = await buildInlineTaskColorRow(initialColor);

  // Immediately show the current task color in the calendar when modal opens
  if (map[taskId]) {
    // Use non-blocking immediate paint for instant modal response
    paintTaskImmediately(taskId, map[taskId]).catch(() => {
      // Silent catch - paint failure is non-critical for modal opening
    });
  }

  applyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    const selectedColor = colorPicker ? colorPicker.getColor() : colorInput.value;

    // Check if "Apply to all instances" is checked
    if (checkbox.checked) {
      // Find task element to extract fingerprint
      const taskElement = document.querySelector(`[data-eventid="tasks.${taskId}"], [data-eventid="tasks_${taskId}"], [data-taskid="${taskId}"]`);
      if (!taskElement) {
        console.warn('[TaskColoring] Could not find task element to extract fingerprint, falling back to single instance coloring');
        await setTaskColor(taskId, selectedColor);
      } else {
        const fingerprint = extractTaskFingerprint(taskElement);

        if (fingerprint.fingerprint) {
          // CRITICAL: Clear single-instance color FIRST to prevent storage listener from using stale color
          // Storage listener fires when setRecurringTaskColor writes, and checks Priority 1 before Priority 2
          await clearTaskColor(taskId);
          await window.cc3Storage.setRecurringTaskColor(fingerprint.fingerprint, selectedColor);
        } else {
          console.warn('[TaskColoring] Could not extract fingerprint, falling back to single instance coloring');
          await setTaskColor(taskId, selectedColor);
        }
      }
    } else {
      // Normal single-instance coloring
      await setTaskColor(taskId, selectedColor);
    }

    onChanged?.(taskId, selectedColor);

    // Invalidate cache immediately to force fresh data
    invalidateColorCache();

    // Wait a moment for storage listeners to finish their repaints
    await new Promise(resolve => setTimeout(resolve, 100));

    // Paint this instance using natural priority resolution (no override)
    await paintTaskImmediately(taskId, null);
  });

  clearBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Check if "Apply to all instances" is checked
    if (checkbox.checked) {
      // Find task element to extract fingerprint
      const taskElement = document.querySelector(`[data-eventid="tasks.${taskId}"], [data-eventid="tasks_${taskId}"], [data-taskid="${taskId}"]`);
      if (taskElement) {
        const fingerprint = extractTaskFingerprint(taskElement);
        if (fingerprint.fingerprint) {
          console.log('[TaskColoring] Clearing color for ALL instances with fingerprint:', fingerprint.fingerprint);
          await window.cc3Storage.clearRecurringTaskColor(fingerprint.fingerprint);
        }
      }
    }

    // Always clear single-instance color as well
    await clearTaskColor(taskId);
    onChanged?.(taskId, null);

    // Reset color picker or input to default
    if (colorPicker) {
      colorPicker.setColor('#4285f4');
    } else {
      colorInput.value = '#4285f4';
    }

    // CRITICAL FIX: Invalidate cache immediately to force fresh data
    invalidateColorCache();

    // CRITICAL FIX: Wait a moment for storage listeners to finish their repaints
    await new Promise(resolve => setTimeout(resolve, 100));

    // Now paint with null to clear colors from this instance
    await paintTaskImmediately(taskId, null);

    // REMOVED: repaintSoon was causing issues with color application
    // paintTaskImmediately already handled all instances correctly above
  });

  // Create checkbox for "Apply to all instances" (recurring tasks)
  const checkboxContainer = document.createElement('label');
  checkboxContainer.style.cssText = `
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    cursor: pointer !important;
    font-size: 11px !important;
    color: #5f6368 !important;
    user-select: none !important;
    padding: 4px 0 !important;
  `;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'cf-apply-to-all-instances';
  checkbox.style.cssText = `
    cursor: pointer !important;
    margin: 0 !important;
  `;

  const checkboxLabel = document.createElement('span');
  checkboxLabel.textContent = 'Apply to all recurring instances';
  checkboxLabel.style.cssText = `
    font-size: 11px !important;
    white-space: nowrap !important;
  `;

  checkboxContainer.appendChild(checkbox);
  checkboxContainer.appendChild(checkboxLabel);

  // Create TWO-ROW layout
  const colorPickerRow = document.createElement('div');
  colorPickerRow.style.cssText = `
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    margin-bottom: 8px !important;
  `;

  const checkboxRow = document.createElement('div');
  checkboxRow.style.cssText = `
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
  `;

  const colorRow = document.createElement('div');
  colorRow.className = 'cf-task-color-inline-row';
  colorRow.style.cssText = `
    display: flex !important;
    flex-direction: column !important;
    padding: 8px 12px !important;
    border: 1px solid #dadce0 !important;
    border-radius: 8px !important;
    background: #ffffff !important;
    margin: 8px 0 !important;
    font-family: 'Google Sans', Roboto, Arial, sans-serif !important;
    font-size: 11px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    gap: 0 !important;
  `;

  // Row 1: Color picker + buttons
  if (colorPicker) {
    colorPickerRow.appendChild(colorPicker.container);
  } else {
    colorPickerRow.appendChild(colorInput);
    if (presetContainer) {
      colorPickerRow.appendChild(presetContainer);
    }
  }
  colorPickerRow.appendChild(applyBtn);
  colorPickerRow.appendChild(clearBtn);

  // Row 2: Checkbox
  checkboxRow.appendChild(checkboxContainer);

  // Assemble the two rows
  colorRow.appendChild(colorPickerRow);
  colorRow.appendChild(checkboxRow);

  // Always place within the modal content area, never outside
  const modalContent = dialogEl.querySelector('[role="document"]') || dialogEl;

  // Look for a good insertion point within the modal, prioritizing bottom placement
  const footerArea = modalContent.querySelector('div.HcF6Td');
  if (footerArea) {
    // Insert at the beginning of the footer area to keep it inside
    footerArea.insertBefore(colorRow, footerArea.firstChild);
  } else {
    // Find any container with buttons and insert there
    const allDivs = modalContent.querySelectorAll('div');
    let buttonContainer = null;
    for (const div of allDivs) {
      if (div.querySelector('button')) {
        buttonContainer = div;
        break;
      }
    }

    if (buttonContainer) {
      buttonContainer.appendChild(colorRow);
    } else {
      // Final fallback: create a wrapper div and append to modal content
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'padding: 8px; border-top: 1px solid #dadce0; margin-top: 16px;';
      wrapper.appendChild(colorRow);
      modalContent.appendChild(wrapper);
    }
  }
}

const MARK = 'cf-task-colored';
let repaintQueued = false;
let lastClickedTaskId = null;
let lastRepaintTime = 0;
let repaintCount = 0;
let isResetting = false; // Flag to prevent repaint during reset

/**
 * Capture Google's original colors from tasks BEFORE we paint them
 * This runs early to preserve the original colors for text-only mode
 */
function captureGoogleTaskColors() {
  // Find all task elements
  const allTasks = document.querySelectorAll(`[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"]`);

  let capturedCount = 0;

  for (const taskEl of allTasks) {
    // Skip if in modal (check this early before getPaintTarget)
    if (taskEl.closest('[role="dialog"]')) continue;

    const target = getPaintTarget(taskEl);
    if (!target) continue;

    // CRITICAL: Skip tasks we've already painted - we don't want to capture our own colors
    if (target.classList.contains(MARK)) {
      continue;
    }

    // CRITICAL: Skip if we already have saved Google colors for this task
    // Only capture ONCE when task first appears, before any painting
    if (target.dataset.cfGoogleBg) {
      continue;
    }

    // Now capture Google's original colors for this unpainted task
    const computedStyle = window.getComputedStyle(target);
    const googleBg = target.style.backgroundColor || computedStyle.backgroundColor;
    const googleBorder = target.style.borderColor || computedStyle.borderColor;
    const googleText = target.style.color || computedStyle.color;

    // DEBUG: Check if this is a completed task
    const isCompleted = isTaskElementCompleted(taskEl);
    // Note: For logging, we use getTaskIdFromChip directly (may return Promise for ttb_)
    const taskIdOrPromise = getTaskIdFromChip(taskEl);

    // Save background color
    if (googleBg && googleBg !== 'rgba(0, 0, 0, 0)' && googleBg !== 'transparent') {
      target.dataset.cfGoogleBg = googleBg;
      // Track if this color was captured from a completed task (pre-faded by Google)
      target.dataset.cfGoogleBgWasCompleted = isCompleted ? 'true' : 'false';
      capturedCount++;

      // DEBUG: Log what we captured (resolve taskId if it's a Promise)
      if (typeof console !== 'undefined') {
        if (taskIdOrPromise && typeof taskIdOrPromise.then === 'function') {
          taskIdOrPromise.then(taskId => {
            console.log(`[ColorKit] Captured ${isCompleted ? 'COMPLETED' : 'pending'} task bg:`, taskId, googleBg);
          });
        } else {
          console.log(`[ColorKit] Captured ${isCompleted ? 'COMPLETED' : 'pending'} task bg:`, taskIdOrPromise, googleBg);
        }
      }
    }
    // Save border color
    if (googleBorder && googleBorder !== 'rgba(0, 0, 0, 0)' && googleBorder !== 'transparent') {
      target.dataset.cfGoogleBorder = googleBorder;
    }
    // Save text color
    if (googleText && googleText !== 'rgba(0, 0, 0, 0)' && googleText !== 'transparent') {
      target.dataset.cfGoogleText = googleText;
    }
  }
}

function parseCssColorToRGB(hex) {
  if (!hex) return { r: 66, g: 133, b: 244 }; // fallback G blue
  if (hex.startsWith('rgb')) {
    const match = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      return { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10) };
    }
  }
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function pickContrastingText(hex) {
  const { r, g, b } = parseCssColorToRGB(hex);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#111' : '#fff';
}

function normalizeOpacityValue(value, fallback = 1) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    if (value > 1) {
      return Math.min(Math.max(value, 0), 100) / 100;
    }
    return Math.min(Math.max(value, 0), 1);
  }
  return fallback;
}

function colorToRgba(color, opacity = 1) {
  const { r, g, b } = parseCssColorToRGB(color);
  const safeOpacity = normalizeOpacityValue(opacity, 1);
  return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}

/**
 * Blend a color with white based on opacity to create a solid opaque color.
 * This mimics how the color would look at reduced opacity over white, but
 * produces an opaque result that prevents colors underneath from bleeding through.
 *
 * Formula: blended = color * opacity + white * (1 - opacity)
 *
 * @param {string} color - The color to blend
 * @param {number} opacity - The opacity (0-1), where 1 = full color, 0 = white
 * @returns {string} The blended color as rgb() string
 */
function blendColorWithWhite(color, opacity = 1) {
  const { r, g, b } = parseCssColorToRGB(color);
  const safeOpacity = normalizeOpacityValue(opacity, 1);

  // Blend with white (255, 255, 255)
  const blendedR = Math.round(r * safeOpacity + 255 * (1 - safeOpacity));
  const blendedG = Math.round(g * safeOpacity + 255 * (1 - safeOpacity));
  const blendedB = Math.round(b * safeOpacity + 255 * (1 - safeOpacity));

  return `rgb(${blendedR}, ${blendedG}, ${blendedB})`;
}

/**
 * Reverse Google's pre-fading of completed task colors.
 * Google fades completed tasks by blending with white at ~70% (30% original color).
 * This function attempts to recover the original vibrant color.
 *
 * @param {string} fadedColor - The faded color captured from a completed task
 * @param {number} googleFade - Google's fade factor (default 0.3 = 30% of original)
 * @returns {string} The unfaded color as rgb() string
 */
function unfadeGoogleColor(fadedColor, googleFade = 0.3) {
  const { r, g, b } = parseCssColorToRGB(fadedColor);

  // Reverse the alpha blend with white
  // Formula: faded = original * fade + white * (1 - fade)
  // Therefore: original = (faded - white * (1 - fade)) / fade
  // Google uses ~30% of original color (70% white blend) for completed tasks
  const whiteMix = 255 * (1 - googleFade);

  const unfadedR = Math.min(255, Math.max(0, Math.round((r - whiteMix) / googleFade)));
  const unfadedG = Math.min(255, Math.max(0, Math.round((g - whiteMix) / googleFade)));
  const unfadedB = Math.min(255, Math.max(0, Math.round((b - whiteMix) / googleFade)));

  return `rgb(${unfadedR}, ${unfadedG}, ${unfadedB})`;
}

/**
 * Check if a color is transparent (used to signal "use Google's background")
 */
function isTransparentColor(color) {
  if (!color) return true;
  const normalized = color.toLowerCase().replace(/\s/g, '');
  return normalized === 'rgba(255,255,255,0)' ||
         normalized === 'transparent' ||
         normalized === 'rgba(0,0,0,0)';
}

function isTaskElementCompleted(taskElement) {
  const target = getPaintTarget(taskElement);
  if (!target) return false;

  const textElements = target.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6');
  for (const textEl of textElements) {
    const style = window.getComputedStyle(textEl);
    const decoration = style.textDecoration || style.textDecorationLine || '';
    if (decoration && decoration.includes('line-through')) {
      return true;
    }
  }

  return false;
}

function clearPaint(node) {
  if (!node) return;

  // Restore Google's original background if we have it stored
  if (node.dataset.cfGoogleBg) {
    node.style.setProperty('background-color', node.dataset.cfGoogleBg, 'important');
  } else {
    node.style.removeProperty('background-color');
  }

  if (node.dataset.cfGoogleBorder) {
    node.style.setProperty('border-color', node.dataset.cfGoogleBorder, 'important');
  } else {
    node.style.removeProperty('border-color');
  }

  node.style.removeProperty('color');
  node.style.removeProperty('-webkit-text-fill-color');
  node.style.removeProperty('--cf-task-text-color');
  node.style.removeProperty('mix-blend-mode');
  node.style.removeProperty('filter');
  node.style.removeProperty('opacity');
  delete node.dataset.cfTaskTextColor;
  delete node.dataset.cfTaskBgColor;
  delete node.dataset.cfTaskTextActual;
  // Keep cfGoogleBg and cfGoogleBorder for future use

  node.querySelectorAll?.('span, div, p, h1, h2, h3, h4, h5, h6').forEach((textEl) => {
    textEl.style.removeProperty('color');
    textEl.style.removeProperty('-webkit-text-fill-color');
    textEl.style.removeProperty('mix-blend-mode');
    textEl.style.removeProperty('filter');
    textEl.style.removeProperty('opacity');
    textEl.style.removeProperty('text-decoration-color');
  });

  node.querySelectorAll?.('svg').forEach((svg) => {
    svg.style.removeProperty('color');
    svg.style.removeProperty('fill');
    svg.style.removeProperty('opacity');
  });

  node.classList.remove(MARK);
}

/**
 * Unpaint all tasks from a specific list - returns them to Google's default styling
 * This removes ALL extension styling and lets Google's default CSS take over
 * ONLY unpaint tasks that use list default colors - preserve manually colored tasks
 *
 * IMPORTANT: This does NOT trigger a repaint - user must refresh page to see pure Google default
 */
async function unpaintTasksFromList(listId) {
  // CRITICAL: Invalidate cache FIRST to ensure we read fresh data after storage clear
  invalidateColorCache();

  // Find all task elements on the page
  const allTaskElements = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"]');

  // Get the task-to-list mapping and manual colors (will read fresh from storage)
  const cache = await refreshColorCache();
  const taskToListMap = cache.taskToListMap || {};
  const manualColors = cache.manualColors || {};

  let unpaintedCount = 0;
  let skippedManualCount = 0;

  for (const taskEl of allTaskElements) {
    const taskId = getTaskIdFromChip(taskEl);
    if (!taskId) continue;

    // Check if this task belongs to the specified list
    const taskListId = taskToListMap[taskId];
    if (taskListId === listId) {
      // CRITICAL: Skip tasks with manual colors - only unpaint list default colored tasks
      if (manualColors[taskId]) {
        skippedManualCount++;
        console.log(`[ColorKit] Skipping manually colored task: ${taskId}`);
        continue;
      }

      const paintTarget = getPaintTarget(taskEl);
      if (paintTarget) {
        // Remove ALL extension-added styles - let Google's default CSS take over
        clearPaint(paintTarget);

        // CRITICAL: Delete saved Google backgrounds to prevent them from being reapplied
        delete paintTarget.dataset.cfGoogleBg;
        delete paintTarget.dataset.cfGoogleBorder;
        delete paintTarget.dataset.cfGoogleText;

        unpaintedCount++;
      }
    }
  }

  console.log(`[ColorKit] Unpainted ${unpaintedCount} tasks from list ${listId}, preserved ${skippedManualCount} manually colored tasks`);
  console.log(`[ColorKit] User should refresh page to see pure Google default`);

  // DO NOT trigger repaint - that would reapply colors from potentially stale cache
  // User will refresh page, and with storage cleared, pure Google default will show

  return unpaintedCount;
}

function applyPaint(node, color, textColorOverride = null, bgOpacity = 1, textOpacity = 1, isCompleted = false) {
  if (!node || !color) return;

  node.classList.add(MARK);
  let text = textColorOverride || pickContrastingText(color);

  // CRITICAL FIX: If text is transparent (signals "use Google's text color")
  if (isTransparentColor(text)) {
    if (node.dataset.cfGoogleText) {
      // Use saved Google text color
      text = node.dataset.cfGoogleText;
    } else {
      // Fallback: Saved Google text not available yet, use gray as default
      text = '#5f6368';
    }
  }

  node.dataset.cfTaskTextColor = textColorOverride ? text.toLowerCase() : '';

  const textColorValue = colorToRgba(text, textOpacity);

  // CRITICAL FIX: Don't capture here - rely ONLY on captureGoogleTaskColors()
  // which runs at the right time (after Google finishes updating task state)
  // Capturing here might capture in-between states during task completion

  // CRITICAL FIX: Handle background color with opacity
  if (bgOpacity > 0) {
    let bgColorToApply = color;

    // CRITICAL FIX: If color is transparent (signals "use Google's background")
    if (isTransparentColor(color)) {
      if (node.dataset.cfGoogleBg) {
        // Use saved Google background color
        bgColorToApply = node.dataset.cfGoogleBg;

        // CRITICAL FIX: Only unfade if the captured color was from a completed task.
        // Google pre-fades completed task colors, so we need to reverse that.
        // If captured from pending task, the color is already correct - don't unfade.
        const capturedWasCompleted = node.dataset.cfGoogleBgWasCompleted === 'true';
        if (capturedWasCompleted) {
          // Unfade the color to recover the original pending task color
          bgColorToApply = unfadeGoogleColor(bgColorToApply);
        }
      } else {
        // Fallback: Saved Google color not available yet, use white as default
        bgColorToApply = '#ffffff';
      }
    }

    // Use blendColorWithWhite to create opaque color that looks faded but blocks colors underneath
    // This mimics how Google handles completed task backgrounds
    const bgColorValue = blendColorWithWhite(bgColorToApply, bgOpacity);
    node.dataset.cfTaskBgColor = bgColorValue;
    node.style.setProperty('background-color', bgColorValue, 'important');
    node.style.setProperty('border-color', bgColorValue, 'important');
    node.style.setProperty('mix-blend-mode', 'normal', 'important');
    node.style.setProperty('filter', 'none', 'important');
    node.style.setProperty('opacity', '1', 'important');
  } else {
    // Background cleared (opacity = 0) - restore Google's default background
    // This allows text-only coloring while showing Google's original task color
    if (node.dataset.cfGoogleBg) {
      node.style.setProperty('background-color', node.dataset.cfGoogleBg, 'important');
    } else {
      node.style.removeProperty('background-color');
    }

    if (node.dataset.cfGoogleBorder) {
      node.style.setProperty('border-color', node.dataset.cfGoogleBorder, 'important');
    } else {
      node.style.removeProperty('border-color');
    }

    // Don't set these properties - let Google's defaults work
    node.style.removeProperty('mix-blend-mode');
    node.style.removeProperty('filter');
    node.style.removeProperty('opacity');
    delete node.dataset.cfTaskBgColor;
  }

  // Always apply text color and text styling
  node.dataset.cfTaskTextActual = textColorValue;
  node.style.setProperty('--cf-task-text-color', textColorValue, 'important');
  node.style.setProperty('color', textColorValue, 'important');
  node.style.setProperty('-webkit-text-fill-color', textColorValue, 'important');

  // CRITICAL FIX: Always set opacity to 1 to override Google's default opacity
  // Google applies opacity: 0.6 to completed tasks, which affects text rendering
  // We need to override this even when bgOpacity = 0 (text-only coloring)
  node.style.setProperty('mix-blend-mode', 'normal', 'important');
  node.style.setProperty('filter', 'none', 'important');
  node.style.setProperty('opacity', '1', 'important');

  const textElements = node.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, h6');
  for (const textEl of textElements) {
    textEl.style.setProperty('color', textColorValue, 'important');
    textEl.style.setProperty('-webkit-text-fill-color', textColorValue, 'important');
    textEl.style.setProperty('text-decoration-color', textColorValue, 'important');

    // CRITICAL FIX: Always set opacity to 1 to override Google's default opacity
    // Google applies opacity: 0.6 to completed tasks, which would multiply with our text alpha
    // Even without background color, we need to set opacity: 1 for correct text opacity
    textEl.style.setProperty('mix-blend-mode', 'normal', 'important');
    textEl.style.setProperty('filter', 'none', 'important');
    textEl.style.setProperty('opacity', '1', 'important');
  }

  const svgElements = node.querySelectorAll('svg');
  for (const svg of svgElements) {
    svg.style.setProperty('color', textColorValue, 'important');
    svg.style.setProperty('fill', textColorValue, 'important');
    // CRITICAL FIX: Always set opacity to override Google's completed task styling
    svg.style.setProperty('opacity', '1', 'important');
  }
}
function applyPaintIfNeeded(node, colors, isCompleted = false) {
  if (!node || !colors || !colors.backgroundColor) return;

  const bgOpacity = typeof colors.bgOpacity === 'number' ? colors.bgOpacity : 1;
  const textOpacity = typeof colors.textOpacity === 'number' ? colors.textOpacity : 1;
  const fallbackText = pickContrastingText(colors.backgroundColor);
  const textColor = colors.textColor || fallbackText;
  // Use blendColorWithWhite to match what applyPaint stores
  const desiredBg = blendColorWithWhite(colors.backgroundColor, bgOpacity);
  const desiredText = colorToRgba(textColor, textOpacity);
  const currentBg = node.dataset.cfTaskBgColor;
  const currentText = node.dataset.cfTaskTextActual;

  if (node.classList.contains(MARK) && currentBg === desiredBg && currentText === desiredText) {
    return;
  }

  clearPaint(node);
  applyPaint(node, colors.backgroundColor, colors.textColor, bgOpacity, textOpacity, isCompleted);
}
/**
 * PERFORMANCE: Load all color/mapping data into memory cache
 * Reduces storage reads from ~33/sec to ~1/30sec
 */
async function refreshColorCache() {
  const now = Date.now();

  // Return cached data if still fresh
  if (taskToListMapCache && now - cacheLastUpdated < CACHE_LIFETIME) {
    return {
      taskToListMap: taskToListMapCache,
      listColors: listColorsCache,
      manualColors: manualColorsCache,
      recurringTaskColors: recurringTaskColorsCache,
      listTextColors: listTextColorsCache,
      completedStyling: completedStylingCache,
    };
  }

  // Fetch all data in parallel
  const [localData, syncData] = await Promise.all([
    chrome.storage.local.get('cf.taskToListMap'),
    chrome.storage.sync.get(['cf.taskColors', 'cf.recurringTaskColors', 'cf.taskListColors', 'cf.taskListTextColors', 'settings']),
  ]);

  // Update cache
  taskToListMapCache = localData['cf.taskToListMap'] || {};
  manualColorsCache = syncData['cf.taskColors'] || {};
  recurringTaskColorsCache = syncData['cf.recurringTaskColors'] || {};
  listColorsCache = syncData['cf.taskListColors'] || {};
  const settingsPending =
    syncData.settings?.taskListColoring?.pendingTextColors ||
    syncData.settings?.taskListColoring?.textColors ||
    {};
  listTextColorsCache = {
    ...settingsPending,
    ...(syncData['cf.taskListTextColors'] || {}),
  };
  completedStylingCache = syncData.settings?.taskListColoring?.completedStyling || {};
  cacheLastUpdated = now;

  return {
    taskToListMap: taskToListMapCache,
    listColors: listColorsCache,
    manualColors: manualColorsCache,
    recurringTaskColors: recurringTaskColorsCache,
    listTextColors: listTextColorsCache,
    completedStyling: completedStylingCache,
  };
}

/**
 * Invalidate cache when storage changes (called by storage listeners)
 */
function invalidateColorCache() {
  cacheLastUpdated = 0;
  taskToListMapCache = null;
  listColorsCache = null;
  listTextColorsCache = null;
  completedStylingCache = null;
  manualColorsCache = null;
  recurringTaskColorsCache = null;
  // Also invalidate calendar mapping cache (NEW UI)
  invalidateCalendarMappingCache();
}

/**
 * Check if task is in the cache (taskToListMap)
 * OPTIMIZED: Uses in-memory cache instead of storage read
 * @param {string} taskId - Task ID
 * @returns {Promise<boolean>} True if task is in cache
 */
async function isTaskInCache(taskId) {
  const cache = await refreshColorCache();
  return cache.taskToListMap.hasOwnProperty(taskId);
}

/**
 * Get the appropriate color for a task
 * OPTIMIZED: Uses in-memory cache instead of storage reads
 * Priority:
 *   1. Manual color for this specific instance (cf.taskColors[taskId])
 *   2. Manual color for ALL instances of recurring task (cf.recurringTaskColors[fingerprint])
 *   3. List default color (cf.taskListColors[listId]) - uses fingerprint fallback to find listId
 *   4. No color (null)
 * @param {string} taskId - Task ID
 * @param {Object} manualColorsMap - Map of manual task colors (DEPRECATED, uses cache now)
 * @param {Object} options - Options including element, isCompleted, overrideTextColor
 * @returns {Promise<string|null>} Color hex string or null
 */
async function getColorForTask(taskId, manualColorsMap = null, options = {}) {
  const cache = await refreshColorCache();
  const manualColors = manualColorsMap || cache.manualColors;
  const element = options.element; // DOM element for fingerprint matching

  // Support both base64 and decoded task ID formats
  // cf.taskToListMap stores DECODED IDs (from buildTaskToListMapping)
  // but ttb_ resolution returns BASE64 IDs (from resolveCalendarEventToTaskId)
  let listId = lookupWithBase64Fallback(cache.taskToListMap, taskId);

  // RECURRING TASK FALLBACK: Try fingerprint matching (title + time)
  // This handles recurring task instances that aren't in the API mapping
  if (!listId && element) {
    listId = getListIdFromFingerprint(element);
    if (listId) {
      console.log('[TaskColoring] ✅ Using list from fingerprint match for task:', taskId);
    }
  }

  const isCompleted = options.isCompleted === true;
  const overrideTextColor = options.overrideTextColor;
  const completedStyling = listId ? cache.completedStyling?.[listId] : null;
  const pendingTextColor = listId && cache.listTextColors ? cache.listTextColors[listId] : null;

  // Support dual-format lookup for manual colors (base64 and decoded)
  let manualColor = lookupWithBase64Fallback(manualColors, taskId);

  // PRIORITY 1: Single-instance manual color (highest priority)
  if (manualColor) {
    // Manual background color: always preserve it, even when completed
    // Don't let list's completed styling mode override manual colors

    if (isCompleted) {
      // For completed manual tasks: use manual color with opacity from list settings
      const { bgOpacity, textOpacity } = getCompletedOpacities(completedStyling, cache);
      return {
        backgroundColor: manualColor,
        textColor: overrideTextColor || pickContrastingText(manualColor),
        bgOpacity,
        textOpacity,
      };
    }

    // Pending manual task: full opacity
    return buildColorInfo({
      baseColor: manualColor,
      pendingTextColor: null, // Don't use list text color for manual backgrounds
      overrideTextColor,
      isCompleted: false,
      completedStyling: null,
    });
  }

  // PRIORITY 2: Recurring color for ALL instances (fingerprint-based matching)
  if (element && cache.recurringTaskColors) {
    const fingerprint = extractTaskFingerprint(element);
    if (fingerprint.fingerprint) {
      const recurringColor = cache.recurringTaskColors[fingerprint.fingerprint];
      if (recurringColor) {

        if (isCompleted) {
          // For completed recurring manual tasks: use manual color with opacity from list settings
          const { bgOpacity, textOpacity } = getCompletedOpacities(completedStyling, cache);
          return {
            backgroundColor: recurringColor,
            textColor: overrideTextColor || pickContrastingText(recurringColor),
            bgOpacity,
            textOpacity,
          };
        }

        // Pending recurring manual task: full opacity
        return buildColorInfo({
          baseColor: recurringColor,
          pendingTextColor: null, // Don't use list text color for manual backgrounds
          overrideTextColor,
          isCompleted: false,
          completedStyling: null,
        });
      }
    }
  }

  // PRIORITY 3: List default color (lowest priority)
  if (listId) {
    const listBgColor = cache.listColors[listId];
    const hasTextColor = !!pendingTextColor;
    // CRITICAL: Also check for mode setting, not just colors/opacity
    const hasCompletedStyling = isCompleted && completedStyling &&
      (completedStyling.mode || completedStyling.bgColor || completedStyling.textColor ||
       completedStyling.bgOpacity !== undefined || completedStyling.textOpacity !== undefined);

    // Apply colors if we have ANY setting (background, text, or completed styling)
    if (listBgColor || hasTextColor || hasCompletedStyling) {
      // Store fingerprint for recurring task matching (if element provided)
      if (element) {
        storeFingerprintForRecurringTasks(element, listId);
      }

      return buildColorInfo({
        baseColor: listBgColor, // May be undefined - buildColorInfo will handle it
        pendingTextColor,
        overrideTextColor,
        isCompleted,
        completedStyling,
      });
    }
  }

  return null;
}

function buildColorInfo({ baseColor, pendingTextColor, overrideTextColor, isCompleted, completedStyling }) {
  // COMPLETED TASKS
  if (isCompleted) {
    // Check mode: 'google' | 'inherit' | 'custom'
    // Default to 'google' - pure Google styling unless user selects otherwise
    const mode = completedStyling?.mode || 'google';

    // MODE: Google Default - Google's colors with adjustable opacity
    if (mode === 'google') {
      // Check if user has adjusted opacity sliders
      const hasOpacitySettings = completedStyling &&
        (completedStyling.bgOpacity !== undefined || completedStyling.textOpacity !== undefined);

      if (!hasOpacitySettings) {
        return null; // Pure Google default (no painting)
      }

      // Apply user's custom opacity to Google's saved original colors
      // Use transparent to signal "use saved Google background from dataset.cfGoogleBg"
      return {
        backgroundColor: 'rgba(255, 255, 255, 0)', // Transparent = use Google's original bg
        textColor: 'rgba(0, 0, 0, 0)', // Transparent = use Google's original text (will be handled in applyPaint)
        bgOpacity: normalizeOpacityValue(completedStyling?.bgOpacity, 0.3), // Default 30%
        textOpacity: normalizeOpacityValue(completedStyling?.textOpacity, 0.3), // Default 30%
      };
    }

    // MODE: Inherit Pending - use pending colors with adjustable opacity
    if (mode === 'inherit') {
      // Need pending background OR text color to apply inheritance
      if (!baseColor && !pendingTextColor && !overrideTextColor) {
        return null; // No pending colors to inherit - use Google default
      }

      // Use pending bg if available, otherwise transparent to signal "use saved Google bg"
      const bgColor = baseColor || 'rgba(255, 255, 255, 0)';
      const textColor = overrideTextColor || pendingTextColor ||
                       (baseColor ? pickContrastingText(baseColor) : 'rgba(0, 0, 0, 0)'); // Transparent = use saved Google text

      return {
        backgroundColor: bgColor,
        textColor,
        // Always allow opacity adjustment (even when using Google's default bg)
        // Default 30% for all completed task styling
        bgOpacity: normalizeOpacityValue(completedStyling?.bgOpacity, 0.3),
        textOpacity: normalizeOpacityValue(completedStyling?.textOpacity, 0.3),
      };
    }

    // MODE: Custom - fully custom colors and opacity
    // Always apply custom styling when mode is explicitly 'custom', using 30% defaults
    if (mode === 'custom') {
      // Use custom completed styling (fill in missing values with defaults)
      const defaultBgColor = 'rgba(255, 255, 255, 0)'; // Transparent = use Google's bg
      const bgColor = completedStyling.bgColor || baseColor || defaultBgColor;
      const textColor = overrideTextColor || completedStyling.textColor || pendingTextColor ||
                       (bgColor === defaultBgColor ? '#5f6368' : pickContrastingText(bgColor));

      return {
        backgroundColor: bgColor,
        textColor,
        // Default 30% for all completed task styling (matches Google's fade)
        bgOpacity: normalizeOpacityValue(completedStyling.bgOpacity, 0.3),
        textOpacity: normalizeOpacityValue(completedStyling.textOpacity, 0.3),
      };
    }

    // No custom completed styling - fallback to Google bg + pending text color
    if (pendingTextColor || overrideTextColor) {
      const textColor = overrideTextColor || pendingTextColor;

      return {
        backgroundColor: 'rgba(255, 255, 255, 0)', // Transparent - signals use Google bg
        textColor,
        bgOpacity: 0, // Restore Google's background
        textOpacity: 0.6, // Google's completed task text opacity
      };
    }

    // No styling at all - don't paint (pure Google)
    return null;
  }

  // PENDING TASKS: Use custom colors or transparent
  const hasAnyColorSetting = baseColor || pendingTextColor || overrideTextColor;
  if (!hasAnyColorSetting) return null;

  // Default to transparent if no background color
  const defaultBgColor = 'rgba(255, 255, 255, 0)';
  const bgColor = baseColor || defaultBgColor;
  const textColor = overrideTextColor || pendingTextColor ||
                   (bgColor === defaultBgColor ? '#202124' : pickContrastingText(bgColor));

  return {
    backgroundColor: bgColor,
    textColor,
    bgOpacity: baseColor ? 1 : 0, // 0 opacity if using default transparent background
    textOpacity: 1,
  };
}

// Retry mechanism for waiting until tasks are actually in the DOM
let repaintRetryCount = 0;
const MAX_REPAINT_RETRIES = 20; // Try up to 20 times
const REPAINT_RETRY_DELAY = 200; // Wait 200ms between retries

// PERFORMANCE: Prevent instant lookup spam
const pendingLookups = new Set();
const lookupDebounceTimers = new Map();
const LOOKUP_DEBOUNCE = 500; // Wait 500ms before triggering API

// Handle new task creation - instant API call for list default color
async function handleNewTaskCreated(taskId, element) {
  // Store reference immediately
  taskElementReferences.set(taskId, element);

  // PERFORMANCE: Debounce rapid lookups (e.g., user creates 5 tasks in 2 seconds)
  if (pendingLookups.has(taskId)) {
    return; // Skip duplicate lookups
  }

  // Mark as pending
  pendingLookups.add(taskId);

  // Clear existing timer for this task
  if (lookupDebounceTimers.has(taskId)) {
    clearTimeout(lookupDebounceTimers.get(taskId));
  }

  // Debounce: wait 500ms before triggering API (in case user creates multiple tasks rapidly)
  lookupDebounceTimers.set(
    taskId,
    setTimeout(async () => {
      lookupDebounceTimers.delete(taskId);

      // Check if list coloring is enabled
      const settings = await window.cc3Storage?.getSettings?.();
      if (!settings?.taskListColoring?.enabled) {
        pendingLookups.delete(taskId);
        return; // Feature disabled
      }

      // Send message to background script for instant API call
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'NEW_TASK_DETECTED',
          taskId: taskId,
        });

        if (response?.success && response.listId) {
          // Invalidate cache so the repaint picks up the new list mapping
          invalidateColorCache();

          // Trigger immediate repaint to apply list default colors
          // (don't use paintTaskImmediately with overrides - that's for manual colors!)
          repaintSoon(true);
        }
      } catch (error) {
        console.error('[Task List Colors] Error applying instant color:', error);
      } finally {
        pendingLookups.delete(taskId);
      }
    }, LOOKUP_DEBOUNCE),
  );
}

async function doRepaint(bypassThrottling = false) {
  const now = Date.now();
  repaintCount++;

  // Check if task coloring features are enabled
  let quickPickColoringEnabled = true;
  let taskListColoringEnabled = false;
  try {
    const settings = await window.cc3Storage?.getSettings?.();
    quickPickColoringEnabled = settings?.taskColoring?.enabled !== false; // Default to true if not set
    taskListColoringEnabled = settings?.taskListColoring?.enabled === true;
  } catch (e) {}

  // Early exit if both quick pick coloring and task list coloring are disabled
  if (!quickPickColoringEnabled && !taskListColoringEnabled) {
    return;
  }

  // CRITICAL: Capture Google's original colors BEFORE we paint anything
  // This ensures we have the colors for text-only mode
  captureGoogleTaskColors();

  // Apply throttling only if not bypassing
  if (!bypassThrottling) {
    // Reduced throttling during navigation for faster response
    const minInterval = repaintCount > 5 ? 100 : 25; // Faster for first few repaints
    if (now - lastRepaintTime < minInterval) return;
    if (repaintCount > 15) return; // Allow more repaints during navigation
  }

  lastRepaintTime = now;

  cleanupStaleReferences();

  // Note: We don't early exit here because we might have:
  // - Text colors set (even without background colors)
  // - Completed styling set (even without pending colors)
  // These should work independently

  const processedTaskIds = new Set();

  // First: Process stored element references (fast path)
  for (const [taskId, element] of taskElementReferences.entries()) {
    if (element.isConnected) {
      const isCompleted = isTaskElementCompleted(element);
      const colors = await getColorForTask(taskId, null, { element, isCompleted });
      if (colors && colors.backgroundColor) {
        const target = getPaintTarget(element);
        if (target) {
          applyPaintIfNeeded(target, colors, isCompleted);
          processedTaskIds.add(taskId);
        }
      }
    }
  }

  // Second: Search for ALL tasks on the page (including new ones after navigation)
  const calendarTasks = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-eventid^="ttb_"], [data-taskid]');

  let skippedModalCount = 0;
  let processedCount = 0;
  let noIdCount = 0;
  let noColorCount = 0;
  let completedCount = 0;
  let completedColoredCount = 0;

  for (const chip of calendarTasks) {
    // Skip if in modal
    if (chip.closest('[role="dialog"]')) {
      skippedModalCount++;
      continue;
    }

    const id = await getResolvedTaskId(chip);

    if (id) {
      // CRITICAL FIX: Skip if already processed in first loop (cached elements)
      // Google Calendar has nested DIVs with same data-eventid attribute
      // Only the outer DIV has .XuJrye child needed for fingerprint extraction
      // Processing the nested DIV would fail fingerprint extraction and overwrite correct colors
      if (processedTaskIds.has(id)) {
        continue;
      }

      // Check for any color (manual or list default)
      const isCompleted = isTaskElementCompleted(chip);
      if (isCompleted) {
        completedCount++;
      }
      const colors = await getColorForTask(id, null, { element: chip, isCompleted });

      if (isCompleted && colors && colors.backgroundColor) {
        completedColoredCount++;
      }

      if (colors && colors.backgroundColor) {
        processedCount++;
        // Always process tasks that have colors (manual or list default)
        const target = getPaintTarget(chip);
        if (target) {
          applyPaintIfNeeded(target, colors, isCompleted);
          processedTaskIds.add(id);

          // Store reference for future fast access
          if (!taskElementReferences.has(id)) {
            taskElementReferences.set(id, chip);
          }
        }
      } else {
        // NO COLOR FOUND - Check if this is an unknown task (not in cache)
        // If task is not in cache and list coloring is enabled, trigger instant API lookup
        if (taskListColoringEnabled && !taskElementReferences.has(id)) {
          // Check if task is in the cache before triggering API
          const inCache = await isTaskInCache(id);
          if (!inCache) {
            // Mark as tracked to avoid duplicate lookups
            taskElementReferences.set(id, chip);

            // Trigger instant API call in background (non-blocking)
            handleNewTaskCreated(id, chip);
          } else {
            // Task in cache but no list color assigned - mark as tracked
            taskElementReferences.set(id, chip);
          }
        }
        noColorCount++;
      }
    } else {
      noIdCount++;
    }
  }

  // RETRY MECHANISM: If we found 0 tasks but list coloring is enabled, keep retrying
  // This handles the case where Google Calendar hasn't rendered tasks yet
  if (calendarTasks.length === 0 && taskListColoringEnabled && repaintRetryCount < MAX_REPAINT_RETRIES) {
    repaintRetryCount++;
    setTimeout(() => {
      doRepaint(true); // Retry with bypass throttling
    }, REPAINT_RETRY_DELAY);
    return; // Exit early, retry will handle the rest
  }

  // Reset retry count when tasks are found
  if (calendarTasks.length > 0) {
    repaintRetryCount = 0;
  }

  // Third: Fallback search for any task IDs we haven't found yet
  // Load manual colors from NEW cache to check for unprocessed tasks
  const manualColorMap = await loadMap();
  const unprocessedTaskIds = Object.keys(manualColorMap).filter((id) => !processedTaskIds.has(id));
  if (unprocessedTaskIds.length > 0) {
    // More targeted search - only look for specific task IDs we need
    for (const taskId of unprocessedTaskIds) {
      const taskElements = document.querySelectorAll(
        `[data-eventid="tasks.${taskId}"], ` +
        `[data-eventid="tasks_${taskId}"], ` +
        `[data-eventid^="tasks_"][data-eventid$="${taskId}"], ` +
        `[data-taskid="${taskId}"]`
      );

      for (const element of taskElements) {
        if (!element.closest('[role="dialog"]')) {
          const target = getPaintTarget(element);
          if (target) {
            const isCompleted = isTaskElementCompleted(element);
            const colors = await getColorForTask(taskId, null, { element, isCompleted });
            if (colors && colors.backgroundColor) {
              applyPaintIfNeeded(target, colors, isCompleted);
              taskElementReferences.set(taskId, element);
            }
            break;
          }
        }
      }
    }
  }

  setTimeout(() => {
    repaintCount = 0;
  }, 1000);
}

function repaintSoon(immediate = false) {
  if (repaintQueued && !immediate) return;
  repaintQueued = true;

  if (immediate) {
    // Ultra-fast immediate repaint - no setTimeout, direct execution
    doRepaint(true).then(() => {
      repaintQueued = false;
    });
  } else {
    // Regular frame-based repaint with normal throttling
    requestAnimationFrame(async () => {
      await doRepaint(false);
      repaintQueued = false;
    });
  }
}

function initTasksColoring() {
  // Prevent duplicate initialization (listeners/observers would accumulate)
  if (initialized) {
    // Already initialized - just trigger a repaint for any new settings
    repaintSoon();
    return;
  }
  initialized = true;

  // AUTO-SYNC ON PAGE LOAD
  // Trigger incremental sync if last sync > 30 minutes ago
  (async () => {
    try {
      const settings = await window.cc3Storage.getSettings();
      const taskListColoring = settings?.taskListColoring;

      // Only auto-sync if feature is enabled and OAuth granted
      if (taskListColoring?.enabled && taskListColoring?.oauthGranted) {
        const lastSync = taskListColoring.lastSync;
        const now = Date.now();
        const THIRTY_MINUTES = 30 * 60 * 1000;

        // Check if we need to sync
        const shouldSync = !lastSync || (now - lastSync) > THIRTY_MINUTES;

        if (shouldSync) {
          // Trigger incremental sync in background
          chrome.runtime.sendMessage({ type: 'SYNC_TASK_LISTS', fullSync: false }, (response) => {
            if (chrome.runtime.lastError) {
              // Background script not ready or extension context invalidated
              return;
            }
            if (response?.success) {
              // Repaint tasks with fresh data
              setTimeout(() => {
                invalidateColorCache();
                repaintSoon();
              }, 500);
            }
          });
        }
      }
    } catch (error) {
      console.error('[Task Colors] Auto-sync check failed:', error);
    }
  })();

  // Listen for storage changes to update modal colors in real-time
  if (window.cc3Storage?.onSettingsChanged) {
    modalSettingsUnsubscribe = window.cc3Storage.onSettingsChanged((newSettings) => {
      // Refresh any open modal color controls
      const openDialog = document.querySelector('[role="dialog"]');
      if (openDialog && openDialog.querySelector('.cf-task-color-inline-row')) {
        const colorRow = openDialog.querySelector('.cf-task-color-inline-row');
        const taskId = window.cfTasksColoring?.getLastClickedTaskId?.();
        if (colorRow && taskId) {
          // Remove old color row and inject updated one with latest colors
          colorRow.remove();
          setTimeout(async () => {
            try {
              await injectTaskColorControls(openDialog, taskId);
            } catch (e) {
              console.error('Error refreshing modal color controls:', e);
            }
          }, 50);
        }
      }
    });
  }

  // Store click handler reference for cleanup
  clickHandler = async (e) => {
    // CRITICAL: Must await for NEW UI (ttb_) tasks, which return Promises
    const id = await resolveTaskIdFromEventTarget(e.target);
    if (id) {
      lastClickedTaskId = id;
      // Support both OLD UI (tasks.) and NEW UI (ttb_) selectors
      const taskElement = e.target.closest('[data-eventid^="tasks."], [data-eventid^="ttb_"]') || e.target;
      if (taskElement && !taskElement.closest('[role="dialog"]')) {
        taskElementReferences.set(id, taskElement);
      } else {
        const calendarTaskElement = await findTaskElementOnCalendarGrid(id);
        if (calendarTaskElement) {
          taskElementReferences.set(id, calendarTaskElement);
        }
      }
    }
  };
  document.addEventListener('click', clickHandler, true);

  const grid = getGridRoot();
  let mutationTimeout;
  let isNavigating = false;
  let mutationCount = 0;

  // Store grid observer reference for cleanup
  gridObserver = new MutationObserver((mutations) => {
    mutationCount++;

    // Detect navigation vs small updates by mutation count and types
    const hasLargeMutation = mutations.some((m) => m.addedNodes.length > 5);
    const isLikelyNavigation = mutationCount > 3 || hasLargeMutation;

    if (isLikelyNavigation && !isNavigating) {
      // Fast response for navigation - immediate repaint
      isNavigating = true;

      // Clear stored references during navigation for fresh discovery
      taskElementReferences.clear();

      repaintSoon();

      // Additional repaints during navigation to catch late-loading elements
      setTimeout(repaintSoon, 10);
      setTimeout(repaintSoon, 50);
      setTimeout(repaintSoon, 150);

      // Reset navigation flag after mutations settle
      setTimeout(() => {
        isNavigating = false;
        mutationCount = 0;
      }, 500);
    } else if (!isNavigating) {
      // Normal debouncing for minor updates
      clearTimeout(mutationTimeout);
      mutationTimeout = setTimeout(repaintSoon, 50);
    }
  });

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


  // Listen for URL changes (navigation events)
  let lastUrl = location.href;
  urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // URL changed - likely navigation, trigger immediate repaint
      repaintSoon();
      setTimeout(repaintSoon, 100);
      setTimeout(repaintSoon, 300);
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });

  // Also listen for popstate events (back/forward navigation)
  popstateHandler = () => {
    repaintSoon();
    setTimeout(repaintSoon, 100);
  };
  window.addEventListener('popstate', popstateHandler);

  // More frequent repaints to ensure colors appear
  repaintIntervalId = setInterval(repaintSoon, 3000);

  // Initial paint immediately and again after a short delay
  repaintSoon();
  setTimeout(repaintSoon, 500);
  setTimeout(repaintSoon, 1500);

  // PERFORMANCE: Listen for storage changes to invalidate cache
  storageChangeHandler = (changes, area) => {
    if (
      area === 'sync' &&
      (changes['cf.taskColors'] || changes['cf.taskListColors'] || changes['cf.taskListTextColors'])
    ) {
      invalidateColorCache();
      // CRITICAL: Don't repaint during reset - prevents reapplying stale colors
      if (!isResetting) {
        repaintSoon(); // Repaint with new colors
      }
    }
    if (area === 'sync' && changes.settings) {
      invalidateColorCache();
      // CRITICAL: Don't repaint during reset
      if (!isResetting) {
        repaintSoon();
      }
    }
    if (area === 'sync' && changes['cf.recurringTaskColors']) {
      invalidateColorCache();
      // Don't repaint during reset
      if (!isResetting) {
        repaintSoon();
      }
    }
    if (area === 'local' && changes['cf.taskToListMap']) {
      invalidateColorCache();
      // CRITICAL: Don't repaint during reset
      if (!isResetting) {
        repaintSoon(); // Repaint with new mappings
      }
    }
  };
  chrome.storage.onChanged.addListener(storageChangeHandler);

  // Note: Message handler is now registered globally (outside this function)
  // See globalTaskColoringMessageHandler below

  window.cfTasksColoring = {
    getLastClickedTaskId: () => lastClickedTaskId,
    getResolvedTaskId: getResolvedTaskId, // Needed by modalInjection.js for NEW UI (ttb_) support
    repaint: repaintSoon,
    initTasksColoring: initTasksColoring,
    injectTaskColorControls: injectTaskColorControls,
    // Debug functions
    getColorMap: () => loadMap(),
    debugRepaint: () => {
      doRepaint();
    },
  };
}

// Register with feature system for proper settings integration
const taskColoringFeature = {
  id: 'taskColoring',
  init: async function (settings) {
    // Only initialize if enabled
    if (settings && settings.enabled) {
      initTasksColoring();
    } else {
      // Clear any existing task colors
      clearAllTaskColors();
    }
  },
  onSettingsChanged: function (settings) {
    if (settings && settings.enabled) {
      initTasksColoring();
      // Trigger immediate repaint to apply colors
      setTimeout(() => {
        if (window.cfTasksColoring && window.cfTasksColoring.repaint) {
          window.cfTasksColoring.repaint();
        }
      }, 100);
    } else {
      clearAllTaskColors();

      // Clean up all listeners and observers
      cleanupListeners();

      // Also stop any scheduled repaints
      repaintQueued = false;
    }
  },
  // Called by disableAllFeatures() when subscription is cancelled
  disable: function () {
    clearAllTaskColors();

    // Clean up all listeners and observers
    cleanupListeners();

    // Stop any scheduled repaints
    repaintQueued = false;
  },
  teardown: function () {
    clearAllTaskColors();

    // Clean up all listeners and observers
    cleanupListeners();
  },
};

// Function to paint all tasks with default Google blue color (when feature is turned off)
function clearAllTaskColors() {
  const defaultBlue = 'rgb(66, 133, 244)'; // Google Calendar default task color

  // Find all task elements and paint them blue
  const taskElements = document.querySelectorAll('[data-eventid^="tasks."], [data-eventid^="tasks_"], [data-taskid]');

  taskElements.forEach((taskEl) => {
    if (!taskEl.closest('[role="dialog"]')) {
      // Skip modal tasks
      const target = getPaintTarget(taskEl);
      if (target) {
        // Clear any existing custom paint first
        clearPaint(target);
        // Then apply the default blue color
        applyPaint(target, defaultBlue);
      }
    }
  });

  // Clear stored references since we're disabling custom colors
  taskElementReferences.clear();
}

// Register the feature if the registry is available
if (window.cc3Features) {
  window.cc3Features.register(taskColoringFeature);
} else {
  // Fallback: auto-initialize when the module loads if registry not available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTasksColoring);
  } else {
    initTasksColoring();
  }
}