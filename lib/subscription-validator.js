// Subscription Validator
// Validates subscription status by reading from storage
// Storage is kept fresh by:
//   1. Push notifications (real-time updates)
//   2. 3-day periodic alarm (backup check)
//   3. PAYMENT_SUCCESS messages from web app
import { CONFIG, debugLog } from '../config.production.js';

// Lock to prevent concurrent token refresh attempts
let refreshTokenPromise = null;
let refreshWaiters = 0; // Track concurrent waiters to safely clear lock

/**
 * Validate subscription by reading from storage
 * NO API CALL - just reads cached status kept fresh by push notifications and 3-day alarm
 *
 * This function is used by:
 * - Popup when opening (instant display, no loading spinner)
 * - Content script internal checks
 *
 * Returns the current subscription status from storage
 */
export async function validateSubscription() {
  try {
    debugLog('Reading subscription status from storage...');

    // Get subscription status from storage (kept fresh by push + alarm)
    const { subscriptionStatus } = await chrome.storage.local.get('subscriptionStatus');

    if (subscriptionStatus && subscriptionStatus.isActive !== undefined) {
      debugLog('Subscription status from storage:', subscriptionStatus.status);
      return subscriptionStatus;
    }

    // No status in storage yet - check if we have session
    const { supabaseSession } = await chrome.storage.local.get('supabaseSession');

    if (!supabaseSession || !supabaseSession.access_token) {
      debugLog('No subscription status and no session found');
      return {
        isActive: false,
        reason: 'no_session',
        message: 'Please sign in to use ColorKit',
        needsAuth: true,
      };
    }

    // Have session but no subscription status - awaiting first validation
    debugLog('Have session but no subscription status - awaiting first check from push/alarm');
    return {
      isActive: false,
      reason: 'pending_validation',
      message: 'Checking subscription status...',
    };
  } catch (error) {
    console.error('Failed to read subscription status:', error);
    return {
      isActive: false,
      reason: 'error',
      message: 'Unable to read subscription status',
      error: error.message,
    };
  }
}

/**
 * Force refresh subscription status from API
 * MAKES API CALL - only used by push notifications and 3-day alarm
 *
 * This is the ONLY function that makes API calls to validate subscription.
 * Called by:
 * - Push notification handler (real-time updates)
 * - 3-day periodic alarm (backup validation)
 *
 * Updates storage with fresh data from server
 * FAIL-OPEN: Preserves existing lock state on errors (only locks when subscription is CONFIRMED inactive)
 */
export async function forceRefreshSubscription() {
  debugLog('Force refreshing subscription status from API...');

  try {
    // Get stored Supabase session
    const stored = await chrome.storage.local.get(['supabaseSession', 'subscriptionActive', 'subscriptionStatus']);
    const supabaseSession = stored.supabaseSession;
    const currentLockState = stored.subscriptionActive; // Preserve current state
    const currentStatus = stored.subscriptionStatus;

    if (!supabaseSession || !supabaseSession.access_token) {
      debugLog('No Supabase session found - cannot validate');

      // FAIL-OPEN: If user was previously unlocked but session expired,
      // preserve unlock state temporarily (user may be offline)
      if (currentLockState === true) {
        debugLog('⚠️ Session missing but user was unlocked - preserving unlock state (fail-open)');
        return (
          currentStatus || {
            isActive: true,
            reason: 'session_missing_preserved',
            message: 'Session expired but access preserved',
          }
        );
      }

      const noSessionResult = {
        isActive: false,
        reason: 'no_session',
        message: 'Please sign in to use ColorKit',
        needsAuth: true,
      };

      // Only update storage if user was not previously unlocked
      await chrome.storage.local.set({
        subscriptionStatus: noSessionResult,
        subscriptionActive: false,
      });

      return noSessionResult;
    }

    debugLog('Making API call to validate subscription...');

    // Call validation API with Bearer token
    const response = await fetch(`${CONFIG.WEB_APP_URL}/api/extension/validate`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseSession.access_token}`,
      },
    });

    if (!response.ok) {
      debugLog('API returned error:', response.status);

      // If unauthorized, try to refresh token
      if (response.status === 401) {
        debugLog('Token expired, attempting refresh...');

        // Try to refresh token using refresh_token
        if (supabaseSession.refresh_token) {
          try {
            // Use lock to prevent concurrent refresh attempts
            if (!refreshTokenPromise) {
              refreshTokenPromise = (async () => {
                try {
                  const refreshResponse = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      apikey: CONFIG.SUPABASE_ANON_KEY || '',
                    },
                    body: JSON.stringify({
                      refresh_token: supabaseSession.refresh_token,
                    }),
                  });

                  if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json();
                    debugLog('✅ Token refreshed successfully');

                    // Update session with new tokens
                    const newSession = {
                      access_token: refreshData.access_token,
                      refresh_token: refreshData.refresh_token,
                      user: supabaseSession.user,
                    };

                    await chrome.storage.local.set({ supabaseSession: newSession });
                    return refreshData;
                  }
                  return null;
                } catch (error) {
                  // Let error propagate to waiters
                  throw error;
                }
                // NO finally block - lock cleared by last waiter
              })();
              debugLog('Token refresh started');
            } else {
              debugLog('Token refresh already in progress, waiting...');
            }

            // Track this waiter
            refreshWaiters++;
            debugLog(`Token refresh waiters: ${refreshWaiters}`);

            try {
              // Wait for refresh to complete
              const refreshData = await refreshTokenPromise;

              if (refreshData) {
                // Retry validation with new token
                const retryResponse = await fetch(`${CONFIG.WEB_APP_URL}/api/extension/validate`, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${refreshData.access_token}`,
                  },
                });

                if (retryResponse.ok) {
                  const data = await retryResponse.json();
                  debugLog('✅ Validation succeeded after token refresh');

                  await chrome.storage.local.set({
                    subscriptionStatus: data,
                    subscriptionActive: data.isActive || false,
                    subscriptionTimestamp: Date.now(),
                  });

                  return data;
                }
              }
            } finally {
              // Decrement waiter count
              refreshWaiters--;
              debugLog(`Token refresh waiters: ${refreshWaiters}`);

              // Last waiter clears the lock (after grace period)
              if (refreshWaiters === 0) {
                setTimeout(() => {
                  // Double-check no new waiters arrived during grace period
                  if (refreshWaiters === 0 && refreshTokenPromise) {
                    debugLog('Last waiter - clearing token refresh lock');
                    refreshTokenPromise = null;
                  }
                }, 100); // 100ms grace period
              }
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
          }
        }

        // FAIL-OPEN: Token refresh failed, but preserve unlock state
        if (currentLockState === true) {
          debugLog('⚠️ Token expired and refresh failed, but preserving unlock state (fail-open)');
          return (
            currentStatus || {
              isActive: true,
              reason: 'token_expired_preserved',
              message: 'Token expired but access preserved',
            }
          );
        }

        // User was locked anyway, safe to clear session
        await chrome.storage.local.remove(['supabaseSession', 'authenticated']);
        const sessionExpiredResult = {
          isActive: false,
          reason: 'session_expired',
          message: 'Session expired. Please sign in again.',
          needsAuth: true,
        };

        await chrome.storage.local.set({
          subscriptionStatus: sessionExpiredResult,
          subscriptionActive: false,
        });

        return sessionExpiredResult;
      }

      // Other errors (500, 503, etc.) - FAIL-OPEN: preserve state
      debugLog(`⚠️ API error ${response.status} - preserving current lock state (fail-open)`);
      return (
        currentStatus || {
          isActive: currentLockState || false,
          reason: 'api_error_preserved',
          message: 'Temporary verification error, retaining current access state',
        }
      );
    }

    const data = await response.json();
    debugLog('API response:', data);

    // Update BOTH subscriptionStatus (object) and subscriptionActive (boolean)
    // This ensures popup and calendar features stay in sync
    await chrome.storage.local.set({
      subscriptionStatus: data,
      subscriptionActive: data.isActive || false,
      subscriptionTimestamp: Date.now(),
    });

    debugLog('Storage updated with fresh subscription status');

    return data;
  } catch (error) {
    console.error('Force refresh failed:', error);

    // FAIL-OPEN: On network/fetch errors, preserve current state
    const stored = await chrome.storage.local.get(['subscriptionActive', 'subscriptionStatus']);
    const currentLockState = stored.subscriptionActive;
    const currentStatus = stored.subscriptionStatus;

    debugLog(`⚠️ Network error - preserving current lock state: ${currentLockState} (fail-open)`);

    const errorResult = {
      isActive: currentLockState || false,
      reason: 'network_error_preserved',
      message: 'Network error. Access state preserved until connection restored.',
      error: error.message,
    };

    // Update status but preserve lock state
    await chrome.storage.local.set({
      subscriptionStatus: errorResult,
      // DO NOT change subscriptionActive - preserve current state
    });

    return errorResult;
  }
}

/**
 * Clear subscription cache
 * Removes subscriptionStatus and lastChecked from storage
 * Used on logout or when forcing a refresh
 */
export async function clearSubscriptionCache() {
  try {
    await chrome.storage.local.remove(['subscriptionStatus', 'lastChecked']);
    debugLog('Subscription cache cleared');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

debugLog('Subscription validator initialized (no automatic API calls - push + 3-day alarm only)');
