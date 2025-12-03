# Google Calendar API Research - Tasks Integration

**Date**: December 3, 2025
**Purpose**: Understand how Google Tasks appear in Calendar API for ttb_ mapping

---

## 🎯 **RESEARCH OBJECTIVE**

Determine the correct approach to map `ttb_` format task IDs from Google Calendar DOM to Task API IDs for coloring.

**Current Problem**:
- DOM shows tasks with `data-eventid="ttb_{base64CalendarEventId}"`
- Need to resolve: Calendar Event ID → Task API ID
- Current implementation uses description field, but may be failing

---

## 📚 **KEY FINDINGS FROM RESEARCH**

### **1. Google Calendar API Event Resource**

**Official Documentation**: [Events | Google Calendar API](https://developers.google.com/workspace/calendar/api/v3/reference/events)

**Key Fields Available**:
- `id` - Unique event identifier
- `kind` - Resource type (`calendar#event`)
- `status` - Event status (confirmed, tentative, cancelled)
- `summary` - Event title
- `description` - Detailed description (plain text or HTML)
- `htmlLink` - Link to event in Google Calendar web UI
- `source` - Source from which event was created
  - `source.title` - Title of source
  - `source.url` - URL of source (HTTP/HTTPS)
- `extendedProperties` - Custom key-value pairs
  - `private` - Visible only to creator
  - `shared` - Visible to all attendees
- `eventType` - Type of event (default, focusTime, outOfOffice, workingLocation, birthday, fromGmail)

### **2. Event Types (2024 Updates)**

**Source**: [Event types | Google Calendar API](https://developers.google.com/calendar/api/guides/event-types)

**Available eventTypes**:
- `default` - Regular calendar events
- `focusTime` - Focus time blocks (added 2024)
- `outOfOffice` - Out of office periods
- `workingLocation` - Working location events (added March 2024)
- `birthday` - Birthday events (added September 2024)
- `fromGmail` - Events auto-created from Gmail (changed May 2024)

**Note**: **No specific `task` eventType exists** in the official documentation.

### **3. Extended Properties**

**Source**: [Extended properties | Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/extended-properties)

**Capabilities**:
- Store application-specific data without external database
- Two types: `private` (creator only) and `shared` (all attendees)
- Hidden from end users in Calendar UI
- Can be queried and filtered in API calls

**Potential Use**:
- Google may store task ID in extended properties
- Need to inspect actual event responses to confirm

### **4. Source Field**

**Documentation**: [Event.Source (Calendar API)](https://developers.google.com/resources/api-libraries/documentation/calendar/v3/java/latest/com/google/api/services/calendar/model/Event.Source.html)

**Purpose**: Indicates source from which event was created

**Properties**:
- `title` - Title of source (e.g., web page title, email subject)
- `url` - URL of source (must be HTTP or HTTPS)

**For Gmail-created events**: Shows "This event was automatically created from an email"

**Hypothesis**: Tasks created from Google Tasks may have `source.url` pointing to `tasks.google.com/task/{fragment}`

### **5. Google Tasks vs Google Calendar**

**Key Insights**:
- Google Tasks and Google Calendar are **separate platforms**
- Tasks can be **displayed** in Calendar UI but use **separate APIs**
- Tasks API: `https://www.googleapis.com/tasks/v1/`
- Calendar API: `https://www.googleapis.com/calendar/v3/`

**Integration**:
- When tasks are shown in Calendar, they appear as calendar events
- These events must contain some linkage to the Task API

---

## 🔬 **CURRENT IMPLEMENTATION ANALYSIS**

### **What We're Doing** (`lib/google-calendar-api.js`):

```javascript
// 1. Decode ttb_ → Calendar Event ID
const calendarEventId = "6skm2j311k4aal09vf31c32m8u"; // from base64 decode

// 2. Fetch Calendar Event
const event = await fetchCalendarEvent(calendarEventId);

// 3. Extract task fragment from description
const match = event.description.match(/tasks\.google\.com\/task\/([A-Za-z0-9_-]+)/);
const fragment = match[1]; // e.g., "K8gRiZkif_qqDGI8"

// 4. Convert fragment to Task API ID
const taskApiId = btoa(fragment); // Base64 encode
```

### **Assumption Being Made**:

The **`description` field** contains a link to `tasks.google.com/task/{fragment}`.

### **Why It Might Be Failing**:

1. **Google changed the format** - Description may no longer contain task links
2. **Wrong field** - Task link might be in `source.url` instead
3. **Extended properties** - Task ID might be in private extended properties
4. **No link at all** - Google may use internal IDs without public links

---

## 🧪 **DIAGNOSTIC TEST CREATED**

**File**: `/diagnostics/test-calendar-api-task-event.js`

**What It Does**:
1. ✅ Gets OAuth token
2. ✅ Finds a ttb_ task in DOM
3. ✅ Decodes ttb_ → Calendar Event ID
4. ✅ Fetches event from Calendar API
5. ✅ Inspects **ALL** fields in the response
6. ✅ Checks description for task links
7. ✅ Checks source.url for task links
8. ✅ Checks extended properties
9. ✅ Provides recommendations based on findings

**Output**: Complete analysis showing which field contains the task ID mapping.

---

## 📋 **POSSIBLE SCENARIOS**

### **Scenario A: Description Contains Task Link** ✅

```json
{
  "description": "View in Google Tasks: https://tasks.google.com/task/K8gRiZkif_qqDGI8"
}
```

**Solution**: Current implementation works - just needs better error logging.

**Fix**: Add detailed logging to see why extraction is failing.

---

### **Scenario B: Source.url Contains Task Link** 🔗

```json
{
  "source": {
    "title": "Google Tasks",
    "url": "https://tasks.google.com/task/K8gRiZkif_qqDGI8"
  }
}
```

**Solution**: Update extraction to check `source.url` first, then fall back to description.

**Fix**:
```javascript
export function extractTaskFragmentFromEvent(event) {
  // Try source.url first
  if (event.source?.url) {
    const match = event.source.url.match(/tasks\.google\.com\/task\/([A-Za-z0-9_-]+)/);
    if (match) return match[1];
  }

  // Fall back to description
  if (event.description) {
    const match = event.description.match(/tasks\.google\.com\/task\/([A-Za-z0-9_-]+)/);
    if (match) return match[1];
  }

  return null;
}
```

---

### **Scenario C: Extended Properties Contain Task ID** 🔧

```json
{
  "extendedProperties": {
    "private": {
      "taskId": "SzhnUmlaa2lmX3FxREdJOA==",
      "taskFragment": "K8gRiZkif_qqDGI8"
    }
  }
}
```

**Solution**: Check extended properties for task identifiers.

**Fix**:
```javascript
export function extractTaskFragmentFromEvent(event) {
  // Try extended properties first
  if (event.extendedProperties?.private?.taskFragment) {
    return event.extendedProperties.private.taskFragment;
  }

  if (event.extendedProperties?.private?.taskId) {
    // If we have Task API ID directly, decode it
    return atob(event.extendedProperties.private.taskId);
  }

  // Fall back to URL extraction
  // ... (previous code)
}
```

---

### **Scenario D: No Direct Task ID Available** ❌

```json
{
  "description": "Task: Buy groceries",
  "summary": "Buy groceries"
  // No task link or ID anywhere
}
```

**Solution**: Use Tasks API `webViewLink` to build reverse mapping (already documented in `TTB_FIX_IMPLEMENTATION.md` Fix #5).

**Approach**:
1. During Tasks API sync, extract fragments from `webViewLink`
2. Store mapping: `taskFragment → taskApiId`
3. Try to correlate calendar event ID with task fragment
4. If correlation impossible, use title matching as last resort

---

## 🚀 **IMMEDIATE ACTION PLAN**

### **Step 1: Run Diagnostic Test** ⚡ (5 minutes)

```bash
# In browser console on calendar.google.com:
# Copy/paste contents of /diagnostics/test-calendar-api-task-event.js
```

**Expected Output**:
- ✅ Which field contains the task link (description, source, or extended properties)
- ✅ Exact format of the task link
- ✅ Task fragment extracted
- ✅ Task API ID calculated

**This will tell us EXACTLY which scenario we're in.**

---

### **Step 2: Apply Appropriate Fix** (Based on Test Results)

#### **If Scenario A (Description)**:
→ Current code is correct, just add logging
→ Apply logging fixes from `TTB_FIX_IMPLEMENTATION.md` Fix #2, #3, #4

#### **If Scenario B (Source.url)**:
→ Update `extractTaskFragmentFromEvent()` to check `source.url`
→ See fix code in Scenario B above

#### **If Scenario C (Extended Properties)**:
→ Update `extractTaskFragmentFromEvent()` to check extended properties
→ See fix code in Scenario C above

#### **If Scenario D (No Link)**:
→ Implement webViewLink-based reverse mapping
→ Follow `TTB_FIX_IMPLEMENTATION.md` Fix #5

---

### **Step 3: Update Implementation** (10-20 minutes)

Based on diagnostic results:

1. Update `lib/google-calendar-api.js`
2. Add comprehensive error logging
3. Test with multiple tasks
4. Verify colors appear correctly

---

### **Step 4: Verify & Test** (5 minutes)

1. Reload extension
2. Refresh calendar.google.com
3. Check console logs
4. Verify tasks are colored
5. Test with multiple task lists

---

## 📊 **EXPECTED OUTCOMES**

### **Success Criteria**:

- ✅ Console shows: "✅ Successfully resolved: { calendarEventId, taskApiId }"
- ✅ Tasks appear with custom colors
- ✅ New tasks colored within 2 seconds
- ✅ Colors persist across navigation

### **If Still Failing**:

- Check Calendar API permission granted
- Verify OAuth token has `calendar.readonly` scope
- Check rate limits (unlikely but possible)
- Consider implementing webViewLink fallback (Scenario D)

---

## 📚 **SOURCES & DOCUMENTATION**

### **Official Google Documentation**:

1. [Events | Google Calendar API](https://developers.google.com/workspace/calendar/api/v3/reference/events) - Main events resource reference
2. [Extended properties | Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/extended-properties) - Custom key-value pairs
3. [Event types | Google Calendar API](https://developers.google.com/calendar/api/guides/event-types) - Available event types
4. [Google Calendar API Release Notes](https://developers.google.com/workspace/calendar/docs/release-notes) - Recent updates
5. [Event.Source Documentation](https://developers.google.com/resources/api-libraries/documentation/calendar/v3/java/latest/com/google/api/services/calendar/model/Event.Source.html) - Source field reference

### **Stack Overflow References**:

1. [Google Calendar API: Event source.title and source.url](https://stackoverflow.com/questions/48210323/google-calendar-api-event-source-title-and-source-url-new-calendar-interface) - How source field works
2. [How can I retrieve an extended property?](https://stackoverflow.com/questions/32918350/how-can-i-retrieve-an-extended-property-for-a-google-calendar-event) - Extended properties usage
3. [Calendar Event ID format](https://stackoverflow.com/questions/66273571/splitting-a-base64-encoded-event-id-from-the-calendar-id-and-getting-the-start-t) - Base64 encoding details

### **Related Articles**:

1. [How Google Tasks Work in Google Calendar](https://www.kanbanchi.com/google-workspace-tips/tasks-in-google-calendar) - Task/Calendar integration overview
2. [Google Calendar Tasks vs Events](https://www.techrepublic.com/article/google-calendar-tasks-and-events-which-should-you-use/) - Key differences explained

---

## 🎯 **KEY TAKEAWAYS**

1. **No official `task` eventType** - Tasks don't have a dedicated event type in Calendar API
2. **Separate APIs** - Tasks and Calendar use different APIs
3. **Three possible mapping fields**:
   - `description` - Most likely (current implementation)
   - `source.url` - Alternative location
   - `extendedProperties` - Hidden metadata
4. **Test is critical** - Must inspect actual API responses to confirm

**👉 NEXT STEP: Run `/diagnostics/test-calendar-api-task-event.js` and report findings!**

This will immediately reveal which field contains the task mapping.

---

**End of Research Report**
