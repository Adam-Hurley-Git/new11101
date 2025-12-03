// ========================================
// GOOGLE TASKS API INTEGRATION MODULE
// ========================================
// Isolated module for Google Tasks API interactions
// Handles OAuth, task list fetching, and task-to-list mapping

// ========================================
// OAUTH TOKEN MANAGEMENT
// ========================================

let cachedToken = null;
let tokenExpiry = null;
let tokenFetchPromise = null; // Lock to prevent concurrent token requests

/**
 * Get OAuth token for Google Tasks API
 * @param {boolean} interactive - Whether to show OAuth popup
 * @returns {Promise<string|null>} OAuth token or null
 */
export async function getAuthToken(interactive = false) {
  // Check if cached token is still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  // If a token fetch is already in progress, wait for it
  if (tokenFetchPromise) {
    return tokenFetchPromise;
  }

  // Create a new fetch promise to prevent concurrent requests
  tokenFetchPromise = (async () => {
    try {
      // Manifest V3: getAuthToken returns an object with a token property
      const response = await chrome.identity.getAuthToken({
        interactive: interactive,
        scopes: [
          'https://www.googleapis.com/auth/tasks.readonly',
          'https://www.googleapis.com/auth/calendar.readonly',
        ],
      });

      // Extract token string from response object
      const token = typeof response === 'string' ? response : response?.token;

      if (token) {
        cachedToken = token;
        tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes (tokens last 60min)
        return token;
      }
      return null;
    } catch (error) {
      console.error('OAuth token acquisition failed:', error);

      if (error.message?.includes('OAuth2 not granted') || error.message?.includes('not granted or revoked')) {
        throw new Error('OAUTH_NOT_GRANTED');
      }

      throw error;
    } finally {
      tokenFetchPromise = null; // Clear lock when done
    }
  })();

  return tokenFetchPromise;
}

/**
 * Clear cached OAuth token
 */
export async function clearAuthToken() {
  if (cachedToken) {
    try {
      // Ensure we're passing a string token (defensive check)
      const tokenString = typeof cachedToken === 'string' ? cachedToken : cachedToken?.token;
      if (tokenString) {
        await chrome.identity.removeCachedAuthToken({ token: tokenString });
      }
    } catch (error) {
      console.warn('Error clearing cached token:', error);
    }
  }

  cachedToken = null;
  tokenExpiry = null;
}

/**
 * Check if OAuth has been granted
 * @returns {Promise<boolean>}
 */
export async function isAuthGranted() {
  try {
    const token = await getAuthToken(false); // Non-interactive
    return !!token;
  } catch (error) {
    return false;
  }
}

// ========================================
// API CALLS WITH ERROR HANDLING
// ========================================

const MAX_TASKS_PER_LIST = 1000; // Safety limit to prevent storage bloat
const API_BASE_URL = 'https://tasks.googleapis.com/tasks/v1';
const COMPLETED_TASKS_DAYS_LIMIT = 90; // Only sync completed tasks from last 90 days

/**
 * Fetch all task lists for the user
 * @returns {Promise<Array>} Array of task list objects
 */
export async function fetchTaskLists() {
  const token = await getAuthToken(false);
  if (!token) throw new Error('NO_AUTH_TOKEN');

  const response = await fetch(`${API_BASE_URL}/users/@me/lists`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401) {
    // Token expired, clear and retry once
    console.warn('Token expired (401), clearing cache...');
    await clearAuthToken();
    throw new Error('TOKEN_EXPIRED');
  }

  if (response.status === 429) {
    throw new Error('RATE_LIMIT');
  }

  if (!response.ok) {
    throw new Error(`API_ERROR_${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Fetch tasks from a specific task list with pagination
 * @param {string} listId - Task list ID
 * @param {string} updatedMin - RFC3339 timestamp to fetch only updated tasks
 * @returns {Promise<Array>} Array of task objects
 */
export async function fetchTasksInList(listId, updatedMin = null) {
  const token = await getAuthToken(false);
  if (!token) throw new Error('NO_AUTH_TOKEN');

  const allTasks = [];
  let pageToken = null;

  do {
    const url = new URL(`${API_BASE_URL}/lists/${listId}/tasks`);
    url.searchParams.set('maxResults', '100'); // 100 per page (API maximum)
    url.searchParams.set('showCompleted', 'true'); // Include completed tasks for styling
    url.searchParams.set('showHidden', 'true'); // MUST be true to get tasks completed in first-party clients (Calendar/Mobile)

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    if (updatedMin) {
      url.searchParams.set('updatedMin', updatedMin);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      console.warn('Token expired (401), clearing cache...');
      await clearAuthToken();
      throw new Error('TOKEN_EXPIRED');
    }

    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    if (!response.ok) {
      throw new Error(`API_ERROR_${response.status}`);
    }

    const data = await response.json();
    allTasks.push(...(data.items || []));

    pageToken = data.nextPageToken;

    // Safety limit: stop if too many tasks
    if (allTasks.length >= MAX_TASKS_PER_LIST) {
      console.warn(`List ${listId} has ${MAX_TASKS_PER_LIST}+ tasks, limiting to prevent storage bloat`);
      break;
    }
  } while (pageToken);

  return allTasks;
}

/**
 * Fetch tasks with smart completed limit
 * Fetches ALL incomplete tasks + tasks updated in last N days (includes recently completed)
 * This prevents storage bloat from years of old tasks
 * @param {string} listId - Task list ID
 * @param {number} daysLimit - Days to look back for updated/completed tasks (default 90)
 * @returns {Promise<Array>} Array of task objects
 */
export async function fetchTasksWithCompletedLimit(listId, daysLimit = COMPLETED_TASKS_DAYS_LIMIT) {
  const token = await getAuthToken(false);
  if (!token) throw new Error('NO_AUTH_TOKEN');

  const allTasks = [];
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - daysLimit);
  const updatedMin = minDate.toISOString();

  console.log(`[Tasks API] Fetching tasks for list ${listId}:`);
  console.log(`  - Using updatedMin: ${updatedMin} (${daysLimit} days ago)`);
  console.log(`  - Strategy: Fetch all tasks updated in last ${daysLimit} days (includes completed)`);

  // Fetch all tasks updated in last N days (includes both incomplete and completed)
  let pageToken = null;
  let totalFetched = 0;
  let completedCount = 0;
  let incompleteCount = 0;

  do {
    const url = new URL(`${API_BASE_URL}/lists/${listId}/tasks`);
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('showCompleted', 'true'); // Include completed tasks
    url.searchParams.set('showHidden', 'true'); // MUST be true to get tasks completed in first-party clients (Calendar/Mobile)
    url.searchParams.set('updatedMin', updatedMin); // Only tasks updated in last N days

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      console.warn('Token expired (401), clearing cache...');
      await clearAuthToken();
      throw new Error('TOKEN_EXPIRED');
    }

    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    if (!response.ok) {
      throw new Error(`API_ERROR_${response.status}`);
    }

    const data = await response.json();
    const tasks = data.items || [];

    // Count task types for logging
    tasks.forEach(t => {
      if (t.status === 'completed') {
        completedCount++;
      } else {
        incompleteCount++;
      }
    });

    allTasks.push(...tasks);
    totalFetched += tasks.length;

    pageToken = data.nextPageToken;

    // Safety limit
    if (allTasks.length >= MAX_TASKS_PER_LIST) {
      console.warn(`List ${listId} has ${MAX_TASKS_PER_LIST}+ tasks, limiting to prevent storage bloat`);
      break;
    }
  } while (pageToken);

  console.log(`[Tasks API] Fetched ${totalFetched} total tasks (${incompleteCount} incomplete, ${completedCount} completed)`);

  return allTasks;
}

/**
 * Fetch details for a specific task
 * @param {string} taskId - Task ID
 * @param {string} listId - Task list ID
 * @returns {Promise<Object>} Task object
 */
export async function fetchTaskDetails(taskId, listId) {
  const token = await getAuthToken(false);
  if (!token) throw new Error('NO_AUTH_TOKEN');

  const response = await fetch(`${API_BASE_URL}/lists/${listId}/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401) {
    await clearAuthToken();
    throw new Error('TOKEN_EXPIRED');
  }

  if (response.status === 404) {
    throw new Error('TASK_NOT_FOUND');
  }

  if (!response.ok) {
    throw new Error(`API_ERROR_${response.status}`);
  }

  return await response.json();
}

// ========================================
// MAPPING FUNCTIONS (OPTIMIZED STORAGE)
// ========================================

/**
 * Build complete task-to-list mapping (FULL SYNC)
 * Replaces entire mapping to prevent accumulation
 * @returns {Promise<Object>} Mapping object { taskId: listId }
 */
export async function buildTaskToListMapping() {
  const lists = await fetchTaskLists();
  const mapping = {};
  let totalTasks = 0;
  let completedCount = 0;
  let incompleteCount = 0;

  console.log(`[Tasks API] Starting FULL SYNC for ${lists.length} task lists...`);

  // Fetch tasks from each list (with smart completed limit)
  for (const list of lists) {
    try {
      const tasks = await fetchTasksWithCompletedLimit(list.id);
      tasks.forEach((task) => {
        // Track task status for debugging
        if (task.status === 'completed') {
          completedCount++;
        } else {
          incompleteCount++;
        }

        // Store decoded task ID (what the DOM uses for lookups)
        // Google Tasks API returns base64-encoded IDs, but Calendar DOM uses decoded IDs
        let idToStore = task.id;
        try {
          const decodedId = atob(task.id);
          if (decodedId !== task.id) {
            idToStore = decodedId;
          }
        } catch (e) {
          // Decode failed - use original ID (not base64 encoded)
        }
        mapping[idToStore] = list.id;
      });
      totalTasks += tasks.length;
    } catch (error) {
      console.error(`Failed to fetch tasks for list "${list.title}":`, error.message);
      // Continue with other lists
    }
  }

  console.log(`[Tasks API] FULL SYNC complete:`, {
    totalTasks,
    incomplete: incompleteCount,
    completed: completedCount,
    completedLimit: `${COMPLETED_TASKS_DAYS_LIMIT} days`,
    mappingEntries: Object.keys(mapping).length,
  });

  // Cache the mapping (REPLACE, not merge - prevents accumulation)
  await chrome.storage.local.set({ 'cf.taskToListMap': mapping });

  // Cache list metadata
  await chrome.storage.local.set({
    'cf.taskListsMeta': lists.map((l) => ({
      id: l.id,
      title: l.title,
      updated: l.updated,
    })),
  });

  return mapping;
}

/**
 * Incremental sync - only fetch tasks updated since last sync
 * More efficient for periodic syncs
 * @param {string} updatedMin - RFC3339 timestamp
 * @returns {Promise<Object>} Updated mapping
 */
export async function incrementalSync(updatedMin) {
  const lists = await fetchTaskLists();
  const { 'cf.taskToListMap': currentMapping } = await chrome.storage.local.get('cf.taskToListMap');

  const updatedMapping = { ...(currentMapping || {}) };
  let updatedCount = 0;

  for (const list of lists) {
    try {
      const updatedTasks = await fetchTasksInList(list.id, updatedMin);

      updatedTasks.forEach((task) => {
        // Decode task ID (DOM uses decoded format for lookups)
        let idToUse = task.id;
        try {
          const decodedId = atob(task.id);
          if (decodedId !== task.id) {
            idToUse = decodedId;
          }
        } catch (e) {
          // Decode failed - use original ID
        }

        // Add or update task in mapping
        // Note: Deleted tasks are cleaned up by periodic full sync (every 50 incremental syncs)
        // which replaces the entire mapping. No need to handle task.deleted here since
        // showDeleted parameter is not set in API calls.
        updatedMapping[idToUse] = list.id;
        updatedCount++;
      });
    } catch (error) {
      console.error(`Failed incremental sync for list "${list.title}":`, error.message);
    }
  }

  // Save updated mapping
  await chrome.storage.local.set({ 'cf.taskToListMap': updatedMapping });

  // Update list metadata
  await chrome.storage.local.set({
    'cf.taskListsMeta': lists.map((l) => ({
      id: l.id,
      title: l.title,
      updated: l.updated,
    })),
  });

  return updatedMapping;
}

/**
 * Quick lookup: Get list ID for a task (from cache)
 * @param {string} taskId - Task ID
 * @returns {Promise<string|null>} List ID or null
 */
export async function getListIdForTask(taskId) {
  const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
  return mapping?.[taskId] || null;
}

/**
 * Find task in all lists (slow, use only when not in cache)
 * @param {string} taskId - Task ID
 * @returns {Promise<{listId: string, task: Object}|null>}
 */
export async function findTaskInAllLists(taskId) {
  const lists = await fetchTaskLists();

  // FAST PATH: Search only recently updated tasks (last 30 seconds)
  // This is much faster for newly created tasks
  const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();

  const recentSearchPromises = lists.map(async (list) => {
    try {
      const recentTasks = await fetchTasksInList(list.id, thirtySecondsAgo);
      const task = recentTasks.find((t) => {
        try {
          return atob(t.id) === taskId;
        } catch (e) {
          return t.id === taskId;
        }
      });

      if (task) {
        return { listId: list.id, listTitle: list.title, task };
      }
      return null;
    } catch (error) {
      console.error(`[Fast Search] Error in fast path for list "${list.title}":`, error);
      return null;
    }
  });

  const recentResults = await Promise.all(recentSearchPromises);
  const foundRecent = recentResults.find((r) => r !== null);

  if (foundRecent) {
    // Update cache
    const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
    const updatedMapping = { ...(mapping || {}), [taskId]: foundRecent.listId };
    await chrome.storage.local.set({ 'cf.taskToListMap': updatedMapping });

    return { listId: foundRecent.listId, task: foundRecent.task };
  }

  // FALLBACK: Full search if not found in recent tasks
  const fullSearchPromises = lists.map(async (list) => {
    try {
      const tasks = await fetchTasksInList(list.id);
      const task = tasks.find((t) => {
        try {
          return atob(t.id) === taskId;
        } catch (e) {
          return t.id === taskId;
        }
      });

      if (task) {
        return { listId: list.id, listTitle: list.title, task };
      }
      return null;
    } catch (error) {
      console.error(`[Fast Search] Error in full search for list "${list.title}":`, error);
      return null;
    }
  });

  const fullResults = await Promise.all(fullSearchPromises);
  const foundFull = fullResults.find((r) => r !== null);

  if (foundFull) {
    // Update cache
    const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
    const updatedMapping = { ...(mapping || {}), [taskId]: foundFull.listId };
    await chrome.storage.local.set({ 'cf.taskToListMap': updatedMapping });

    return { listId: foundFull.listId, task: foundFull.task };
  }

  return null;
}

// ========================================
// ERROR HANDLING UTILITIES
// ========================================

/**
 * Exponential backoff for rate limiting
 * @param {number} attempt - Attempt number (0-indexed)
 * @returns {Promise<void>}
 */
export async function exponentialBackoff(attempt) {
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Safe API call with retry logic
 * @param {Function} apiFunction - API function to call
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<any>}
 */
export async function safeApiCall(apiFunction, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiFunction();
    } catch (error) {
      if (error.message === 'TOKEN_EXPIRED') {
        await clearAuthToken();
        continue; // Retry with new token
      }

      if (error.message === 'RATE_LIMIT') {
        if (attempt < maxRetries - 1) {
          await exponentialBackoff(attempt);
          continue; // Retry after backoff
        }
      }

      if (attempt === maxRetries - 1) {
        console.error('API call failed after', maxRetries, 'attempts:', error);
        throw error; // Last attempt failed
      }
    }
  }
}

// ========================================
// STORAGE MONITORING
// ========================================

/**
 * Check storage quota usage for both local and sync storage
 * @returns {Promise<{bytes: number, percentUsed: number, local: object, sync: object}>}
 */
export async function checkStorageQuota() {
  // Check LOCAL storage (10MB limit) - stores task mappings
  const localBytes = await chrome.storage.local.getBytesInUse();
  const localMaxBytes = 10 * 1024 * 1024; // 10MB
  const localPercentUsed = (localBytes / localMaxBytes) * 100;

  // Check SYNC storage (100KB limit) - stores user color preferences
  const syncBytes = await chrome.storage.sync.getBytesInUse();
  const syncMaxBytes = 102400; // 100KB (QUOTA_BYTES)
  const syncPercentUsed = (syncBytes / syncMaxBytes) * 100;

  // Warn for local storage (high threshold - 10MB is large)
  if (localPercentUsed > 80) {
    console.warn('⚠️ Local storage usage high:', localPercentUsed.toFixed(2) + '%', `(${(localBytes / 1024).toFixed(1)}KB / 10MB)`);
  }

  // Warn for sync storage (lower threshold - 100KB fills up fast with task colors)
  if (syncPercentUsed > 70) {
    console.warn('⚠️ Sync storage usage high:', syncPercentUsed.toFixed(2) + '%', `(${(syncBytes / 1024).toFixed(1)}KB / 100KB)`);
  }

  // Critical warning for sync storage - user may lose ability to save colors
  if (syncPercentUsed > 90) {
    console.error('🚨 Sync storage critical! User color preferences may fail to save.', syncPercentUsed.toFixed(2) + '%');
  }

  return {
    // Backward compatible - return local storage as primary (used by existing callers)
    bytes: localBytes,
    percentUsed: localPercentUsed,
    // New detailed breakdown
    local: {
      bytes: localBytes,
      maxBytes: localMaxBytes,
      percentUsed: localPercentUsed,
    },
    sync: {
      bytes: syncBytes,
      maxBytes: syncMaxBytes,
      percentUsed: syncPercentUsed,
    },
  };
}

// ========================================
// EXPORTS
// ========================================

// All functions exported at top of file for ES6 module syntax
