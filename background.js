// ColorKit Background Service Worker (Manifest V3)
import { CONFIG, debugLog } from './config.production.js';
import { forceRefreshSubscription, validateSubscription } from './lib/subscription-validator.js';
import * as GoogleTasksAPI from './lib/google-tasks-api.js';
import * as GoogleCalendarAPI from './lib/google-calendar-api.js';

// Service Worker Installation
chrome.runtime.onInstalled.addListener(async (details) => {
  debugLog('Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // First time install
    chrome.storage.local.set({
      firstInstall: true,
      installDate: Date.now(),
    });
  }

  // Register with Web Push API for push notifications
  // This allows server to send instant updates when subscription changes
  if (CONFIG.VAPID_PUBLIC_KEY) {
    debugLog('Scheduling Web Push registration with VAPID public key');

    // Small delay to ensure service worker is fully initialized
    setTimeout(() => {
      ensureWebPushSubscription();
    }, 2000);
  } else {
    console.warn('⚠️ VAPID public key not configured, skipping push registration');
  }

  // OPTIMIZED: Setup 3-day validation alarm (backup check at 4 AM every 3 days)
  // This ensures subscription status is checked periodically
  // even if push notifications fail
  // Reduced from daily to every 3 days since push notifications are reliable
  const now = new Date();
  const next4AM = new Date(now);
  next4AM.setHours(4, 0, 0, 0);
  if (next4AM <= now) {
    next4AM.setDate(next4AM.getDate() + 1);
  }

  chrome.alarms.create('periodic-subscription-check', {
    when: next4AM.getTime(),
    periodInMinutes: 4320, // 72 hours (3 days)
  });

  debugLog('3-day subscription check alarm set for:', next4AM.toLocaleString());
});

// Service Worker Startup
// OPTIMIZED: Only ensure push subscription is registered on startup
// No need to validate subscription - storage already has current state
chrome.runtime.onStartup.addListener(async () => {
  debugLog('Browser started, restoring state machine and ensuring Web Push subscription...');

  // Restore persisted state (lastSyncTime, incrementalSyncCount, etc.)
  await restoreStateMachineState();

  // Query ACTUAL open calendar tabs (don't trust old tab IDs from storage)
  // This handles the case where tabs were open when browser closed
  try {
    const calendarTabs = await chrome.tabs.query({
      url: 'https://calendar.google.com/*'
    });

    // Rebuild activeCalendarTabs from real tabs
    activeCalendarTabs.clear();
    for (const tab of calendarTabs) {
      if (tab.id) {
        activeCalendarTabs.add(tab.id);
      }
    }

    debugLog(`Found ${activeCalendarTabs.size} existing calendar tab(s) on startup`);

    // Restore correct polling state based on actual tabs
    await updatePollingState();
  } catch (error) {
    console.error('Failed to query calendar tabs on startup:', error);
  }

  if (CONFIG.VAPID_PUBLIC_KEY) {
    setTimeout(() => {
      // Only register push subscription, don't force validation
      // Validation happens via push notifications and 3-day alarm
      ensureWebPushSubscription();
    }, 2000);
  }
});

// Web Push Message Listener
// Receives instant notifications from server when subscription changes
// IMPORTANT: Push is just an "invalidate cache" signal - always re-validate with server
self.addEventListener('push', async (event) => {
  debugLog('Web Push received');

  try {
    const data = event.data ? event.data.json() : {};
    debugLog('Push data:', data);

    // Don't trust push payload - treat it as an invalidate signal
    // Always fetch authoritative state from server
    debugLog('Push received - re-validating subscription from server...');

    // Force refresh from server (makes API call and updates storage)
    const result = await forceRefreshSubscription();
    debugLog('Server validation result:', result.isActive ? 'Active' : 'Inactive');

    // Broadcast to calendar tabs based on subscription status
    if (!result.isActive && result.reason !== 'no_session') {
      debugLog('Subscription inactive - notifying extension to lock');
      await broadcastToCalendarTabs({ type: 'SUBSCRIPTION_CANCELLED' });
    } else if (result.isActive) {
      debugLog('Subscription active - notifying extension to unlock');
      await broadcastToCalendarTabs({ type: 'SUBSCRIPTION_UPDATED' });
    }

    // Notify popup if open to refresh display
    notifyPopup({ type: 'SUBSCRIPTION_UPDATED' });
  } catch (error) {
    console.error('Error handling push notification:', error);
  }
});

// Alarm Listeners - Periodic validation (every 3 days)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'periodic-subscription-check') {
    debugLog('Running periodic (3-day) subscription validation...');

    try {
      const result = await forceRefreshSubscription();
      debugLog('Periodic validation complete:', result.isActive ? 'Active' : 'Inactive');

      // Broadcast to calendar tabs based on subscription status
      // forceRefreshSubscription() already updated storage
      if (!result.isActive && result.reason !== 'no_session') {
        debugLog('Subscription inactive - notifying extension to lock');
        await broadcastToCalendarTabs({ type: 'SUBSCRIPTION_CANCELLED' });
        notifyPopup({ type: 'SUBSCRIPTION_UPDATED' });
      } else if (result.isActive) {
        debugLog('Subscription still active - no action needed');
        // Features already unlocked, storage already updated
      }
    } catch (error) {
      console.error('Periodic validation failed:', error);
    }
  }

  // Task list sync alarm (smart polling)
  if (alarm.name === 'task-list-sync') {
    debugLog('Periodic task list sync triggered');
    await syncTaskLists();
  }
});

// Listen for messages from web app (externally_connectable)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  debugLog('External message received from:', sender.url);

  // Verify message is from our web app
  if (sender.url && sender.url.startsWith(CONFIG.WEB_APP_URL)) {
    handleWebAppMessage(message);
    sendResponse({ received: true, status: 'success' });
  } else {
    debugLog('Message from unauthorized source:', sender.url);
    sendResponse({ received: false, status: 'unauthorized' });
  }

  return true; // Required for async sendResponse
});

// Listen for messages from popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog('Internal message received:', message.type);

  switch (message.type) {
    case 'CHECK_AUTH':
      checkAuthStatus().then(sendResponse);
      return true; // Required for async

    case 'CHECK_SUBSCRIPTION':
      // Content script asking if subscription is active
      checkSubscriptionStatus().then(sendResponse);
      return true; // Required for async

    case 'OPEN_WEB_APP':
      const url = message.path || '/onboarding';
      chrome.tabs.create({ url: `${CONFIG.WEB_APP_URL}${url}` });
      sendResponse({ opened: true });
      break;

    case 'CLEAR_AUTH':
      clearAuthData().then(() => {
        sendResponse({ cleared: true });
      });
      return true;

    case 'ENSURE_PUSH':
      // Optional: Allow popup/content script to trigger push subscription check
      ensureWebPushSubscription().then(() => {
        sendResponse({ initiated: true });
      });
      return true;

    // ========================================
    // TASK LIST COLORING MESSAGE HANDLERS
    // ========================================

    case 'GOOGLE_OAUTH_REQUEST':
      handleOAuthRequest().then(sendResponse);
      return true;

    case 'SYNC_TASK_LISTS':
      // Support fullSync parameter from popup (default: incremental)
      syncTaskLists(message.fullSync || false).then(sendResponse);
      return true;

    case 'CHECK_OAUTH_STATUS':
      checkOAuthStatus().then(sendResponse);
      return true;

    case 'GET_TASK_LISTS_META':
      getTaskListsMeta().then(sendResponse);
      return true;

    case 'NEW_TASK_DETECTED':
      handleNewTaskDetected(message.taskId).then(sendResponse);
      return true;

    case 'RESOLVE_CALENDAR_EVENT':
      // NEW: Resolve calendar event ID to task API ID (for new Google Calendar UI)
      handleResolveCalendarEvent(message.calendarEventId).then(sendResponse);
      return true;

    case 'GET_LIST_DEFAULT_COLOR':
      getListDefaultColor(message.listId).then(sendResponse);
      return true;

    case 'CALENDAR_TAB_ACTIVE':
      handleCalendarTabActive(sender.tab?.id);
      sendResponse({ received: true });
      break;

    case 'CALENDAR_TAB_INACTIVE':
      handleCalendarTabInactive(sender.tab?.id);
      sendResponse({ received: true });
      break;

    case 'USER_ACTIVITY':
      lastUserActivity = Date.now();
      updatePollingState().then(() => {
        persistStateMachineState(); // Persist after state update completes
      });
      sendResponse({ received: true });
      break;

    case 'APPLY_LIST_COLOR_TO_EXISTING':
      applyListColorToExistingTasks(message.listId, message.color).then(sendResponse);
      return true;

    case 'SUBSCRIPTION_UPDATED':
      // Notify all calendar tabs about subscription status change
      broadcastToCalendarTabs({ type: 'SUBSCRIPTION_UPDATED' }).then(() => {
        debugLog('Subscription update broadcasted to calendar tabs');
        sendResponse({ broadcasted: true });
      });
      return true;

    case 'CLEAR_OAUTH_TOKEN':
      // Clear OAuth token (called during reset)
      GoogleTasksAPI.clearAuthToken()
        .then(() => {
          debugLog('OAuth token cleared successfully');
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('Failed to clear OAuth token:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'SETTINGS_RESET_COMPLETE':
      // Handle complete reset - clear background caches
      debugLog('Settings reset complete - clearing background caches');

      // Reset polling state machine
      pollingState = 'SLEEP';
      activeCalendarTabs.clear();
      lastUserActivity = Date.now();

      // Clear state machine from storage
      chrome.storage.local.remove('cf.stateMachine', () => {
        debugLog('State machine reset');
      });

      // Clear any in-memory task list caches
      // Note: The actual storage was already cleared by performCompleteReset()
      // This just ensures background variables are reset

      sendResponse({ success: true });
      return true;

    case 'RESET_LIST_COLORS':
      // Handle individual list color reset (from popup UI)
      // This is for the "Reset Pending" and "Reset Completed" buttons
      handleResetListColors(message.listId, message.clearPending, message.clearCompleted).then(sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true;
});

// Handle messages from web app
async function handleWebAppMessage(message) {
  debugLog('Handling web app message:', message.type);

  switch (message.type) {
    case 'AUTH_SUCCESS':
      // Store Supabase session tokens
      const sessionData = {
        authenticated: true,
        authTimestamp: Date.now(),
      };

      // If session data provided, store it
      if (message.session) {
        sessionData.supabaseSession = {
          access_token: message.session.access_token,
          refresh_token: message.session.refresh_token,
          user: message.session.user,
        };
        debugLog('Supabase session tokens received and stored');
      }

      // If subscription status provided, store it
      // FAIL-OPEN: Only update if verification succeeded (verificationFailed !== true)
      if (message.subscriptionStatus) {
        if (message.subscriptionStatus.verificationFailed === true) {
          // Verification failed - don't update subscription state (preserve current)
          debugLog('⚠️ Subscription verification failed - preserving current lock state (fail-open)');
          // Don't add subscription data to sessionData - keep existing state
        } else {
          // Verification succeeded - update subscription state
          sessionData.subscriptionActive = message.subscriptionStatus.hasSubscription;
          sessionData.subscriptionStatus = {
            isActive: message.subscriptionStatus.hasSubscription,
            status: message.subscriptionStatus.status,
            message: message.subscriptionStatus.hasSubscription ? 'Subscription active' : 'No active subscription',
            dataSource: 'auth_success',
          };
          debugLog('Subscription status verified:', message.subscriptionStatus);
        }
      }

      await chrome.storage.local.set(sessionData);

      // If there's a pending push subscription, register it now that we have a session
      const { pendingPushSubscription, pushSubscription } = await chrome.storage.local.get([
        'pendingPushSubscription',
        'pushSubscription',
      ]);
      if (pendingPushSubscription) {
        debugLog('Found pending push subscription, registering now...');
        await registerPushSubscription(pendingPushSubscription);
      }

      // If we have a stored push subscription, validate it with backend now that we're logged in
      // This handles the case where extension subscribed before user logged in
      if (pushSubscription && !pendingPushSubscription) {
        debugLog('User logged in, validating stored push subscription...');
        const isValid = await validateSubscriptionWithBackend(pushSubscription);
        if (!isValid) {
          debugLog('Stored subscription not in backend, registering it now...');
          await registerPushSubscription(pushSubscription);
        }
      }

      // Notify popup if open
      notifyPopup({ type: 'AUTH_UPDATED' });
      debugLog('Auth success saved with session tokens');
      break;

    case 'PAYMENT_SUCCESS':
      // Set subscription state - extension now unlocked
      await chrome.storage.local.set({
        subscriptionActive: true,
        subscriptionStatus: {
          isActive: true,
          status: 'active',
          message: 'Subscription active',
          dataSource: 'payment_success',
        },
        subscriptionTimestamp: Date.now(),
      });

      // Notify popup
      notifyPopup({ type: 'SUBSCRIPTION_UPDATED' });

      // Broadcast to all calendar tabs to re-enable features
      await broadcastToCalendarTabs({ type: 'SUBSCRIPTION_UPDATED' });

      debugLog('Payment success saved - subscription now active, content scripts notified');
      break;

    case 'SUBSCRIPTION_CANCELLED':
      // Subscription was cancelled - update status and lock extension
      await chrome.storage.local.set({
        subscriptionActive: false,
        subscriptionStatus: {
          isActive: false,
          status: 'cancelled',
          reason: 'subscription_cancelled',
          message: 'Subscription cancelled',
          wasPreviouslySubscribed: true, // User had subscription - show "Sorry to see you go"
          dataSource: 'cancellation_event',
        },
        subscriptionTimestamp: Date.now(),
      });

      // Notify popup to show "Get Started" button
      notifyPopup({ type: 'SUBSCRIPTION_UPDATED' });

      // IMPORTANT: Broadcast to all calendar tabs to disable features immediately
      await broadcastToCalendarTabs({ type: 'SUBSCRIPTION_CANCELLED' });

      debugLog('Subscription cancelled - cache cleared, content scripts notified, extension blocked');
      break;

    case 'LOGOUT':
      await clearAuthData();
      notifyPopup({ type: 'AUTH_UPDATED' });
      debugLog('Logout processed');
      break;

    case 'PAGE_LOADED':
      // Web app page loaded - could use for heartbeat
      debugLog('Web app page loaded');
      break;

    default:
      debugLog('Unknown web app message type:', message.type);
  }
}

// Check current auth status
async function checkAuthStatus() {
  const data = await chrome.storage.local.get([
    'authenticated',
    'subscriptionActive',
    'authTimestamp',
    'subscriptionTimestamp',
  ]);

  return {
    authenticated: data.authenticated || false,
    subscriptionActive: data.subscriptionActive || false,
    authTimestamp: data.authTimestamp || null,
    subscriptionTimestamp: data.subscriptionTimestamp || null,
  };
}

// Check subscription status using validator (for content scripts)
async function checkSubscriptionStatus() {
  try {
    const result = await validateSubscription();

    debugLog('Subscription check result:', result.isActive ? 'Active' : 'Inactive');

    return {
      isActive: result.isActive || false,
      status: result.status || 'unknown',
      reason: result.reason || null,
    };
  } catch (error) {
    console.error('Subscription check failed:', error);

    // FAIL-OPEN: Preserve current state on error to avoid locking paying users
    try {
      const { subscriptionStatus } = await chrome.storage.local.get('subscriptionStatus');
      if (subscriptionStatus && subscriptionStatus.isActive) {
        debugLog('Preserving active subscription state due to validation error');
        return {
          isActive: true,
          status: 'error_preserved',
          reason: 'validation_failed_state_preserved',
        };
      }
    } catch (storageError) {
      console.error('Failed to read subscription status from storage:', storageError);
    }

    return {
      isActive: false,
      status: 'error',
      reason: 'validation_failed',
    };
  }
}

// Broadcast message to all Google Calendar tabs
async function broadcastToCalendarTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://calendar.google.com/*' });
    debugLog(`Broadcasting ${message.type} to ${tabs.length} calendar tab(s)`);

    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab might not have content script loaded yet
          debugLog('Could not send to tab:', tab.id);
        });
      }
    }
  } catch (error) {
    console.error('Failed to broadcast to tabs:', error);
  }
}

// Clear all auth data
async function clearAuthData() {
  await chrome.storage.local.remove([
    'authenticated',
    'subscriptionActive',
    'authTimestamp',
    'subscriptionTimestamp',
    'subscriptionStatus',
    'lastChecked',
    'supabaseSession', // Clear Supabase session tokens
  ]);

  debugLog('Auth data and session tokens cleared');
}

// Notify popup of updates
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might not be open, that's okay
    debugLog('Popup not open to receive message');
  });
}

// Global flag to prevent concurrent push subscription attempts
let subscribing = false;

// Helper: Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Helper: validate subscription with backend
async function validateSubscriptionWithBackend(subscription) {
  try {
    // Get current Supabase session
    const { supabaseSession } = await chrome.storage.local.get('supabaseSession');

    if (!supabaseSession || !supabaseSession.access_token) {
      debugLog('No session available for validation, will validate after login');
      return false;
    }

    const resp = await fetch(`${CONFIG.WEB_APP_URL}/api/extension/validate-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseSession.access_token}`,
      },
      body: JSON.stringify({ subscription }),
    });

    if (!resp.ok) {
      debugLog('Backend validation failed:', resp.status);
      return false;
    }

    const { valid } = await resp.json();
    return !!valid;
  } catch (error) {
    debugLog('Backend validation error:', error?.message);
    return false;
  }
}

// Main: ensure we have a push subscription and the backend accepts it
// Uses storage-first approach to avoid unnecessary re-subscription
async function ensureWebPushSubscription() {
  if (subscribing) {
    debugLog('Push subscription already in progress, skipping...');
    return;
  }

  subscribing = true;

  try {
    // Get the service worker registration (we're already in a service worker)
    const registration = self.registration;

    // Check if we already have a subscription stored
    const { pushSubscription } = await chrome.storage.local.get(['pushSubscription']);

    if (pushSubscription) {
      debugLog('Found stored push subscription, validating with backend...');
      const ok = await validateSubscriptionWithBackend(pushSubscription);
      if (ok) {
        debugLog('✅ Stored push subscription is valid, no re-subscription needed');
        return;
      }
      debugLog('Stored subscription is invalid or not in backend, will subscribe fresh');
    } else {
      debugLog('No stored push subscription found, will subscribe fresh');
    }

    // Subscribe to push notifications (silent mode - Chrome 121+)
    debugLog('Subscribing to Web Push with VAPID public key...');

    const applicationServerKey = urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY);

    // Silent push (Chrome 121+) - no visible notifications required
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: false,
      applicationServerKey: applicationServerKey,
    });

    debugLog('✅ Web Push subscription successful (silent mode)!');
    debugLog('   Subscription endpoint:', subscription.endpoint);

    // Convert subscription to JSON format for storage/transmission
    const subscriptionJson = subscription.toJSON();

    // Store subscription locally
    await chrome.storage.local.set({ pushSubscription: subscriptionJson });
    debugLog('Push subscription stored in extension storage');

    // Send to backend (or save as pending if no session yet)
    await registerPushSubscription(subscriptionJson);
  } catch (e) {
    console.error('❌ Web Push subscription failed:', e?.message || e);
    console.error('   Will retry on next service worker wake.');
  } finally {
    subscribing = false;
  }
}

// Register push subscription with server
// Allows server to send push notifications to this extension instance
async function registerPushSubscription(subscription) {
  debugLog('Registering push subscription with server...');

  // Get current Supabase session
  const { supabaseSession } = await chrome.storage.local.get('supabaseSession');

  if (!supabaseSession || !supabaseSession.access_token) {
    debugLog('No session available, will register push subscription after login');
    // Store subscription locally to register later when user logs in
    await chrome.storage.local.set({ pendingPushSubscription: subscription });
    return;
  }

  try {
    const response = await fetch(`${CONFIG.WEB_APP_URL}/api/extension/register-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseSession.access_token}`,
      },
      body: JSON.stringify({
        subscription: subscription,
        user_id: supabaseSession.user.id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to register push subscription: ${response.status} - ${errorText}`);
    }

    debugLog('Push subscription registered with server successfully');

    // Clear pending subscription if it was stored
    await chrome.storage.local.remove('pendingPushSubscription');
  } catch (error) {
    console.error('Failed to register push subscription with server:', error);
    // Store subscription to retry later
    await chrome.storage.local.set({ pendingPushSubscription: subscription });
  }
}

// Keep service worker alive with periodic heartbeat (optional)
// Service workers can shut down after 30 seconds of inactivity
// This is normal behavior in MV3, state should be in storage
debugLog('Background service worker initialized');

// ========================================
// GOOGLE TASKS API INTEGRATION & STATE MACHINE
// ========================================

// State machine for smart polling
let pollingState = 'SLEEP'; // 'ACTIVE', 'IDLE', 'SLEEP'
let activeCalendarTabs = new Set();
let lastUserActivity = Date.now();
let lastSyncTime = null;
let incrementalSyncCount = 0;
const MAX_INCREMENTAL_SYNCS_BEFORE_FULL = 50; // Force full sync after N incremental syncs
const STORAGE_THRESHOLD_FOR_FULL_SYNC = 70; // Force full sync if storage > 70%

// Persist state machine state to storage (survives service worker restart)
async function persistStateMachineState() {
  try {
    await chrome.storage.local.set({
      'cf.stateMachine': {
        pollingState,
        lastUserActivity,
        lastSyncTime,
        incrementalSyncCount,
        activeTabIds: Array.from(activeCalendarTabs)
      }
    });
  } catch (error) {
    console.error('Failed to persist state machine state:', error);
  }
}

// Restore state machine state from storage (called on wake/startup)
async function restoreStateMachineState() {
  try {
    const { 'cf.stateMachine': state } = await chrome.storage.local.get('cf.stateMachine');
    if (state) {
      lastSyncTime = state.lastSyncTime || null;
      incrementalSyncCount = state.incrementalSyncCount || 0;
      lastUserActivity = state.lastUserActivity || Date.now();
      debugLog('Restored state machine state:', {
        lastSyncTime,
        incrementalSyncCount,
        lastUserActivity: new Date(lastUserActivity).toISOString()
      });
    }
  } catch (error) {
    console.error('Failed to restore state machine state:', error);
  }
}

// Initialize state machine on service worker wake (not just browser startup)
// This runs immediately when the service worker script loads
(async function initializeOnWake() {
  try {
    const { 'cf.stateMachine': state } = await chrome.storage.local.get('cf.stateMachine');

    if (state) {
      // Restore timing state (always safe to restore)
      lastSyncTime = state.lastSyncTime || null;
      incrementalSyncCount = state.incrementalSyncCount || 0;
      lastUserActivity = state.lastUserActivity || Date.now();

      // Validate and restore tab IDs - query actual tabs to avoid stale IDs
      try {
        const calendarTabs = await chrome.tabs.query({
          url: 'https://calendar.google.com/*'
        });

        activeCalendarTabs.clear();
        for (const tab of calendarTabs) {
          if (tab.id) {
            activeCalendarTabs.add(tab.id);
          }
        }

        // Restore polling state based on actual tabs
        if (activeCalendarTabs.size > 0) {
          const recentActivity = Date.now() - lastUserActivity < 5 * 60 * 1000;
          pollingState = recentActivity ? 'ACTIVE' : 'IDLE';
        } else {
          pollingState = 'SLEEP';
        }

        // Create polling alarm for the restored state
        await transitionPollingState('SLEEP', pollingState);

        debugLog(`Service worker wake: ${activeCalendarTabs.size} actual tabs, state: ${pollingState}`);
      } catch (tabError) {
        // Fallback to stored tab IDs if query fails
        if (state.activeTabIds?.length > 0) {
          for (const tabId of state.activeTabIds) {
            activeCalendarTabs.add(tabId);
          }
          pollingState = state.pollingState || 'SLEEP';

          // Create polling alarm for the restored state
          await transitionPollingState('SLEEP', pollingState);

          debugLog(`Service worker wake (fallback): restored ${activeCalendarTabs.size} tabs, state: ${pollingState}`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to initialize state on wake:', error);

    // Even if storage fails, try to detect actual calendar tabs
    // so the state machine can start properly
    try {
      const calendarTabs = await chrome.tabs.query({
        url: 'https://calendar.google.com/*'
      });

      activeCalendarTabs.clear();
      for (const tab of calendarTabs) {
        if (tab.id) {
          activeCalendarTabs.add(tab.id);
        }
      }

      // Set state based on actual tabs
      if (activeCalendarTabs.size > 0) {
        pollingState = 'ACTIVE';
        lastUserActivity = Date.now();

        // Create polling alarm for recovery state
        await transitionPollingState('SLEEP', pollingState);

        debugLog(`Service worker wake (recovery): found ${activeCalendarTabs.size} tabs, starting in ACTIVE state`);
      }
    } catch (tabError) {
      console.error('Failed to query tabs during recovery:', tabError);
      // Continue with SLEEP state as final fallback
    }
  }
})();

// OAuth request handler
async function handleOAuthRequest() {
  try {
    debugLog('Handling Google OAuth request...');
    const token = await GoogleTasksAPI.getAuthToken(true); // interactive = true

    if (token) {
      debugLog('OAuth granted successfully');

      // Update settings to reflect OAuth granted and auto-enable feature
      const { settings } = await chrome.storage.sync.get('settings');
      await chrome.storage.sync.set({
        settings: {
          ...(settings || {}),
          taskListColoring: {
            ...(settings?.taskListColoring || {}),
            enabled: true, // Auto-enable when OAuth granted for better UX
            oauthGranted: true,
          },
        },
      });

      // Perform initial full sync
      debugLog('Performing initial sync after OAuth grant...');
      await syncTaskLists(true); // full sync

      return { success: true, message: 'OAuth granted and initial sync complete' };
    }

    return { success: false, error: 'NO_TOKEN' };
  } catch (error) {
    console.error('OAuth request failed:', error);

    if (error.message === 'OAUTH_NOT_GRANTED') {
      return { success: false, error: 'USER_DENIED', message: 'User denied OAuth access' };
    }

    return { success: false, error: error.message };
  }
}

// Sync task lists from Google API (with optimized storage strategy)
async function syncTaskLists(fullSync = false) {
  try {
    // Check if feature is enabled
    const { settings } = await chrome.storage.sync.get('settings');
    if (!settings?.taskListColoring?.enabled || !settings?.taskListColoring?.oauthGranted) {
      debugLog('Task list coloring not enabled or OAuth not granted, skipping sync');
      return { success: false, error: 'FEATURE_DISABLED' };
    }

    const startTime = Date.now();

    // Determine if we need to force a full sync for cleanup
    let shouldDoFullSync = fullSync || !lastSyncTime;
    let fullSyncReason = fullSync ? 'requested' : (!lastSyncTime ? 'no_previous_sync' : null);

    if (!shouldDoFullSync) {
      // Check if too many incremental syncs have accumulated
      if (incrementalSyncCount >= MAX_INCREMENTAL_SYNCS_BEFORE_FULL) {
        shouldDoFullSync = true;
        fullSyncReason = 'incremental_limit_reached';
        debugLog(`Forcing FULL SYNC: ${incrementalSyncCount} incremental syncs since last full sync`);
      }

      // Check storage quota - force full sync if getting high
      if (!shouldDoFullSync) {
        const { percentUsed } = await GoogleTasksAPI.checkStorageQuota();
        if (percentUsed > STORAGE_THRESHOLD_FOR_FULL_SYNC) {
          shouldDoFullSync = true;
          fullSyncReason = 'storage_threshold';
          debugLog(`Forcing FULL SYNC: storage at ${percentUsed.toFixed(1)}% (threshold: ${STORAGE_THRESHOLD_FOR_FULL_SYNC}%)`);
        }
      }
    }

    if (shouldDoFullSync) {
      // FULL SYNC: Replace entire mapping (cleans up stale entries)
      debugLog('Running FULL SYNC:', fullSyncReason);
      await GoogleTasksAPI.safeApiCall(() => GoogleTasksAPI.buildTaskToListMapping(), 3);
      lastSyncTime = new Date().toISOString();
      incrementalSyncCount = 0; // Reset counter after full sync
    } else {
      // INCREMENTAL SYNC: Only fetch changes since last sync
      debugLog('Running INCREMENTAL SYNC: fetching tasks updated since', lastSyncTime);
      await GoogleTasksAPI.safeApiCall(() => GoogleTasksAPI.incrementalSync(lastSyncTime), 3);
      lastSyncTime = new Date().toISOString();
      incrementalSyncCount++; // Increment counter
    }

    // Persist sync state to survive service worker restart
    await persistStateMachineState();

    const duration = Date.now() - startTime;
    debugLog(`Sync complete in ${duration}ms`);

    // Update last sync time in settings
    await chrome.storage.sync.set({
      settings: {
        ...(settings || {}),
        taskListColoring: {
          ...(settings?.taskListColoring || {}),
          lastSync: Date.now(),
        },
      },
    });

    // Check storage quota
    await GoogleTasksAPI.checkStorageQuota();

    // Notify content scripts
    await broadcastToCalendarTabs({ type: 'TASK_LISTS_UPDATED' });

    // Get task count and diagnostics for response
    const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');
    const taskCount = Object.keys(mapping || {}).length;

    // Sample some task IDs for diagnostic purposes
    const sampleTaskIds = Object.keys(mapping || {}).slice(0, 10);

    debugLog('Sync diagnostics:', {
      taskCount,
      sampleIds: sampleTaskIds,
      syncType: shouldDoFullSync ? 'FULL' : 'INCREMENTAL',
      fullSyncReason: shouldDoFullSync ? fullSyncReason : null,
      incrementalSyncCount,
      duration
    });

    return {
      success: true,
      taskCount,
      duration,
      syncType: shouldDoFullSync ? 'FULL' : 'INCREMENTAL',
      fullSyncReason: shouldDoFullSync ? fullSyncReason : null,
      sampleTaskIds: sampleTaskIds.slice(0, 5) // Return first 5 for debugging
    };
  } catch (error) {
    console.error('Task list sync failed:', error);
    return { success: false, error: error.message };
  }
}

// Check OAuth status
// IMPORTANT: Check our storage flag first (source of truth), then Chrome cache
async function checkOAuthStatus() {
  try {
    // First, check our storage flag (set when user clicks "Grant Access")
    const { settings } = await chrome.storage.sync.get('settings');
    const oauthGrantedInStorage = settings?.taskListColoring?.oauthGranted || false;

    // If storage says not granted, don't check Chrome cache (prevents false positives after clear storage)
    if (!oauthGrantedInStorage) {
      debugLog('OAuth not granted in storage, returning false');
      return { granted: false };
    }

    // Storage says granted - verify Chrome still has the token
    const hasToken = await GoogleTasksAPI.isAuthGranted();
    if (!hasToken) {
      debugLog('Storage says granted but Chrome token missing, clearing storage flag');
      // Token was revoked - update storage
      await chrome.storage.sync.set({
        settings: {
          ...(settings || {}),
          taskListColoring: {
            ...(settings?.taskListColoring || {}),
            oauthGranted: false,
          },
        },
      });
      return { granted: false };
    }

    return { granted: true };
  } catch (error) {
    console.error('Error checking OAuth status:', error);
    return { granted: false };
  }
}

// Get task lists metadata
async function getTaskListsMeta() {
  try {
    const { 'cf.taskListsMeta': lists } = await chrome.storage.local.get('cf.taskListsMeta');
    return lists || [];
  } catch (error) {
    console.error('Error getting task lists meta:', error);
    return [];
  }
}

// Handle new task detected (instant coloring)
/**
 * Resolve calendar event ID to task API ID (NEW UI support)
 * @param {string} calendarEventId - Calendar event ID from ttb_ decoded string
 * @returns {Promise<Object>} { success, taskApiId?, taskFragment?, error? }
 */
async function handleResolveCalendarEvent(calendarEventId) {
  debugLog(`Resolving calendar event: ${calendarEventId}`);

  if (!calendarEventId) {
    return { success: false, error: 'No calendar event ID provided' };
  }

  try {
    // Check if already in storage cache
    const cached = await chrome.storage.local.get('cf.calendarEventMapping');
    const mapping = cached['cf.calendarEventMapping'] || {};

    if (mapping[calendarEventId]) {
      debugLog(`Calendar event ${calendarEventId} found in cache`);
      return {
        success: true,
        taskApiId: mapping[calendarEventId].taskApiId,
        taskFragment: mapping[calendarEventId].taskFragment,
      };
    }

    // Not in cache - fetch from Calendar API
    debugLog(`Calendar event ${calendarEventId} not in cache, fetching from API`);
    const taskApiId = await GoogleCalendarAPI.calendarEventIdToTaskId(calendarEventId);

    if (!taskApiId) {
      debugLog(`Failed to resolve calendar event ${calendarEventId}`);
      return {
        success: false,
        error: 'Could not resolve calendar event to task ID',
      };
    }

    // Extract task fragment for metadata
    const taskFragment = GoogleCalendarAPI.taskApiIdToFragment(taskApiId);

    // Store in cache
    mapping[calendarEventId] = {
      taskApiId,
      taskFragment,
      lastVerified: new Date().toISOString(),
    };

    await chrome.storage.local.set({ 'cf.calendarEventMapping': mapping });
    debugLog(`Cached mapping: ${calendarEventId} → ${taskApiId}`);

    return {
      success: true,
      taskApiId,
      taskFragment,
    };
  } catch (error) {
    console.error('Error resolving calendar event:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

async function handleNewTaskDetected(taskId) {
  try {
    // Quick lookup from cache first
    let listId = await GoogleTasksAPI.getListIdForTask(taskId);

    // If not in cache, search all lists (slower)
    if (!listId) {
      const result = await GoogleTasksAPI.safeApiCall(() => GoogleTasksAPI.findTaskInAllLists(taskId), 2);

      if (result) {
        listId = result.listId;
      }
    }

    if (listId) {
      // Get default colors (background and text) for this list
      const colors = await getListDefaultColor(listId);

      if (colors && colors.backgroundColor) {
        return {
          success: true,
          listId,
          backgroundColor: colors.backgroundColor,
          textColor: colors.textColor
        };
      }

      return { success: true, listId, backgroundColor: null, textColor: null };
    }

    return { success: false, error: 'TASK_NOT_FOUND' };
  } catch (error) {
    console.error('[Background] Error handling new task detection:', error);
    return { success: false, error: error.message };
  }
}

// Get default colors (background and text) for a list
async function getListDefaultColor(listId) {
  const [
    { 'cf.taskListColors': listColors },
    { 'cf.taskListTextColors': listTextColors },
    { settings }
  ] = await Promise.all([
    chrome.storage.sync.get('cf.taskListColors'),
    chrome.storage.sync.get('cf.taskListTextColors'),
    chrome.storage.sync.get('settings')
  ]);

  const backgroundColor = listColors?.[listId] || null;
  const textColor = listTextColors?.[listId] ||
                    settings?.taskListColoring?.pendingTextColors?.[listId] ||
                    settings?.taskListColoring?.textColors?.[listId] ||
                    null;

  return { backgroundColor, textColor };
}

// Apply list default color to all existing tasks in a list
async function applyListColorToExistingTasks(listId, color) {
  try {
    debugLog(`Applying color ${color} to all tasks in list ${listId}...`);

    // Get all tasks in this list from mapping
    const { 'cf.taskToListMap': mapping } = await chrome.storage.local.get('cf.taskToListMap');

    if (!mapping) {
      return { success: false, error: 'NO_MAPPING' };
    }

    // Find all task IDs that belong to this list
    const taskIds = Object.entries(mapping)
      .filter(([_, lid]) => lid === listId)
      .map(([tid, _]) => tid);

    debugLog(`Found ${taskIds.length} tasks in list ${listId}`);

    // Get existing manual task colors
    const { 'cf.taskColors': taskColors } = await chrome.storage.sync.get('cf.taskColors');
    const updatedTaskColors = { ...(taskColors || {}) };

    // Apply color to tasks that don't have manual colors
    let appliedCount = 0;
    for (const taskId of taskIds) {
      if (!updatedTaskColors[taskId]) {
        // No manual color, so this task will use list default
        // We don't need to set anything - the task coloring logic
        // will automatically use list default when no manual color exists
        appliedCount++;
      }
    }

    // Notify content scripts to repaint
    await broadcastToCalendarTabs({ type: 'REPAINT_TASKS', listId, color });

    return { success: true, appliedCount, totalTasks: taskIds.length };
  } catch (error) {
    console.error('Error applying list color to existing tasks:', error);
    return { success: false, error: error.message };
  }
}

// State machine: Calendar tab active
async function handleCalendarTabActive(tabId) {
  if (tabId) {
    activeCalendarTabs.add(tabId);
    debugLog(`Calendar tab ${tabId} active (${activeCalendarTabs.size} active tabs)`);
  }
  await updatePollingState();
  await persistStateMachineState(); // Persist tab change after state update completes
}

// State machine: Calendar tab inactive
async function handleCalendarTabInactive(tabId) {
  if (tabId) {
    activeCalendarTabs.delete(tabId);
    debugLog(`Calendar tab ${tabId} inactive (${activeCalendarTabs.size} active tabs)`);
  }
  await updatePollingState();
  await persistStateMachineState(); // Persist tab change after state update completes
}

// Update polling state based on activity
async function updatePollingState() {
  const hasActiveTabs = activeCalendarTabs.size > 0;
  const recentActivity = Date.now() - lastUserActivity < 5 * 60 * 1000; // 5 minutes

  let newState;
  if (hasActiveTabs && recentActivity) {
    newState = 'ACTIVE';
  } else if (hasActiveTabs) {
    newState = 'IDLE';
  } else {
    newState = 'SLEEP';
  }

  if (newState !== pollingState) {
    debugLog(`Polling state transition: ${pollingState} → ${newState}`);
    await transitionPollingState(pollingState, newState);
    pollingState = newState;
    // Persist state transition (tab changes already persist separately)
    await persistStateMachineState();
  }
}

// Transition polling state
async function transitionPollingState(from, to) {
  // Clear existing alarm
  await chrome.alarms.clear('task-list-sync');

  // Set new alarm based on state
  if (to === 'ACTIVE') {
    // 5-minute polling when actively using calendar
    await chrome.alarms.create('task-list-sync', {
      periodInMinutes: 5,
      delayInMinutes: 0, // Start immediately
    });
    debugLog('📊 Polling: ACTIVE mode (5-minute interval)');
  } else if (to === 'IDLE') {
    // 15-minute polling when calendar open but inactive
    await chrome.alarms.create('task-list-sync', {
      periodInMinutes: 15,
    });
    debugLog('📊 Polling: IDLE mode (15-minute interval)');
  } else {
    // SLEEP - no polling when no calendar tabs
    debugLog('📊 Polling: SLEEP mode (paused)');
  }
}

// Monitor tab changes for state machine
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url?.includes('calendar.google.com')) {
      handleCalendarTabActive(activeInfo.tabId);
    }
  } catch (error) {
    // Tab might have been closed
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleCalendarTabInactive(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('calendar.google.com')) {
    handleCalendarTabActive(tabId);
  }
});

debugLog('✅ Google Tasks API integration and state machine initialized');
