// cc3 storage utilities (no module syntax to keep content scripts simple)
(function () {
  const DEFAULT_PRESET_COLORS = [
    '#FDE68A',
    '#BFDBFE',
    '#C7D2FE',
    '#FBCFE8',
    '#BBF7D0',
    '#FCA5A5',
    '#A7F3D0',
    '#F5D0FE',
    '#FDE68A',
    '#E9D5FF',
  ];

  const DEFAULT_TASK_PRESET_COLORS = [
    '#4285f4',
    '#34a853',
    '#ea4335',
    '#fbbc04',
    '#ff6d01',
    '#9c27b0',
    '#e91e63',
    '#00bcd4',
    '#8bc34a',
    '#ff9800',
    '#607d8b',
    '#795548',
  ];

  const DEFAULT_TASK_INLINE_COLORS = [
    '#4285f4',
    '#34a853',
    '#ea4335',
    '#fbbc04',
    '#ff6d01',
    '#9c27b0',
    '#e91e63',
    '#00bcd4',
  ];
  const DEFAULT_WEEKDAY_COLORS = {
    0: '#ffd5d5', // Sunday - Light coral/rose
    1: '#e8deff', // Monday - Light lavender
    2: '#d5f5e3', // Tuesday - Light mint
    3: '#ffe8d5', // Wednesday - Light peach
    4: '#d5f0ff', // Thursday - Light sky blue
    5: '#fff5d5', // Friday - Light yellow
    6: '#f0d5ff', // Saturday - Light lilac
  };

  const DEFAULT_WEEKDAY_OPACITY = {
    0: 30, // Sunday
    1: 30, // Monday
    2: 30, // Tuesday
    3: 30, // Wednesday
    4: 30, // Thursday
    5: 30, // Friday
    6: 30, // Saturday
  };

  const defaultSettings = {
    enabled: true, // Day coloring enabled by default
    weekdayColors: DEFAULT_WEEKDAY_COLORS,
    weekdayOpacity: DEFAULT_WEEKDAY_OPACITY,
    dateColors: {}, // 'YYYY-MM-DD' -> hex color
    presetColors: DEFAULT_PRESET_COLORS,
    weekStart: 0, // 0=Sunday, 1=Monday, 6=Saturday
    weekStartConfigured: false, // Whether user has explicitly set week start
    taskColoring: {
      enabled: true, // Individual task coloring enabled by default
      presetColors: DEFAULT_TASK_PRESET_COLORS,
      inlineColors: DEFAULT_TASK_INLINE_COLORS,
    },
    taskListColoring: {
      enabled: true, // Task list coloring enabled by default (OAuth still required)
      oauthGranted: false, // Google OAuth granted
      lastSync: null, // Last sync timestamp
      syncInterval: 5, // Sync interval in minutes
      pendingTextColors: {},
      completedStyling: {},
    },
    timeBlocking: {
      enabled: true, // Time blocking enabled by default
      globalColor: '#FFEB3B',
      shadingStyle: 'solid', // "solid" or "hashed"
      weeklySchedule: {
        mon: [],
        tue: [],
        wed: [],
        thu: [],
        fri: [],
        sat: [],
        sun: [],
      },
      dateSpecificSchedule: {}, // 'YYYY-MM-DD' -> array of timeblocks
    },
  };

  function deepMerge(base, partial) {
    // Replace-keys: when these appear at the current level, we do a hard replace
    // This ensures deletions work properly (removed keys stay removed)
    const REPLACE_KEYS = new Set([
      'dateSpecificSchedule',
      'weeklySchedule',
      'pendingTextColors', // Text colors need hard replace for deletions
      'textColors', // Text colors need hard replace for deletions
      'completedStyling', // Completed styling needs hard replace for deletions
    ]);

    // If either side isn't a plain object, prefer partial directly
    const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

    if (!isPlainObject(base) || !isPlainObject(partial)) {
      return partial;
    }

    const out = { ...base };

    for (const k in partial) {
      const pv = partial[k];

      // For arrays, always replace
      if (Array.isArray(pv)) {
        out[k] = pv;
        continue;
      }

      // For specific nested maps, hard replace (so removals stick)
      if (REPLACE_KEYS.has(k)) {
        out[k] = isPlainObject(pv) ? { ...pv } : pv;
        continue;
      }

      // Otherwise, recurse for plain objects
      if (isPlainObject(pv)) {
        out[k] = deepMerge(base[k] || {}, pv);
      } else {
        out[k] = pv; // primitives -> replace
      }
    }

    return out;
  }

  async function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ settings: defaultSettings }, (res) => {
        resolve(deepMerge(defaultSettings, res.settings || {}));
      });
    });
  }

  async function setSettings(partial) {
    const current = await getSettings();
    const next = deepMerge(current, partial);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ settings: next }, () => resolve(next));
    });
  }

  function onSettingsChanged(callback) {
    const listener = (changes, area) => {
      if (area !== 'sync' || !changes.settings) return;
      const { newValue } = changes.settings;
      // Only call callback if we have a valid newValue, avoid falling back to defaults
      // which could override user choices with default enabled: true
      if (newValue) {
        callback(newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);

    // Return unsubscribe function for cleanup
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  function ymdFromDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async function setEnabled(enabled) {
    return setSettings({ enabled });
  }
  async function setWeekdayColor(weekdayIndex, color) {
    const key = String(weekdayIndex);
    return setSettings({ weekdayColors: { [key]: color } });
  }
  async function setWeekdayOpacity(weekdayIndex, opacity) {
    const key = String(weekdayIndex);
    return setSettings({ weekdayOpacity: { [key]: opacity } });
  }
  async function setDateColor(dateKey, color) {
    if (!dateKey) return;
    const patch = { dateColors: {} };
    if (color) {
      patch.dateColors[dateKey] = color;
    } else {
      // remove
      const current = await getSettings();
      const next = { ...current.dateColors };
      delete next[dateKey];
      return setSettings({ dateColors: next });
    }
    return setSettings(patch);
  }
  async function clearDateColor(dateKey) {
    return setDateColor(dateKey, null);
  }
  async function addPresetColor(color) {
    const current = await getSettings();
    const set = new Set([...(current.presetColors || []), color]);
    return setSettings({ presetColors: Array.from(set).slice(0, 32) });
  }
  async function setWeekStart(weekStart) {
    return setSettings({ weekStart });
  }
  async function setWeekStartConfigured(configured) {
    return setSettings({ weekStartConfigured: configured });
  }

  // Task coloring functions
  async function setTaskColoringEnabled(enabled) {
    return setSettings({ taskColoring: { enabled } });
  }

  async function setTaskPresetColors(colors) {
    return setSettings({ taskColoring: { presetColors: colors } });
  }

  async function addTaskPresetColor(color) {
    const current = await getSettings();
    const currentColors = current.taskColoring?.presetColors || DEFAULT_TASK_PRESET_COLORS;
    const newColors = [...currentColors];
    if (!newColors.includes(color)) {
      newColors.push(color);
      // Limit to 12 colors
      if (newColors.length > 12) {
        newColors.shift();
      }
    }
    return setSettings({ taskColoring: { presetColors: newColors } });
  }

  async function removeTaskPresetColor(index) {
    const current = await getSettings();
    const currentColors = current.taskColoring?.presetColors || DEFAULT_TASK_PRESET_COLORS;
    const newColors = [...currentColors];
    if (index >= 0 && index < newColors.length) {
      newColors.splice(index, 1);
    }
    return setSettings({ taskColoring: { presetColors: newColors } });
  }

  async function updateTaskPresetColor(index, color) {
    const current = await getSettings();
    const currentColors = current.taskColoring?.presetColors || DEFAULT_TASK_PRESET_COLORS;
    const newColors = [...currentColors];
    if (index >= 0 && index < newColors.length) {
      newColors[index] = color;
    }
    return setSettings({ taskColoring: { presetColors: newColors } });
  }

  // Inline colors functions (for the 8 colors shown inline in modal)
  async function setTaskInlineColors(colors) {
    return setSettings({ taskColoring: { inlineColors: colors.slice(0, 8) } });
  }

  async function updateTaskInlineColor(index, color) {
    const current = await getSettings();
    const currentColors = current.taskColoring?.inlineColors || DEFAULT_TASK_INLINE_COLORS;
    const newColors = [...currentColors];
    if (index >= 0 && index < newColors.length) {
      newColors[index] = color;
    }
    return setSettings({ taskColoring: { inlineColors: newColors } });
  }

  // ========================================
  // RECURRING TASK MANUAL COLORS
  // ========================================
  // For coloring all instances of a recurring task
  // Storage: cf.recurringTaskColors[fingerprint] = color
  // Fingerprint format: "title|time" (e.g., "recur tasksss|2pm")

  // Set color for all instances of a recurring task
  async function setRecurringTaskColor(fingerprint, color) {
    if (!fingerprint) return;

    return new Promise((resolve) => {
      chrome.storage.sync.get('cf.recurringTaskColors', (result) => {
        const current = result['cf.recurringTaskColors'] || {};
        const updated = { ...current, [fingerprint]: color };

        chrome.storage.sync.set({ 'cf.recurringTaskColors': updated }, () => {
          resolve(updated);
        });
      });
    });
  }

  // Clear color for all instances of a recurring task
  async function clearRecurringTaskColor(fingerprint) {
    if (!fingerprint) return;

    return new Promise((resolve) => {
      chrome.storage.sync.get('cf.recurringTaskColors', (result) => {
        const current = result['cf.recurringTaskColors'] || {};
        const updated = { ...current };
        delete updated[fingerprint];

        chrome.storage.sync.set({ 'cf.recurringTaskColors': updated }, () => {
          resolve(updated);
        });
      });
    });
  }

  // Get all recurring task colors
  async function getRecurringTaskColors() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('cf.recurringTaskColors', (result) => {
        resolve(result['cf.recurringTaskColors'] || {});
      });
    });
  }

  // ========================================
  // TASK LIST COLORING FUNCTIONS
  // ========================================

  // Enable/disable task list coloring feature
  async function setTaskListColoringEnabled(enabled) {
    return setSettings({
      taskListColoring: { enabled },
    });
  }

  // Set default color for a task list
  async function setTaskListDefaultColor(listId, color) {
    if (!listId) return;

    return new Promise((resolve) => {
      chrome.storage.sync.get('cf.taskListColors', (result) => {
        const current = result['cf.taskListColors'] || {};
        const updated = { ...current, [listId]: color };

        chrome.storage.sync.set({ 'cf.taskListColors': updated }, () => {
          resolve(updated);
        });
      });
    });
  }

  // Set text color override for a task list
  async function setTaskListTextColor(listId, color) {
    if (!listId || !color) return;

    // Get current text colors from consolidated storage key
    const { 'cf.taskListTextColors': current } = await chrome.storage.sync.get('cf.taskListTextColors');
    const updated = { ...(current || {}), [listId]: color };

    console.log('[Storage] Setting task list text color:', { listId, color, updated });

    // Write only to consolidated key (reads merge from all sources for backward compatibility)
    await chrome.storage.sync.set({ 'cf.taskListTextColors': updated });

    // Verify it was saved
    const verify = await chrome.storage.sync.get('cf.taskListTextColors');
    console.log('[Storage] Verified text colors saved:', verify['cf.taskListTextColors']);

    return updated;
  }

  // Clear default color for a task list
  async function clearTaskListDefaultColor(listId) {
    if (!listId) return;

    return new Promise((resolve) => {
      chrome.storage.sync.get('cf.taskListColors', (result) => {
        const current = result['cf.taskListColors'] || {};
        const updated = { ...current };
        delete updated[listId];

        chrome.storage.sync.set({ 'cf.taskListColors': updated }, () => {
          resolve(updated);
        });
      });
    });
  }

  // Clear text color override for a task list
  async function clearTaskListTextColor(listId) {
    if (!listId) return;

    // Get current text colors from consolidated storage key
    const { 'cf.taskListTextColors': current } = await chrome.storage.sync.get('cf.taskListTextColors');
    const updated = { ...(current || {}) };
    delete updated[listId];

    // Write only to consolidated key (reads merge from all sources for backward compatibility)
    await chrome.storage.sync.set({ 'cf.taskListTextColors': updated });
    return updated;
  }

  // Get all list default colors
  async function getTaskListColors() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('cf.taskListColors', (result) => {
        resolve(result['cf.taskListColors'] || {});
      });
    });
  }

  // Get all task list text color overrides
  async function getTaskListTextColors() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['cf.taskListTextColors', 'settings'], (result) => {
        const direct = result['cf.taskListTextColors'] || {};
        const pending =
          result.settings?.taskListColoring?.pendingTextColors ||
          result.settings?.taskListColoring?.textColors ||
          {};
        resolve({ ...pending, ...direct });
      });
    });
  }

  // Get default color for specific task (checks priority: manual > list default > none)
  async function getDefaultColorForTask(taskId) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['cf.taskColors', 'cf.taskListColors'], async (syncResult) => {
        const taskColors = syncResult['cf.taskColors'] || {};

        // Priority 1: Check if task has manual color
        if (taskColors[taskId]) {
          resolve({ type: 'manual', color: taskColors[taskId] });
          return;
        }

        // Priority 2: Check list default
        chrome.storage.local.get('cf.taskToListMap', (localResult) => {
          const mapping = localResult['cf.taskToListMap'] || {};
          const listId = mapping[taskId];

          if (listId) {
            const listColors = syncResult['cf.taskListColors'] || {};
            const color = listColors[listId];

            if (color) {
              resolve({ type: 'list_default', color, listId });
              return;
            }
          }

          // Priority 3: No color
          resolve({ type: 'none', color: null });
        });
      });
    });
  }

  // Get task list metadata
  async function getTaskListsMeta() {
    return new Promise((resolve) => {
      chrome.storage.local.get('cf.taskListsMeta', (result) => {
        resolve(result['cf.taskListsMeta'] || []);
      });
    });
  }

  // Get task to list mapping
  async function getTaskToListMap() {
    return new Promise((resolve) => {
      chrome.storage.local.get('cf.taskToListMap', (result) => {
        resolve(result['cf.taskToListMap'] || {});
      });
    });
  }

  // ========================================
  // CALENDAR EVENT MAPPING FUNCTIONS (NEW UI)
  // ========================================

  /**
   * Set calendar event to task API ID mapping
   * @param {string} calendarEventId - Calendar event ID (e.g., "15qmhor3c7v7f60rp0teq0lak3")
   * @param {string} taskApiId - Task API ID (base64 encoded)
   * @param {Object} metadata - Optional metadata { taskFragment, title, due, listId }
   * @returns {Promise<void>}
   */
  async function setCalendarEventMapping(calendarEventId, taskApiId, metadata = {}) {
    if (!calendarEventId || !taskApiId) return;

    return new Promise((resolve) => {
      chrome.storage.local.get('cf.calendarEventMapping', (result) => {
        const mapping = result['cf.calendarEventMapping'] || {};

        mapping[calendarEventId] = {
          taskApiId,
          taskFragment: metadata.taskFragment || null,
          title: metadata.title || null,
          due: metadata.due || null,
          listId: metadata.listId || null,
          lastVerified: new Date().toISOString(),
        };

        chrome.storage.local.set({ 'cf.calendarEventMapping': mapping }, () => {
          resolve();
        });
      });
    });
  }

  /**
   * Get task API ID for a calendar event ID
   * @param {string} calendarEventId - Calendar event ID
   * @returns {Promise<string|null>} Task API ID or null
   */
  async function getCalendarEventMapping(calendarEventId) {
    if (!calendarEventId) return null;

    return new Promise((resolve) => {
      chrome.storage.local.get('cf.calendarEventMapping', (result) => {
        const mapping = result['cf.calendarEventMapping'] || {};
        const entry = mapping[calendarEventId];
        resolve(entry ? entry.taskApiId : null);
      });
    });
  }

  /**
   * Get all calendar event mappings
   * @returns {Promise<Object>} All mappings
   */
  async function getCalendarEventMappings() {
    return new Promise((resolve) => {
      chrome.storage.local.get('cf.calendarEventMapping', (result) => {
        resolve(result['cf.calendarEventMapping'] || {});
      });
    });
  }

  /**
   * Clear a specific calendar event mapping
   * @param {string} calendarEventId - Calendar event ID to clear
   * @returns {Promise<void>}
   */
  async function clearCalendarEventMapping(calendarEventId) {
    if (!calendarEventId) return;

    return new Promise((resolve) => {
      chrome.storage.local.get('cf.calendarEventMapping', (result) => {
        const mapping = result['cf.calendarEventMapping'] || {};
        delete mapping[calendarEventId];

        chrome.storage.local.set({ 'cf.calendarEventMapping': mapping }, () => {
          resolve();
        });
      });
    });
  }

  /**
   * Clear all calendar event mappings (for reset/debugging)
   * @returns {Promise<void>}
   */
  async function clearAllCalendarEventMappings() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ 'cf.calendarEventMapping': {} }, () => {
        resolve();
      });
    });
  }

  /**
   * Get calendar event mapping metadata
   * @returns {Promise<Object>} Metadata { totalMappings, lastFullSync, cacheVersion }
   */
  async function getCalendarEventMappingMeta() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['cf.calendarEventMapping', 'cf.calendarEventMappingMeta'], (result) => {
        const mapping = result['cf.calendarEventMapping'] || {};
        const meta = result['cf.calendarEventMappingMeta'] || {
          lastFullSync: null,
          totalMappings: 0,
          cacheVersion: '2.0',
        };

        // Update total count
        meta.totalMappings = Object.keys(mapping).length;

        resolve(meta);
      });
    });
  }

  /**
   * Update calendar event mapping metadata
   * @param {Object} meta - Metadata to update
   * @returns {Promise<void>}
   */
  async function setCalendarEventMappingMeta(meta) {
    return new Promise((resolve) => {
      chrome.storage.local.get('cf.calendarEventMappingMeta', (result) => {
        const current = result['cf.calendarEventMappingMeta'] || {};
        const updated = { ...current, ...meta };

        chrome.storage.local.set({ 'cf.calendarEventMappingMeta': updated }, () => {
          resolve();
        });
      });
    });
  }

  // ========================================
  // COMPLETED TASK STYLING FUNCTIONS
  // ========================================

  /**
   * Enable/disable completed task styling for a specific list
   * @param {string} listId - Task list ID
   * @param {boolean} enabled - Enable completed styling
   * @returns {Promise<Object>} Updated settings
   */
  async function setCompletedStylingEnabled(listId, enabled) {
    if (!listId) return;

    const current = await getSettings();
    const completedStyling = current.taskListColoring?.completedStyling || {};

    const listStyling = completedStyling[listId] || {};
    listStyling.enabled = enabled;

    return setSettings({
      taskListColoring: {
        completedStyling: {
          ...completedStyling,
          [listId]: listStyling,
        },
      },
    });
  }

  /**
   * Set completed task background color for a specific list
   * @param {string} listId - Task list ID
   * @param {string} color - Hex color
   * @returns {Promise<Object>} Updated settings
   */
  async function setCompletedBgColor(listId, color) {
    if (!listId) return;

    const current = await getSettings();
    const completedStyling = current.taskListColoring?.completedStyling || {};

    const listStyling = completedStyling[listId] || {};
    listStyling.bgColor = color;

    return setSettings({
      taskListColoring: {
        completedStyling: {
          ...completedStyling,
          [listId]: listStyling,
        },
      },
    });
  }

  /**
   * Set completed task text color for a specific list
   * @param {string} listId - Task list ID
   * @param {string} color - Hex color
   * @returns {Promise<Object>} Updated settings
   */
  async function setCompletedTextColor(listId, color) {
    if (!listId) return;

    const current = await getSettings();
    const completedStyling = current.taskListColoring?.completedStyling || {};

    const listStyling = completedStyling[listId] || {};
    listStyling.textColor = color;

    return setSettings({
      taskListColoring: {
        completedStyling: {
          ...completedStyling,
          [listId]: listStyling,
        },
      },
    });
  }

  /**
   * Set completed task background opacity for a specific list
   * @param {string} listId - Task list ID
   * @param {number} opacity - Opacity 0-100 or 0-1
   * @returns {Promise<Object>} Updated settings
   */
  async function setCompletedBgOpacity(listId, opacity) {
    if (!listId) return;

    const current = await getSettings();
    const completedStyling = current.taskListColoring?.completedStyling || {};

    const listStyling = completedStyling[listId] || {};
    // Normalize to 0-1 range
    listStyling.bgOpacity = opacity > 1 ? opacity / 100 : opacity;

    return setSettings({
      taskListColoring: {
        completedStyling: {
          ...completedStyling,
          [listId]: listStyling,
        },
      },
    });
  }

  /**
   * Set completed task text opacity for a specific list
   * @param {string} listId - Task list ID
   * @param {number} opacity - Opacity 0-100 or 0-1
   * @returns {Promise<Object>} Updated settings
   */
  async function setCompletedTextOpacity(listId, opacity) {
    if (!listId) return;

    const current = await getSettings();
    const completedStyling = current.taskListColoring?.completedStyling || {};

    const listStyling = completedStyling[listId] || {};
    // Normalize to 0-1 range
    listStyling.textOpacity = opacity > 1 ? opacity / 100 : opacity;

    return setSettings({
      taskListColoring: {
        completedStyling: {
          ...completedStyling,
          [listId]: listStyling,
        },
      },
    });
  }

  /**
   * Set completed task styling mode for a specific list
   * @param {string} listId - Task list ID
   * @param {string} mode - 'google' | 'inherit' | 'custom'
   * @returns {Promise<Object>} Updated settings
   */
  async function setCompletedStylingMode(listId, mode) {
    if (!listId) return;

    const current = await getSettings();
    const completedStyling = current.taskListColoring?.completedStyling || {};

    const listStyling = completedStyling[listId] || {};
    listStyling.mode = mode;

    return setSettings({
      taskListColoring: {
        completedStyling: {
          ...completedStyling,
          [listId]: listStyling,
        },
      },
    });
  }

  /**
   * Clear all completed task styling for a specific list
   * @param {string} listId - Task list ID
   * @returns {Promise<Object>} Updated settings
   */
  async function clearCompletedStyling(listId) {
    if (!listId) return;

    const current = await getSettings();
    const completedStyling = { ...(current.taskListColoring?.completedStyling || {}) };
    delete completedStyling[listId];

    return setSettings({
      taskListColoring: {
        completedStyling,
      },
    });
  }

  /**
   * Get completed task styling for a specific list
   * @param {string} listId - Task list ID
   * @returns {Promise<Object|null>} Completed styling config or null
   */
  async function getCompletedStyling(listId) {
    const settings = await getSettings();
    return settings.taskListColoring?.completedStyling?.[listId] || null;
  }

  // Time Blocking functions
  async function setTimeBlockingEnabled(enabled) {
    return setSettings({ timeBlocking: { enabled } });
  }

  async function setTimeBlockingGlobalColor(color) {
    return setSettings({ timeBlocking: { globalColor: color } });
  }

  async function setTimeBlockingShadingStyle(style) {
    return setSettings({ timeBlocking: { shadingStyle: style } });
  }

  async function setTimeBlockingSchedule(schedule) {
    return setSettings({ timeBlocking: { weeklySchedule: schedule } });
  }

  async function addTimeBlock(dayKey, timeBlock) {
    const current = await getSettings();
    const currentSchedule = current.timeBlocking?.weeklySchedule || {};
    const dayBlocks = currentSchedule[dayKey] || [];
    const newBlocks = [...dayBlocks, timeBlock];
    // Sort blocks by start time
    newBlocks.sort((a, b) => {
      const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      };
      return timeToMinutes(a.timeRange[0]) - timeToMinutes(b.timeRange[0]);
    });
    return setSettings({ timeBlocking: { weeklySchedule: { ...currentSchedule, [dayKey]: newBlocks } } });
  }

  async function removeTimeBlock(dayKey, blockIndex) {
    const current = await getSettings();
    const currentSchedule = current.timeBlocking?.weeklySchedule || {};
    const dayBlocks = currentSchedule[dayKey] || [];
    const newBlocks = dayBlocks.filter((_, index) => index !== blockIndex);
    return setSettings({ timeBlocking: { weeklySchedule: { ...currentSchedule, [dayKey]: newBlocks } } });
  }

  async function updateTimeBlock(dayKey, blockIndex, timeBlock) {
    const current = await getSettings();
    const currentSchedule = current.timeBlocking?.weeklySchedule || {};
    const dayBlocks = currentSchedule[dayKey] || [];
    const newBlocks = [...dayBlocks];
    if (blockIndex >= 0 && blockIndex < newBlocks.length) {
      newBlocks[blockIndex] = timeBlock;
      // Sort blocks by start time
      newBlocks.sort((a, b) => {
        const timeToMinutes = (time) => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };
        return timeToMinutes(a.timeRange[0]) - timeToMinutes(b.timeRange[0]);
      });
    }
    return setSettings({ timeBlocking: { weeklySchedule: { ...currentSchedule, [dayKey]: newBlocks } } });
  }

  // Date-specific timeblock functions
  async function addDateSpecificTimeBlock(dateKey, timeBlock) {
    const current = await getSettings();
    const currentSchedule = current.timeBlocking?.dateSpecificSchedule || {};
    const dateBlocks = currentSchedule[dateKey] || [];
    const newBlocks = [...dateBlocks, timeBlock];
    // Sort blocks by start time
    newBlocks.sort((a, b) => {
      const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      };
      return timeToMinutes(a.timeRange[0]) - timeToMinutes(b.timeRange[0]);
    });
    return setSettings({ timeBlocking: { dateSpecificSchedule: { ...currentSchedule, [dateKey]: newBlocks } } });
  }

  async function removeDateSpecificTimeBlock(dateKey, blockIndex) {
    const current = await getSettings();
    const currentSchedule = current.timeBlocking?.dateSpecificSchedule || {};
    const dateBlocks = currentSchedule[dateKey] || [];
    const newBlocks = dateBlocks.filter((_, index) => index !== blockIndex);

    // If no blocks left for this date, remove the date key entirely
    if (newBlocks.length === 0) {
      const updatedSchedule = { ...currentSchedule };
      delete updatedSchedule[dateKey];
      return setSettings({ timeBlocking: { dateSpecificSchedule: updatedSchedule } });
    }

    return setSettings({ timeBlocking: { dateSpecificSchedule: { ...currentSchedule, [dateKey]: newBlocks } } });
  }

  async function updateDateSpecificTimeBlock(dateKey, blockIndex, timeBlock) {
    const current = await getSettings();
    const currentSchedule = current.timeBlocking?.dateSpecificSchedule || {};
    const dateBlocks = currentSchedule[dateKey] || [];
    const newBlocks = [...dateBlocks];
    if (blockIndex >= 0 && blockIndex < newBlocks.length) {
      newBlocks[blockIndex] = timeBlock;
      // Sort blocks by start time
      newBlocks.sort((a, b) => {
        const timeToMinutes = (time) => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };
        return timeToMinutes(a.timeRange[0]) - timeToMinutes(b.timeRange[0]);
      });
    }
    return setSettings({ timeBlocking: { dateSpecificSchedule: { ...currentSchedule, [dateKey]: newBlocks } } });
  }

  async function clearDateSpecificBlocks(dateKey) {
    const current = await getSettings();
    const currentSchedule = current.timeBlocking?.dateSpecificSchedule || {};
    const updatedSchedule = { ...currentSchedule };
    delete updatedSchedule[dateKey];
    return setSettings({ timeBlocking: { dateSpecificSchedule: updatedSchedule } });
  }

  // Additional methods for feature registry compatibility
  async function get(key, defaultValue = null) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([key], (result) => {
        resolve(result[key] || defaultValue);
      });
    });
  }

  async function set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [key]: value }, () => {
        resolve();
      });
    });
  }

  async function getAll() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * Perform complete reset of all user settings and data
   * Preserves subscription status and system data
   * @returns {Promise<{success: boolean, results: object, error?: string}>}
   */
  async function performCompleteReset() {
    const results = {
      oauth: 'pending',
      syncStorage: 'pending',
      settings: 'pending',
      localStorage: 'pending',
    };

    try {
      // Step 1: Revoke OAuth Token (non-critical)
      try {
        // Check if we have a cached token to revoke
        const currentSettings = await getSettings();
        if (currentSettings?.taskListColoring?.oauthGranted) {
          // Send message to background to clear OAuth
          await chrome.runtime.sendMessage({ type: 'CLEAR_OAUTH_TOKEN' });
        }
        results.oauth = 'success';
      } catch (error) {
        results.oauth = 'failed';
        console.warn('OAuth revocation failed (non-critical):', error);
        // Continue - token will expire naturally
      }

      // Step 2: Clear Chrome Storage Sync (CRITICAL)
      const syncKeysToRemove = [
        'cf.taskColors',
        'cf.recurringTaskColors',
        'cf.taskListColors',
        'cf.taskListTextColors',
        'customDayColors',
      ];

      try {
        await new Promise((resolve, reject) => {
          chrome.storage.sync.remove(syncKeysToRemove, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        results.syncStorage = 'success';
      } catch (error) {
        results.syncStorage = 'failed';
        throw new Error(`Failed to clear sync storage: ${error.message}`);
      }

      // Step 3: Reset Settings to Defaults (CRITICAL)
      try {
        await setSettings(defaultSettings);
        results.settings = 'success';
      } catch (error) {
        results.settings = 'failed';
        throw new Error(`Failed to reset settings: ${error.message}`);
      }

      // Step 4: Clear Chrome Storage Local caches (non-critical)
      const localKeysToRemove = ['cf.taskToListMap', 'cf.taskListsMeta', 'cf.stateMachine'];

      try {
        await new Promise((resolve, reject) => {
          chrome.storage.local.remove(localKeysToRemove, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        results.localStorage = 'success';
      } catch (error) {
        results.localStorage = 'failed';
        console.warn('Local storage clear failed (non-critical):', error);
      }

      return { success: true, results };
    } catch (error) {
      console.error('CRITICAL RESET FAILURE:', error);
      return { success: false, results, error: error.message };
    }
  }

  // Expose globally under cc3Storage
  window.cc3Storage = {
    getSettings,
    setSettings,
    onSettingsChanged,
    setEnabled,
    setWeekdayColor,
    setWeekdayOpacity,
    setDateColor,
    clearDateColor,
    addPresetColor,
    setWeekStart,
    setWeekStartConfigured,
    ymdFromDate,
    defaultSettings,
    // Task coloring functions
    setTaskColoringEnabled,
    setTaskPresetColors,
    addTaskPresetColor,
    removeTaskPresetColor,
    updateTaskPresetColor,
    setTaskInlineColors,
    updateTaskInlineColor,
    // Recurring task manual colors
    setRecurringTaskColor,
    clearRecurringTaskColor,
    getRecurringTaskColors,
    // Task list coloring functions
    setTaskListColoringEnabled,
    setTaskListDefaultColor,
    setTaskListTextColor,
    clearTaskListDefaultColor,
    clearTaskListTextColor,
    getTaskListColors,
    getTaskListTextColors,
    getDefaultColorForTask,
    getTaskListsMeta,
    getTaskToListMap,
    // Calendar event mapping functions (NEW UI)
    setCalendarEventMapping,
    getCalendarEventMapping,
    getCalendarEventMappings,
    clearCalendarEventMapping,
    clearAllCalendarEventMappings,
    getCalendarEventMappingMeta,
    setCalendarEventMappingMeta,
    // Completed task styling functions
    setCompletedStylingEnabled,
    setCompletedStylingMode,
    setCompletedBgColor,
    setCompletedTextColor,
    setCompletedBgOpacity,
    setCompletedTextOpacity,
    clearCompletedStyling,
    getCompletedStyling,
    // Time blocking functions
    setTimeBlockingEnabled,
    setTimeBlockingGlobalColor,
    setTimeBlockingShadingStyle,
    setTimeBlockingSchedule,
    addTimeBlock,
    removeTimeBlock,
    updateTimeBlock,
    // Date-specific timeblock functions
    addDateSpecificTimeBlock,
    removeDateSpecificTimeBlock,
    updateDateSpecificTimeBlock,
    clearDateSpecificBlocks,
    // Feature registry compatibility
    get,
    set,
    getAll,
    // Reset function
    performCompleteReset,
  };
})();
