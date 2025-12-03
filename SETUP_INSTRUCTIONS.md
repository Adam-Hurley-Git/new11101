# Setup Instructions for Google Calendar New UI Task Coloring

**Version**: 0.0.4
**Date**: December 3, 2025
**Purpose**: Enable Calendar API for task coloring on Google Calendar's new UI

---

## Overview

This guide walks you through enabling the Google Calendar API in your Google Cloud Console and testing the updated extension. The extension now requires both **Google Tasks API** (already configured) and **Google Calendar API** (new requirement) to support Google Calendar's new UI.

---

## Part 1: Google Cloud Console Setup

### Step 1: Navigate to Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (the one associated with your OAuth Client ID: `373311643778-3m6quqgtu8jcsn1ncq6t2ubjeiit3f6n`)
3. If you don't see a project, create one:
   - Click "Select a project" → "New Project"
   - Name: "ColorKit Extension" (or any name)
   - Click "Create"

### Step 2: Enable Google Calendar API

1. In the left sidebar, click **"APIs & Services"** → **"Library"**
2. Search for **"Google Calendar API"**
3. Click on **"Google Calendar API"** from the results
4. Click the blue **"Enable"** button
5. Wait for confirmation that the API is enabled (usually instant)

**Verification**: You should see "API enabled" with a green checkmark

### Step 3: Update OAuth Consent Screen (Add Calendar Scope)

1. In the left sidebar, click **"APIs & Services"** → **"OAuth consent screen"**
2. You should see your existing consent screen configuration
3. Click **"Edit App"** button
4. Navigate through the wizard to **"Scopes"** section
5. Click **"Add or Remove Scopes"**
6. In the filter box, search for: **"calendar.readonly"**
7. Find and check the box for:
   - **`https://www.googleapis.com/auth/calendar.readonly`**
   - Description: "See events on all your calendars"
8. Verify your existing scope is still selected:
   - **`https://www.googleapis.com/auth/tasks.readonly`**
9. Click **"Update"** at the bottom
10. Click **"Save and Continue"** through the remaining steps
11. Click **"Back to Dashboard"**

**Important**: You do NOT need to create a new OAuth Client ID. The extension will reuse your existing client ID (`373311643778-3m6quqgtu8jcsn1ncq6t2ubjeiit3f6n`).

### Step 4: Verify API Quotas (Optional)

1. Go to **"APIs & Services"** → **"Dashboard"**
2. You should see both APIs listed:
   - **Google Tasks API** (already in use)
   - **Google Calendar API** (newly enabled)
3. Click on **"Google Calendar API"**
4. Click **"Quotas & System Limits"** tab
5. Default quota: **1,000,000 queries/day** (more than enough)

**Expected Usage**:
- Normal user: ~30 Calendar API calls/day
- Heavy user: ~1,000 Calendar API calls/day
- You have plenty of quota headroom

---

## Part 2: Load and Test the Extension

### Step 5: Load Extension in Chrome

1. Open Chrome browser
2. Navigate to: **`chrome://extensions`**
3. Enable **"Developer mode"** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Navigate to your extension directory: `/home/user/new11101`
6. Click **"Select Folder"**

**Expected Result**: Extension should load successfully with version **0.0.4**

### Step 6: Grant OAuth Permissions

When you first use a feature that requires Calendar API access:

1. Open the extension popup (click extension icon)
2. Enable **"Task List Coloring"** toggle
3. Click **"Grant Access to Google Tasks"** button
4. Chrome will show OAuth consent dialog
5. **New prompt**: You should see BOTH permissions listed:
   - "See events on all your calendars" (NEW)
   - "View your tasks" (existing)
6. Click **"Allow"** to grant permissions

**Important**: If you previously granted Tasks API access, Chrome may do a "silent upgrade" (no prompt). This is normal and means permissions were automatically updated.

### Step 7: Verify Extension Loaded

1. Check **`chrome://extensions`** page:
   - Extension name: "ColorKit for Google Calendar"
   - Version: **0.0.4**
   - Status: Enabled (blue toggle)
   - No errors in the card

2. Open browser console (F12 → Console tab)
3. Navigate to: **https://calendar.google.com**
4. Look for console logs:
   - `[TaskColoring] Feature initialized`
   - `[CalendarAPI] Module loaded`
   - No red errors related to ColorKit

---

## Part 3: Testing Checklist

### Test 1: Verify New UI Detection

1. Open **https://calendar.google.com** (ensure you're on the new UI)
2. Open browser DevTools (F12)
3. Go to **Console** tab
4. Run this command:
   ```javascript
   document.querySelectorAll('[data-eventid^="ttb_"]').length
   ```
5. **Expected result**: Should return a number > 0 (if you have tasks on calendar)
6. If result is 0, you might be on the old UI or have no tasks visible

### Test 2: Manual Task Coloring

1. Create a test task with a due date:
   - Click any date on Google Calendar
   - Click "Task" (not Event)
   - Enter title: "Test Task"
   - Set due date to today or tomorrow
   - Click "Save"

2. Task should appear on calendar as a chip/button

3. Click on the task chip to open the task popup

4. Look for the color picker in the popup:
   - Should see inline color circles
   - Should see "Choose Color" button

5. Click a color to apply it

6. **Expected result**: Task chip should immediately change to selected color

7. **Check console**: Look for logs like:
   ```
   [TaskColoring] Resolving calendar event: {eventId}
   [CalendarAPI] Fetching calendar event: {eventId}
   [TaskColoring] Resolved task ID: {taskId}
   ```

### Test 3: Task List Default Colors

1. Open extension popup
2. Enable **"Task List Coloring"** if not already enabled
3. Click **"Grant Access"** if needed (see Step 6)
4. Wait for task lists to load (should see your task list names)
5. Click the color dot next to a task list name
6. Select a default color for that list
7. Create a new task in that list with a due date
8. **Expected result**: New task should automatically appear in the list's default color

### Test 4: Completed Task Styling

1. Open extension popup
2. Expand a task list's settings (click ▼ arrow)
3. Enable **"Enable Completed Task Styling"** toggle
4. Set opacity sliders (background and text)
5. Complete a task on Google Calendar (check the checkbox)
6. **Expected result**: Completed task should render with adjusted opacity/colors

### Test 5: Cache Behavior

1. Open **https://calendar.google.com**
2. Colored tasks should load immediately (cache hit)
3. Create a NEW task with due date
4. First load may take 100-200ms (Calendar API call)
5. Navigate away and back to calendar
6. **Expected result**: Task should load instantly (cache hit)

### Test 6: Offline Behavior

1. Color some tasks
2. Open Chrome DevTools → Network tab
3. Check "Offline" box to simulate network failure
4. Refresh Google Calendar
5. **Expected result**: Previously colored tasks should still appear colored (using cache)
6. New tasks won't color (API unavailable, expected)

### Test 7: Old UI Compatibility (If Available)

If you have access to the old Google Calendar UI:

1. Switch to old UI (if Google provides a toggle)
2. **Expected result**: Task coloring should still work (hybrid approach)
3. Console should show logs using `data-eventid="tasks."` format

---

## Part 4: Troubleshooting

### Issue 1: "Failed to enable Google Calendar API"

**Symptoms**: Console shows errors like `401 Unauthorized` or `403 Forbidden`

**Solutions**:
1. Verify Calendar API is enabled in Google Cloud Console (see Step 2)
2. Check OAuth consent screen has `calendar.readonly` scope (see Step 3)
3. Try revoking and re-granting permissions:
   - Go to: https://myaccount.google.com/permissions
   - Find "ColorKit for Google Calendar"
   - Click "Remove Access"
   - Re-open extension popup and click "Grant Access" again

### Issue 2: Tasks Not Coloring on New UI

**Symptoms**: Tasks appear on calendar but colors don't apply

**Diagnosis**:
1. Open browser console (F12)
2. Run this command:
   ```javascript
   document.querySelectorAll('[data-eventid^="ttb_"]').length
   ```
3. If result is **0**: You may be on old UI or have no tasks visible
4. If result is **> 0**: New UI detected, check next steps

**Solutions**:
1. Check console for errors related to `[CalendarAPI]` or `[TaskColoring]`
2. Verify extension version is **0.0.4** (check `chrome://extensions`)
3. Clear extension cache:
   - Open popup → "Advanced Settings" → "Clear Cache"
   - Or run in console: `chrome.storage.local.clear()`
4. Hard refresh calendar page: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Issue 3: "RESOLVE_CALENDAR_EVENT not found"

**Symptoms**: Console shows `Unknown message type: RESOLVE_CALENDAR_EVENT`

**Solution**: Background script not updated properly
1. Go to `chrome://extensions`
2. Find ColorKit extension
3. Click **"Reload"** button (circular arrow icon)
4. Refresh Google Calendar page

### Issue 4: Permissions Not Updating

**Symptoms**: OAuth dialog only shows Tasks permission, not Calendar permission

**Solution**:
1. Go to: https://myaccount.google.com/permissions
2. Find "ColorKit for Google Calendar"
3. Click "Remove Access"
4. Reload extension: `chrome://extensions` → Click "Reload"
5. Re-open extension popup
6. Click "Grant Access" again
7. Should now see BOTH permissions in OAuth dialog

### Issue 5: Slow Task Coloring (>1 second)

**Symptoms**: Tasks take a long time to color after page load

**Diagnosis**:
1. Check console for Calendar API calls: `[CalendarAPI] Fetching calendar event`
2. If you see many API calls, cache may not be working

**Solutions**:
1. Check cache is enabled (should be automatic)
2. Verify cache lifetime: Tasks should only make 1 API call per 30 seconds
3. Monitor API usage in Google Cloud Console:
   - Go to **"APIs & Services"** → **"Dashboard"**
   - Click **"Google Calendar API"**
   - Check quota usage (should be low)

### Issue 6: Mixed UI States

**Symptoms**: Some tasks have `ttb_` prefix, others have `tasks.` prefix

**Solution**: This is normal during Google's gradual rollout
- Extension supports BOTH formats simultaneously
- No action needed
- All tasks should color correctly regardless of format

---

## Part 5: Verification Commands

### Check Extension Version

```javascript
// Run in browser console on any page
chrome.runtime.getManifest().version
// Expected: "0.0.4"
```

### Check OAuth Scopes Granted

```javascript
// Run in browser console on calendar.google.com
chrome.identity.getAuthToken({ interactive: false }, (token) => {
  console.log('Token:', token ? 'Granted' : 'Not granted');
});
```

### Check Calendar Event Mapping Cache

```javascript
// Run in browser console on calendar.google.com
chrome.storage.local.get('cf.calendarEventMapping', (data) => {
  const count = Object.keys(data['cf.calendarEventMapping'] || {}).length;
  console.log(`Calendar event mappings cached: ${count}`);
});
```

### Force Cache Refresh

```javascript
// Run in browser console on calendar.google.com
chrome.storage.local.set({ 'cf.calendarEventMapping': {} }, () => {
  console.log('Calendar mapping cache cleared');
  location.reload();
});
```

### Check Task ID Resolution

```javascript
// Run in browser console on calendar.google.com
// Replace 'ttb_XXX' with actual ttb_ value from your calendar
const testTtb = 'ttb_MGh2bHY1czgyZGt1MzNrNGUga3Vyc2J1c2luZXNzQG0'; // example

// Decode ttb_ to calendar event ID
const base64Part = testTtb.slice(4);
const decoded = atob(base64Part);
console.log('Decoded:', decoded);

// Send resolution request
chrome.runtime.sendMessage(
  {
    type: 'RESOLVE_CALENDAR_EVENT',
    calendarEventId: decoded.split(' ')[0],
  },
  (response) => {
    console.log('Resolution response:', response);
  }
);
```

---

## Part 6: Monitoring and Maintenance

### Monitor API Usage

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **"APIs & Services"** → **"Dashboard"**
3. Click **"Google Calendar API"**
4. View **"Metrics"** tab
5. Check daily query count

**Expected Usage**:
- 0-50 queries/day: Light usage (normal)
- 50-500 queries/day: Moderate usage (normal)
- 500+ queries/day: Heavy usage (still well within quota)

### Check for Quota Errors

If you approach quota limits (unlikely), you'll see:
- Console errors: `429 Too Many Requests`
- Extension popup shows error message
- Tasks won't color until quota resets (daily at midnight Pacific Time)

**Solution**: Request quota increase in Google Cloud Console (free)

### Performance Monitoring

Check console logs for timing:
```
[CalendarAPI] Fetching calendar event: {id} - took 150ms
```

**Good**: 50-200ms per API call
**Slow**: 500ms+ per API call (may indicate API issues)

---

## Part 7: Success Criteria

You'll know everything is working correctly when:

1. ✅ Extension version shows **0.0.4** in `chrome://extensions`
2. ✅ Google Calendar API is **enabled** in Cloud Console
3. ✅ OAuth consent screen includes **calendar.readonly** scope
4. ✅ Extension loads without errors in console
5. ✅ Manual task coloring works (Test 2 passes)
6. ✅ Task list default colors work (Test 3 passes)
7. ✅ Completed task styling works (Test 4 passes)
8. ✅ Console shows `[CalendarAPI]` logs when coloring tasks
9. ✅ Cache hit rate is high (repeat visits load instantly)
10. ✅ No API quota errors in Google Cloud Console

---

## Part 8: Next Steps After Setup

Once you've verified everything works:

1. **Test with Real Tasks**: Color your actual tasks and task lists
2. **Monitor for 24 Hours**: Check for any errors or performance issues
3. **Check API Usage**: Review quota usage in Cloud Console after 1 day
4. **User Feedback**: If you have beta testers, deploy to them
5. **Chrome Web Store**: Prepare for extension update submission

---

## Part 9: Support and Debugging

### Enable Debug Mode

```javascript
// Run in browser console on calendar.google.com
localStorage.setItem('cc3_debug', 'true');
location.reload();
```

This will enable verbose logging for all extension components.

### View All Extension Logs

1. Go to `chrome://extensions`
2. Find ColorKit extension
3. Click **"service worker"** link (under "Inspect views")
4. Opens DevTools for background script
5. Check Console tab for background script logs

### Export Debug Data

```javascript
// Run in browser console on calendar.google.com
async function exportDebugData() {
  const sync = await chrome.storage.sync.get(null);
  const local = await chrome.storage.local.get(null);

  const data = {
    version: chrome.runtime.getManifest().version,
    timestamp: new Date().toISOString(),
    sync: sync,
    local: local,
    taskElements: document.querySelectorAll('[data-eventid^="ttb_"]').length,
  };

  console.log(JSON.stringify(data, null, 2));
  return data;
}

exportDebugData();
```

Copy the output and save to a file for troubleshooting.

---

## Summary

You have successfully:
- ✅ Enabled Google Calendar API in Google Cloud Console
- ✅ Updated OAuth consent screen with calendar.readonly scope
- ✅ Loaded extension version 0.0.4 in Chrome
- ✅ Granted Calendar API permissions to extension
- ✅ Tested task coloring on Google Calendar new UI
- ✅ Verified cache behavior and performance

**Your extension now supports Google Calendar's new UI with the `ttb_` prefix!**

If you encounter any issues not covered in this guide, check:
1. Browser console for error messages
2. Background script console (`chrome://extensions` → "service worker")
3. Google Cloud Console API metrics
4. Extension storage data (see verification commands above)

---

**Document Version**: 1.0
**Last Updated**: December 3, 2025
**Extension Version**: 0.0.4
