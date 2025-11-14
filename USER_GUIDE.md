# ColorKit Chrome Extension - User Guide

**Version**: 1.0
**Last Updated**: November 3, 2025

Welcome to ColorKit! This guide will help you get the most out of your Google Calendar customization extension.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Feature 1: Calendar Day Coloring](#feature-1-calendar-day-coloring)
3. [Feature 2: Individual Task Coloring](#feature-2-individual-task-coloring)
4. [Feature 3: Task List Default Colors](#feature-3-task-list-default-colors-new)
5. [Feature 4: Time Blocking](#feature-4-time-blocking)
6. [Frequently Asked Questions](#frequently-asked-questions)
7. [Troubleshooting](#troubleshooting)
8. [Privacy & Security](#privacy--security)

---

## Getting Started

### Installation

1. Install ColorKit from the Chrome Web Store
2. Pin the extension to your toolbar for easy access
3. Open Google Calendar (https://calendar.google.com)
4. Click the ColorKit icon to open the settings popup

### Initial Setup

- An active subscription is required to use ColorKit features
- Visit the ColorKit web portal to manage your subscription
- Once subscribed, all features are unlocked and ready to use

---

## Feature 1: Calendar Day Coloring

**Color-code your calendar by day of the week or specific dates.**

### How to Enable

1. Click the ColorKit extension icon
2. Find the "Calendar Day Coloring" section
3. Toggle "Enable day coloring" to ON

### Coloring Days of the Week

**Set different background colors for each weekday:**

1. In the "Weekday Colors" section, you'll see 7 color selectors (Monday through Sunday)
2. Click any day's color picker to change its color
3. Choose from:
   - **Vibrant colors**: Bold, saturated colors
   - **Pastel colors**: Soft, muted colors
   - **Dark colors**: Deep, rich colors
   - **Custom colors**: Your saved custom colors
4. Colors apply immediately to your calendar
5. Click "Clear" next to any day to remove its color

**Example Use Cases:**

- Highlight weekends in a relaxing blue
- Mark Monday in energizing yellow
- Use pastel colors for a calm workspace

### Coloring Specific Dates

**Highlight important dates like birthdays, holidays, or deadlines:**

1. In the "Specific Date Colors" section, click "+ Add Date"
2. Select a date from the date picker
3. Choose a color for that date
4. The date will be highlighted on your calendar
5. To remove a date color, click the "Remove" button next to it

**Example Use Cases:**

- Mark your birthday in gold
- Highlight project deadlines in red
- Color holidays in festive colors

### Adjusting Opacity

**Control how transparent or solid the day colors appear:**

1. Find the "Weekday Opacity" slider
2. Drag left for more transparency (0%)
3. Drag right for more solid color (100%)
4. Default is 15% (subtle background tint)

**Tips:**

- Lower opacity (10-20%) works well for busy calendars
- Higher opacity (50-80%) makes colors more prominent
- Test different values to find what works for you

### Week Start Day

**Choose whether your week starts on Sunday or Monday:**

1. Find the "Week Start" dropdown
2. Select "Sunday" or "Monday"
3. Your calendar grid will adjust to start on your chosen day

---

## Feature 2: Individual Task Coloring

**Assign custom colors to individual tasks to categorize and prioritize them.**

### How to Enable

1. Click the ColorKit extension icon
2. Find the "Task Coloring" section
3. Toggle "Enable task coloring" to ON

### Coloring Tasks from the Calendar

**Quick coloring directly from your calendar view:**

1. Find a task on your Google Calendar
2. Click the task to open its details popup
3. Look for the ColorKit color picker at the top of the popup
4. Click a color to apply it instantly
5. The task's background color will update immediately

**Features:**

- **Inline colors**: 8 quick-access colors at the top of the popup
- **Full palette**: Click "Choose Color" for access to all colors
- **Clear color**: Click "Clear Color" to remove task coloring

### Coloring Tasks from the Task Edit Modal

**More color options when editing a task:**

1. Open a task's edit modal (click "Edit" on a task)
2. Scroll to find the ColorKit color section
3. Choose from:
   - Inline colors (quick selection)
   - Full color palette (Vibrant, Pastel, Dark, Custom)
4. Colors save automatically when you save the task

### Customizing Color Palettes

**Personalize which colors appear in quick-access areas:**

#### Preset Colors (Calendar Popup)

1. In the ColorKit settings popup, find "Preset Colors"
2. You'll see 12 color slots
3. Click any color to change it
4. Click "Add Color" to add more (up to 12)
5. Click the X icon to remove a color
6. These colors appear in the calendar task popup

#### Inline Colors (Task Edit Modal)

1. Find "Inline Colors" in the settings
2. You'll see 8 color slots
3. Click any color to change it
4. These colors appear in the task edit modal

**Tips:**

- Use colors that match your workflow (e.g., red = urgent, blue = meetings)
- Keep frequently-used colors in the inline section
- Remove colors you never use to simplify selection

---

## Feature 3: Task List Default Colors (NEW)

**Automatically color all tasks from a specific task list with one color.**

### What is This Feature?

Instead of coloring tasks one-by-one, set a default color for an entire task list. All tasks in that list will automatically get that color!

**Example:**

- "Work Tasks" list → Blue (all work tasks appear blue)
- "Personal" list → Green (all personal tasks appear green)
- "Urgent" list → Red (all urgent tasks appear red)

### How to Enable

1. Click the ColorKit extension icon
2. Find the "Task List Default Colors" section
3. Toggle "Enable list default colors" to ON

### First-Time Setup: Grant Access

**ColorKit needs permission to see which list each task belongs to:**

1. After enabling the feature, you'll see a "Grant Access to Task Lists" button
2. Click the button
3. A Google sign-in window will appear
4. Select your Google account
5. Review the permissions:
   - ✅ **Read-only access** (ColorKit cannot modify your tasks)
   - ✅ **Secure OAuth 2.0**
   - ✅ **Revoke anytime** from your Google Account settings
6. Click "Allow"
7. ColorKit will sync your task lists (this may take a few seconds)

**What happens during sync:**

- ColorKit downloads a list of your task lists (e.g., "My Tasks", "Work", "Shopping")
- It creates a map of which tasks belong to which list
- This information is stored locally on your device
- No data is sent to third parties

### Setting Default Colors

**Assign colors to your task lists:**

1. After granting access, you'll see all your task lists displayed
2. Each list has:
   - **List name** (e.g., "My Tasks")
   - **Color picker** (click to choose a color)
   - **Clear button** (removes the default color)

3. To set a color:
   - Click the color picker next to a list name
   - Choose a color from the palette
   - Click "Apply"

4. You'll be asked: "Apply to existing tasks?"
   - **Apply**: All existing tasks in that list will be colored immediately
   - **Skip**: Only new tasks will get the default color

### How It Works

**Priority System:**

ColorKit applies colors in this priority:

1. **Manual colors** (highest priority)
   - If you manually colored a task, that color always wins
2. **List default colors** (medium priority)
   - If no manual color is set, the task gets its list's default color
3. **No color** (lowest priority)
   - If neither is set, the task has no color

**Example:**

- "Work Tasks" list default color = Blue
- You manually color one work task Red
- Result: Most work tasks are blue, but the one you colored manually stays red

### Instant Coloring for New Tasks

**New tasks get colored automatically:**

1. Create a new task in Google Calendar
2. Assign it to a list that has a default color
3. Within 1 second, the task will appear with that list's color
4. No manual action needed!

**How it works behind the scenes:**

- ColorKit detects when you create a new task
- It looks up which list the task belongs to
- It applies that list's default color instantly
- All of this happens automatically

### Syncing

**ColorKit stays in sync with your Google Tasks:**

**Automatic Sync:**

- **Active mode** (when you're using Calendar): Every 1 minute
- **Idle mode** (Calendar open but not active): Every 5 minutes
- **Sleep mode** (Calendar closed): Paused

**Manual Sync:**

1. Click the "Sync Now" button in the settings
2. ColorKit will fetch the latest task list data from Google
3. Useful after creating new lists or moving tasks between lists

**Last Synced:**

- Check the "Last synced" timestamp to see when data was last updated

### Managing Default Colors

**To change a list's default color:**

1. Click the color picker next to the list
2. Choose a new color
3. Decide whether to apply to existing tasks

**To remove a list's default color:**

1. Click the "Clear" button next to the list
2. Tasks in that list will no longer have a default color
3. Manual colors will still be preserved

**To disable the feature:**

1. Toggle "Enable list default colors" to OFF
2. All list default colors are paused
3. Manual task colors continue working normally
4. Your default color settings are saved and will reactivate when you re-enable

### Revoking Access

**If you want to revoke ColorKit's access to your task lists:**

**Option 1: In ColorKit**

1. Disable "Task List Default Colors" feature
2. Your OAuth token will eventually expire (tokens last 60 minutes)

**Option 2: In Google Account**

1. Go to https://myaccount.google.com/permissions
2. Find "ColorKit" in the list
3. Click "Remove Access"
4. ColorKit will no longer be able to sync task lists

---

## Feature 4: Time Blocking

**Shade specific time blocks on your calendar to visualize your work schedule.**

### How to Enable

1. Click the ColorKit extension icon
2. Find the "Time Blocking" section
3. Toggle "Enable time blocking" to ON

### Setting a Global Time Block Color

**Choose a default color for all time blocks:**

1. Find "Global Time Block Color"
2. Click the color picker
3. Select a color (this will be used for all time blocks)
4. Click "Apply"

### Shading Style

**Control how the time blocks appear:**

1. Find the "Shading Style" dropdown
2. Choose from:
   - **Solid**: Full color overlay
   - **Striped**: Diagonal stripes pattern
   - **Dotted**: Dotted pattern
   - **Gradient**: Fade effect
3. Preview the style on your calendar

### Creating a Weekly Schedule

**Define recurring time blocks for each day of the week:**

1. In the "Weekly Schedule" section, find the day you want to block
2. Click "+ Add Time Block"
3. Set the start time (e.g., 9:00 AM)
4. Set the end time (e.g., 5:00 PM)
5. Optionally, click the color picker to override the global color
6. Click "Save"
7. The time block will appear on all instances of that weekday

**Example Weekly Schedule:**

- Monday-Friday: 9 AM - 5 PM (work hours in blue)
- Monday/Wednesday: 6 PM - 7 PM (gym in green)
- Saturday: 10 AM - 2 PM (errands in yellow)

### Date-Specific Time Blocks

**Block time for specific dates (one-time events):**

1. In the "Date-Specific Schedule" section, click "+ Add Date Block"
2. Select a date
3. Set the start and end time
4. Choose a color (optional)
5. Click "Save"

**Use cases:**

- Block off vacation days
- Mark time for a specific meeting or event
- Highlight important one-time commitments

### Managing Time Blocks

**To edit a time block:**

1. Click the time block in the list
2. Modify the start/end time or color
3. Click "Save"

**To delete a time block:**

1. Click the X icon next to the time block
2. Confirm deletion
3. The block will be removed from your calendar

---

## Frequently Asked Questions

### General

**Q: Do I need to keep the extension popup open?**
A: No! Once you configure your settings, close the popup. Colors will continue to appear automatically.

**Q: Can I use multiple features at once?**
A: Yes! All features work independently and can be used together.

**Q: Will my settings sync across devices?**
A: Yes, most settings sync via your Chrome profile. However, some data (like task-to-list mappings) is stored locally.

**Q: How do I reset all settings?**
A: Right-click the extension icon → "Options" → "Reset to Defaults"

### Calendar Day Coloring

**Q: Can I color multiple specific dates at once?**
A: Not yet, but you can add dates one-by-one quickly.

**Q: Do date-specific colors override weekday colors?**
A: Yes, specific date colors take priority over weekday colors.

### Individual Task Coloring

**Q: Can I color tasks that are not on my calendar?**
A: Only tasks visible on Google Calendar can be colored.

**Q: Do task colors sync with Google Tasks app?**
A: No, task colors are stored by ColorKit and only visible in Google Calendar with the extension installed.

**Q: Can I bulk-color multiple tasks?**
A: Use Task List Default Colors (Feature 3) to color entire lists at once.

### Task List Default Colors

**Q: Why do I need to grant Google access?**
A: ColorKit needs to know which list each task belongs to. This requires read-only access to your Google Tasks data.

**Q: Is my data safe?**
A: Yes! ColorKit uses read-only OAuth (cannot modify your tasks), data stays on your device, and tokens are managed securely by Chrome.

**Q: What if I create a new task list?**
A: Click "Sync Now" to fetch the new list, then set its default color.

**Q: Can I use this without granting Google access?**
A: No, this specific feature requires OAuth. However, Individual Task Coloring (Feature 2) works without OAuth.

**Q: How often does it sync?**
A: Every 1-5 minutes depending on your activity. You can also click "Sync Now" for instant sync.

### Time Blocking

**Q: Can I overlap time blocks?**
A: Yes, but the visual result may look cluttered. Use different colors or shading styles to distinguish them.

**Q: Do time blocks appear on mobile?**
A: Only if you have the extension installed on a desktop browser viewing the calendar.

---

## Troubleshooting

### Colors Not Appearing

**Calendar Day Coloring:**

1. Ensure the feature is enabled (toggle ON)
2. Refresh Google Calendar (F5 or Cmd+R)
3. Check browser console for errors (F12 → Console tab)

**Task Coloring:**

1. Verify task coloring is enabled
2. Click a task to ensure the color picker appears
3. Clear browser cache and reload

**Task List Default Colors:**

1. Check that OAuth access is granted
2. Click "Sync Now" to refresh data
3. Verify the task belongs to a list with a default color set
4. Check that you don't have a manual color overriding it

**Time Blocking:**

1. Ensure time blocking is enabled
2. Verify time blocks don't overlap excessively
3. Try changing the shading style

### Extension Not Loading

1. Check that you're on https://calendar.google.com
2. Ensure the extension is enabled in Chrome (chrome://extensions)
3. Try disabling and re-enabling the extension
4. Uninstall and reinstall as a last resort

### Syncing Issues (Task List Colors)

1. Check your internet connection
2. Verify OAuth access is still granted (check Google Account permissions)
3. Try manual sync with "Sync Now"
4. Revoke and re-grant OAuth access if needed

### Performance Issues

1. Reduce opacity for day coloring (less CPU usage)
2. Limit the number of custom colors
3. Disable features you don't use
4. Clear browser cache

### Subscription Issues

1. Verify your subscription is active in the ColorKit web portal
2. Click "Check Subscription" in the extension popup
3. Contact support if you believe there's an error

---

## Privacy & Security

### What Data Does ColorKit Collect?

**Stored Locally on Your Device:**

- Your color preferences
- Task colors
- Task list default colors
- Task-to-list mapping
- Time blocking schedule

**Stored in Chrome Sync:**

- Settings
- Custom colors
- Some preferences

**NOT Collected:**

- Task content or details
- Calendar event details
- Personal information beyond what's needed for subscription validation

### OAuth Permissions (Task List Default Colors)

**What ColorKit can access:**

- List of your task lists (names and IDs)
- Tasks in those lists (IDs and which list they belong to)
- Read-only access only (cannot modify, create, or delete tasks)

**What ColorKit CANNOT access:**

- Task titles, descriptions, or notes
- Due dates, times, or reminders
- Your emails or contacts
- Any other Google data

### Third-Party Data Sharing

ColorKit does NOT share your data with third parties, except:

- **Supabase**: Used for subscription validation only
- **Paddle**: Payment processing (they don't receive calendar data)

### Revoking Permissions

You can revoke ColorKit's access anytime at:
https://myaccount.google.com/permissions

### Data Deletion

To delete all ColorKit data:

1. Uninstall the extension
2. This removes all local data
3. Revoke OAuth access (see above)
4. Contact support to delete subscription data

---

## Support & Feedback

**Need help?**

- Check this guide first
- Visit our support portal: [Link to support site]
- Email: support@colorkit.com

**Have feedback or feature requests?**

- Submit feedback through the extension popup
- Join our Discord community: [Link]
- Follow us on Twitter: @ColorKitApp

**Found a bug?**

- Report issues at: https://github.com/[your-repo]/issues
- Include browser version, extension version, and steps to reproduce

---

## Keyboard Shortcuts

ColorKit supports the following shortcuts (coming soon):

- `Ctrl+Shift+C` - Open ColorKit popup
- `Ctrl+Shift+T` - Quick-color selected task
- `Ctrl+Shift+R` - Refresh colors

---

## Tips & Best Practices

1. **Start Simple**: Enable one feature at a time to avoid overwhelm
2. **Use Consistent Colors**: Create a color-coding system and stick to it
3. **Combine Features**: Use day coloring + task coloring for maximum organization
4. **Adjust Opacity**: Find the right balance between visibility and aesthetics
5. **Sync Regularly**: If using Task List Colors, sync after major changes
6. **Save Custom Colors**: Save your frequently-used colors for quick access
7. **Test on a Quiet Week**: Try features during a less busy week to get comfortable

---

## What's New

### Version 1.0 (November 2025)

- ✨ NEW: Task List Default Colors feature
- ⚡ Performance: 99.9% faster color lookups
- ⚡ Instant coloring for new tasks (<1 second)
- 🐛 Fixed: Task ID encoding issues
- 🐛 Fixed: Storage read spam
- 🧹 Code cleanup: Removed debug logging

### Coming Soon

- Bulk task coloring tools
- Color templates/presets
- Import/export settings
- Mobile app support

---

**Thank you for using ColorKit!** 🎨

We're committed to making Google Calendar customization simple and powerful. If you enjoy ColorKit, please leave us a review on the Chrome Web Store!
