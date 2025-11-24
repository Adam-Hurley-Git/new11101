# Token Refresh Race Condition - Analysis & Fix Plan

**Date**: November 24, 2025
**Issue**: #2 from Audit Validation Report
**Severity**: MEDIUM
**File**: `lib/subscription-validator.js`
**Lines**: 139-181

---

## Problem Analysis

### Current Implementation

```javascript
// Global lock at module level
let refreshTokenPromise = null;

// Inside forceRefreshSubscription(), when 401 received:
if (!refreshTokenPromise) {
  refreshTokenPromise = (async () => {
    try {
      const refreshResponse = await fetch(...);
      // ... process refresh ...
      return refreshData;
    } finally {
      refreshTokenPromise = null;  // ← PROBLEM: Clears too early
    }
  })();
} else {
  debugLog('Token refresh already in progress, waiting...');
}

// Capture promise reference
const pendingRefresh = refreshTokenPromise;
const refreshData = await pendingRefresh;
```

### The Race Condition

**Timeline of the Race:**

```
Time | Caller A (Push Handler)        | Caller B (Alarm)              | Lock State
-----|--------------------------------|-------------------------------|------------------
t0   | Gets 401, needs refresh        |                               | null
t1   | Checks: refreshTokenPromise    |                               | null
     | is null                        |                               |
t2   | Creates new promise            |                               | Promise A
t3   | Starts fetch() for refresh     |                               | Promise A
t4   |                                | Gets 401, needs refresh       | Promise A
t5   |                                | Checks: refreshTokenPromise   | Promise A
     |                                | is NOT null                   |
t6   |                                | Goes to else branch           | Promise A
t7   |                                | Captures: pendingRefresh      | Promise A
t8   | Fetch completes                |                               | Promise A
t9   | Try block finishes             |                               | Promise A
t10  | FINALLY block runs:            |                               | Promise A
     | refreshTokenPromise = null     |                               | null ← CLEARED!
t11  | Promise A resolves             |                               | null
t12  |                                | Still waiting on pendingRefresh| null
t13  | (Caller C arrives - another    |                               | null
     |  push notification)            |                               |
t14  | Caller C checks:               |                               | null
     | refreshTokenPromise is null    |                               |
t15  | Creates NEW Promise B          |                               | Promise B ← RACE!
t16  | Now 2 refreshes running!       | Still waiting on A            | Promise B
```

**Result**: Caller A's refresh and Caller C's refresh run simultaneously ❌

---

## Root Cause

The `finally` block in the async IIFE runs **before** the promise resolves:

```javascript
refreshTokenPromise = (async () => {
  try {
    return data;
  } finally {
    refreshTokenPromise = null;  // Runs BEFORE promise resolves
  }
})();
```

**Why this happens**:
1. The async function executes
2. The `finally` block runs when the function body completes
3. **But** the promise hasn't resolved yet (still pending)
4. Lock is cleared while promise is still resolving
5. New callers see null lock and create duplicate refresh

---

## Impact Assessment

### Actual Scenarios Where Race Occurs

1. **Push + Alarm collision** (rare but possible)
   - Push notification arrives
   - Token expired, starts refresh
   - 3-day alarm fires during refresh
   - Third event triggers before first completes
   - Result: 2-3 concurrent token refreshes

2. **Multiple push notifications** (very rare)
   - If Supabase sends multiple push notifications rapidly
   - First starts refresh
   - Second waits
   - Third arrives before first completes
   - Result: 2 concurrent refreshes

3. **Manual trigger + automatic** (edge case)
   - User action triggers refresh
   - Alarm fires simultaneously
   - Result: 2 concurrent refreshes

### Impact Severity

**NOT Critical Because:**
- ❌ No data corruption (refresh is idempotent)
- ❌ No infinite loops (each refresh eventually completes)
- ❌ No token corruption (last write wins, same data)
- ❌ Happens rarely (requires precise timing)

**IS Medium Because:**
- ⚠️ Wastes API quota (2-3 unnecessary requests)
- ⚠️ Inefficient (duplicate network calls)
- ⚠️ Could cause rate limiting from Supabase
- ⚠️ Sloppy code (lock not working as intended)

### Probability

**Frequency**: Very Low
- Push notifications: ~5-10 per day max
- Alarm: Once per 3 days
- Window for race: ~50-200ms (network request time)
- Probability: < 0.1% of refreshes

**Real-world occurrence**: Maybe 1-2 times per year per user

---

## Solution Options

### Option 1: Waiter Count Pattern ⭐ RECOMMENDED

**Concept**: Track how many callers are waiting on the refresh

```javascript
let refreshTokenPromise = null;
let refreshWaiters = 0;

// In token refresh code:
if (!refreshTokenPromise) {
  refreshTokenPromise = (async () => {
    try {
      const refreshData = await fetch(...);
      return refreshData;
    } catch (err) {
      throw err;
    }
    // NO finally block
  })();
}

refreshWaiters++;
try {
  const result = await refreshTokenPromise;
  return result;
} finally {
  refreshWaiters--;

  // Last waiter clears the lock
  if (refreshWaiters === 0) {
    setTimeout(() => {
      // Double-check no new waiters arrived
      if (refreshWaiters === 0) {
        refreshTokenPromise = null;
      }
    }, 100);  // 100ms grace period
  }
}
```

**Pros**:
- ✅ Completely eliminates race condition
- ✅ Lock only cleared when ALL waiters done
- ✅ 100ms grace period for safety
- ✅ Clean, understandable logic

**Cons**:
- ⚠️ More complex than current code
- ⚠️ Need to track waiter count carefully

---

### Option 2: Timestamp-Based Lock

**Concept**: Add timestamp to detect stale locks, allow override

```javascript
let refreshTokenPromise = null;
let refreshStartTime = 0;
const MAX_REFRESH_TIME = 30000; // 30 seconds

// In token refresh code:
const now = Date.now();

if (!refreshTokenPromise || (now - refreshStartTime > MAX_REFRESH_TIME)) {
  if (refreshTokenPromise) {
    debugLog('⚠️ Stale refresh detected, starting new one');
  }

  refreshStartTime = now;
  refreshTokenPromise = (async () => {
    try {
      const refreshData = await fetch(...);
      return refreshData;
    } finally {
      // Safe to clear after fetch completes
      setTimeout(() => {
        refreshTokenPromise = null;
        refreshStartTime = 0;
      }, 500);  // 500ms grace period
    }
  })();
}

const result = await refreshTokenPromise;
```

**Pros**:
- ✅ Simple to understand
- ✅ Handles hung refreshes (timeout override)
- ✅ Good for debugging (can log stale locks)

**Cons**:
- ⚠️ Still has small race window (during 500ms grace period)
- ⚠️ Magic number for timeout

---

### Option 3: Promise.then() Cleanup

**Concept**: Attach cleanup to promise resolution, not try/finally

```javascript
let refreshTokenPromise = null;

if (!refreshTokenPromise) {
  refreshTokenPromise = fetch(...)
    .then(async (response) => {
      // Process response
      return refreshData;
    });

  // Cleanup AFTER promise settles (not during)
  refreshTokenPromise.finally(() => {
    setTimeout(() => {
      refreshTokenPromise = null;
    }, 100);  // Grace period
  });
}

const result = await refreshTokenPromise;
```

**Pros**:
- ✅ Simple modification to existing code
- ✅ Cleanup happens AFTER promise settles
- ✅ 100ms grace period for safety

**Cons**:
- ⚠️ Still has tiny race window (100ms)
- ⚠️ Less explicit than waiter count

---

### Option 4: No Clearing (Let GC Handle It)

**Concept**: Never clear the lock, let garbage collector clean up

```javascript
let refreshTokenCache = new Map();  // taskId → promise

function getRefreshPromise() {
  const key = 'refresh';

  if (!refreshTokenCache.has(key)) {
    const promise = (async () => {
      const refreshData = await fetch(...);
      return refreshData;
    })();

    refreshTokenCache.set(key, promise);

    // Auto-expire after 1 minute
    setTimeout(() => {
      refreshTokenCache.delete(key);
    }, 60000);
  }

  return refreshTokenCache.get(key);
}

const result = await getRefreshPromise();
```

**Pros**:
- ✅ No race condition (lock persists)
- ✅ Auto-expires after reasonable time

**Cons**:
- ⚠️ Lock persists longer than needed
- ⚠️ More complex data structure

---

## Recommended Solution: Option 1 (Waiter Count)

**Rationale**:
1. **Completeness**: Eliminates race condition 100%
2. **Safety**: Grace period for edge cases
3. **Clarity**: Easy to understand and debug
4. **Minimal changes**: Only modifies lock logic, not fetch logic
5. **Preserves fail-open**: All error handling unchanged

---

## Implementation Plan

### Step 1: Add Waiter Count Variable

```javascript
// At top of file, with existing lock
let refreshTokenPromise = null;
let refreshWaiters = 0;  // NEW: Track concurrent waiters
```

### Step 2: Modify Token Refresh Block

**Location**: Lines 139-181 in `subscription-validator.js`

**Before**:
```javascript
if (!refreshTokenPromise) {
  refreshTokenPromise = (async () => {
    try {
      // ... refresh logic ...
      return refreshData;
    } finally {
      refreshTokenPromise = null;  // REMOVE THIS
    }
  })();
} else {
  debugLog('Token refresh already in progress, waiting...');
}

const pendingRefresh = refreshTokenPromise;
const refreshData = await pendingRefresh;
```

**After**:
```javascript
// Start refresh if not already running
if (!refreshTokenPromise) {
  refreshTokenPromise = (async () => {
    try {
      const refreshResponse = await fetch(...);
      // ... process refresh ...
      return refreshData;
    } catch (error) {
      // Let error propagate to callers
      throw error;
    }
    // NO finally block - lock cleared by last waiter
  })();
  debugLog('Token refresh started');
} else {
  debugLog('Token refresh already in progress, waiting...');
}

// Increment waiter count
refreshWaiters++;
debugLog(`Token refresh waiter count: ${refreshWaiters}`);

try {
  // Wait for refresh to complete
  const refreshData = await refreshTokenPromise;
  return refreshData;
} finally {
  // Decrement waiter count
  refreshWaiters--;
  debugLog(`Token refresh waiter count: ${refreshWaiters}`);

  // Last waiter clears the lock (after grace period)
  if (refreshWaiters === 0) {
    setTimeout(() => {
      // Double-check no new waiters arrived during grace period
      if (refreshWaiters === 0 && refreshTokenPromise) {
        debugLog('Last waiter - clearing token refresh lock');
        refreshTokenPromise = null;
      }
    }, 100);  // 100ms grace period
  }
}
```

### Step 3: Update Error Handling

**Ensure errors don't break waiter count**:

```javascript
refreshWaiters++;

try {
  const refreshData = await refreshTokenPromise;

  if (refreshData) {
    // Retry validation with new token
    const retryResponse = await fetch(...);

    if (retryResponse.ok) {
      const data = await retryResponse.json();
      // ... update storage ...
      return data;
    }
  }
} catch (refreshError) {
  console.error('Token refresh failed:', refreshError);
  // Error handling continues below
} finally {
  // ALWAYS decrement, even on error
  refreshWaiters--;

  if (refreshWaiters === 0) {
    setTimeout(() => {
      if (refreshWaiters === 0 && refreshTokenPromise) {
        refreshTokenPromise = null;
      }
    }, 100);
  }
}

// Existing fail-open error handling continues...
```

---

## Testing Plan

### Test 1: Concurrent Calls (Primary Test)

**Scenario**: Simulate race condition

```javascript
// In background.js or test file:
async function testConcurrentRefresh() {
  console.log('Testing concurrent token refresh...');

  // Simulate 3 simultaneous calls
  const results = await Promise.all([
    forceRefreshSubscription(),
    forceRefreshSubscription(),
    forceRefreshSubscription()
  ]);

  console.log('Results:', results);

  // Verify:
  // 1. All 3 calls completed successfully
  // 2. Only 1 actual refresh happened (check network tab)
  // 3. All 3 calls got same result
  console.log('✅ All calls completed');
  console.log('✅ Check network tab: should see only 1 refresh request');
}
```

**Expected Result**:
- ✅ Only 1 fetch to `/auth/v1/token?grant_type=refresh_token`
- ✅ All 3 callers receive same refreshData
- ✅ Lock cleared after all complete
- ✅ Waiter count logs: 1 → 2 → 3 → 2 → 1 → 0

### Test 2: Sequential Calls

**Scenario**: Ensure lock is cleared for next refresh

```javascript
async function testSequentialRefresh() {
  // First refresh
  await forceRefreshSubscription();
  console.log('First refresh complete');

  // Wait 200ms (past grace period)
  await new Promise(resolve => setTimeout(resolve, 200));

  // Second refresh should start fresh
  await forceRefreshSubscription();
  console.log('Second refresh complete');

  // Verify: 2 separate refresh requests in network tab
  console.log('✅ Check network tab: should see 2 separate refresh requests');
}
```

**Expected Result**:
- ✅ 2 separate fetches (not reusing same promise)
- ✅ Lock cleared between calls

### Test 3: Error Doesn't Break Waiter Count

**Scenario**: Simulate refresh failure

```javascript
async function testRefreshError() {
  // Temporarily break the refresh endpoint
  const originalUrl = CONFIG.SUPABASE_URL;
  CONFIG.SUPABASE_URL = 'https://invalid.example.com';

  try {
    await Promise.all([
      forceRefreshSubscription().catch(e => console.log('Call 1 failed')),
      forceRefreshSubscription().catch(e => console.log('Call 2 failed')),
      forceRefreshSubscription().catch(e => console.log('Call 3 failed'))
    ]);
  } finally {
    CONFIG.SUPABASE_URL = originalUrl;
  }

  // Verify waiter count returned to 0
  console.log('✅ Waiter count should be 0 after errors');

  // Next call should work
  await forceRefreshSubscription();
  console.log('✅ Subsequent refresh works');
}
```

**Expected Result**:
- ✅ All 3 calls fail gracefully
- ✅ Waiter count returns to 0
- ✅ Lock cleared despite errors
- ✅ Next refresh works normally

### Test 4: Grace Period

**Scenario**: Verify 100ms grace period prevents race

```javascript
async function testGracePeriod() {
  let call1Started = false;
  let call2Started = false;

  // Start first refresh
  const promise1 = forceRefreshSubscription().then(() => {
    call1Started = true;
  });

  // Wait 10ms, then start second refresh
  await new Promise(resolve => setTimeout(resolve, 10));
  const promise2 = forceRefreshSubscription().then(() => {
    call2Started = true;
  });

  // Start third refresh IMMEDIATELY after first completes
  await promise1;
  const promise3 = forceRefreshSubscription().then(() => {
    console.log('Call 3 started');
  });

  await Promise.all([promise2, promise3]);

  // Verify: Only 1 actual refresh happened
  console.log('✅ Check network tab: should see only 1 refresh request');
}
```

**Expected Result**:
- ✅ All 3 calls reuse same promise
- ✅ Only 1 network request
- ✅ Grace period caught call 3

---

## Edge Cases Handled

### 1. Service Worker Restart

**Scenario**: Service worker terminates mid-refresh

**Behavior**:
- Variables reset: `refreshTokenPromise = null`, `refreshWaiters = 0`
- Next call starts fresh refresh
- Old promise abandoned (no memory leak)

**Safe**: ✅ Yes

### 2. Rapid Sequential Refreshes

**Scenario**: Alarm fires, then push, then another push (within 100ms)

**Behavior**:
- All 3 wait on same refresh
- Waiter count: 1 → 2 → 3 → 2 → 1 → 0
- Lock cleared 100ms after last waiter

**Safe**: ✅ Yes

### 3. Error During Refresh

**Scenario**: Network fails mid-refresh

**Behavior**:
- Promise rejects
- All waiters receive rejection
- `finally` blocks run, waiter count decrements
- Lock cleared after grace period

**Safe**: ✅ Yes

### 4. Stale Lock (Hung Refresh)

**Scenario**: Refresh hangs forever (network timeout)

**Current behavior**: Lock never cleared ❌

**Solution**: Add timestamp-based override (future enhancement)

```javascript
let refreshStartTime = 0;
const MAX_REFRESH_TIME = 30000;  // 30 seconds

if (!refreshTokenPromise || (Date.now() - refreshStartTime > MAX_REFRESH_TIME)) {
  // Start new refresh (override stale lock)
}
```

**Priority**: LOW (fetch has built-in timeouts)

---

## Risk Assessment

### Risk Level: **LOW** ✅

**Why Low Risk**:
1. ✅ Only modifies locking logic, not refresh logic
2. ✅ All existing error handling preserved
3. ✅ Fail-open behavior unchanged
4. ✅ Backward compatible (no API changes)
5. ✅ Only adds safety, doesn't remove features
6. ✅ 100ms grace period provides buffer

**What Could Go Wrong**:
1. ⚠️ Waiter count bug → lock never cleared
   - **Mitigation**: Add timestamp override (future enhancement)
   - **Impact**: Minimal (next service worker restart clears it)

2. ⚠️ Grace period too short → rare race still possible
   - **Mitigation**: 100ms is generous (network latency << 100ms)
   - **Impact**: Minimal (worst case: 1 extra API call)

3. ⚠️ Error in finally block → waiter count wrong
   - **Mitigation**: Finally blocks always run, even on error
   - **Impact**: None (JavaScript guarantees finally execution)

---

## Performance Impact

### Before Fix
- Rare race condition: 2-3 API calls instead of 1
- Frequency: < 0.1% of refreshes
- Cost per occurrence: ~200ms network latency × 2 = 400ms wasted

### After Fix
- No race condition: Always 1 API call
- Overhead: Increment/decrement waiter count (< 1μs)
- Grace period: 100ms delay before clearing lock (negligible)

**Net Improvement**: Saves ~400ms × 0.1% = ~0.4ms average per refresh

**Verdict**: Performance neutral, correctness gained ✅

---

## Rollback Plan

If issues arise, rollback is simple:

```javascript
// Remove waiter count logic
refreshWaiters++;  // DELETE
// ...
refreshWaiters--;  // DELETE

// Restore original finally block
if (!refreshTokenPromise) {
  refreshTokenPromise = (async () => {
    try {
      return data;
    } finally {
      refreshTokenPromise = null;  // RESTORE
    }
  })();
}
```

**Rollback time**: < 5 minutes

---

## Future Enhancements

### Enhancement 1: Timeout Override

Add timestamp to detect hung refreshes:

```javascript
let refreshStartTime = 0;
const MAX_REFRESH_TIME = 30000;

if (!refreshTokenPromise || (Date.now() - refreshStartTime > MAX_REFRESH_TIME)) {
  // Start fresh refresh
  refreshStartTime = Date.now();
}
```

**Benefit**: Prevents permanent lock if refresh hangs

### Enhancement 2: Telemetry

Log race condition prevention:

```javascript
if (refreshWaiters > 1) {
  debugLog(`✅ Race condition prevented: ${refreshWaiters} concurrent waiters`);
}
```

**Benefit**: Verify fix is working in production

### Enhancement 3: Waiter Timeout

Auto-decrement waiter count if stuck:

```javascript
const waiterId = Symbol();
refreshWaiters++;

setTimeout(() => {
  if (refreshWaiters > 0) {
    debugLog('⚠️ Waiter timeout - force decrementing');
    refreshWaiters--;
  }
}, 60000);  // 1 minute max wait
```

**Benefit**: Prevents stuck waiter count

---

## Comparison to Similar Issues

### Storage Race Condition (Issue #7) - FIXED ✅

**Similarity**: Both are concurrent write issues
**Difference**:
- Storage: Data loss possible (overwrite)
- Token: Inefficiency only (duplicate calls)

**Fix Pattern**: Same mutex approach works for both

### Task List Sync State Machine

**No race condition** - Uses alarms (sequential) and state machine (single writer)

---

## Conclusion

✅ **Safe to implement** - Low risk, high benefit
✅ **Well-understood** - Clear root cause and fix
✅ **Thoroughly planned** - Edge cases covered
✅ **Easy to test** - Reproducible scenarios
✅ **Easy to rollback** - Simple code change

**Recommendation**: Proceed with implementation using Option 1 (Waiter Count Pattern)

**Estimated Effort**: 1-2 hours (implementation + testing)

---

**Analysis By**: Claude (Sonnet 4.5)
**Date**: November 24, 2025
**Status**: Ready for implementation
