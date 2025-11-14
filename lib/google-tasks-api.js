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

  try {
    // Manifest V3: getAuthToken returns an object with a token property
    const response = await chrome.identity.getAuthToken({
      interactive: interactive,
      scopes: ['https://www.googleapis.com/auth/tasks.readonly'],
    });

    // Extract token string from response object
    const token = typeof response === 'string' ? response : response?.token;

    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutes (tokens last 60min)
      return token;
    }
  } catch (error) {
    console.error('OAuth token acquisition failed:', error);

    if (error.message?.includes('OAuth2 not granted') || error.message?.includes('not granted or revoked')) {
      throw new Error('OAUTH_NOT_GRANTED');
    }

    throw error;
  }

  return null;
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
    url.searchParams.set('showHidden', 'false'); // Exclude hidden tasks

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

  // Fetch tasks from each list
  for (const list of lists) {
    try {
      const tasks = await fetchTasksInList(list.id);
      tasks.forEach((task) => {
        // CRITICAL FIX: Google Tasks API returns base64-encoded IDs,
        // but Google Calendar DOM uses decoded IDs. We need to decode them.
        let decodedId = task.id;
        try {
          decodedId = atob(task.id);
        } catch (e) {
          // If decode fails, use original ID (shouldn't happen but defensive)
          console.warn(`Failed to decode task ID ${task.id}, using original`);
        }
        mapping[decodedId] = list.id;
      });
      totalTasks += tasks.length;
    } catch (error) {
      console.error(`Failed to fetch tasks for list "${list.title}":`, error.message);
      // Continue with other lists
    }
  }

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
        // Decode base64 task ID to match Google Calendar DOM
        let decodedId = task.id;
        try {
          decodedId = atob(task.id);
        } catch (e) {
          console.warn(`Failed to decode task ID ${task.id}, using original`);
        }

        if (task.deleted) {
          // Remove deleted tasks from mapping
          if (updatedMapping[decodedId]) {
            delete updatedMapping[decodedId];
            updatedCount++;
          }
        } else {
          // Add or update task in mapping (including completed tasks for styling)
          updatedMapping[decodedId] = list.id;
          updatedCount++;
        }
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
 * Check storage quota usage
 * @returns {Promise<{bytes: number, percentUsed: number}>}
 */
export async function checkStorageQuota() {
  const bytes = await chrome.storage.local.getBytesInUse();
  const maxBytes = 10 * 1024 * 1024; // 10MB
  const percentUsed = (bytes / maxBytes) * 100;

  // Only warn if storage is getting critical
  if (percentUsed > 80) {
    console.error('🚨 Storage usage critical:', percentUsed.toFixed(2) + '%');
  }

  return { bytes, percentUsed };
}

// ========================================
// EXPORTS
// ========================================

// All functions exported at top of file for ES6 module syntax
