// Run this in browser console to check settings
chrome.storage.sync.get('settings', (data) => {
  const settings = data.settings || {};
  console.log('=== TASK COLORING SETTINGS ===');
  console.log('Task Coloring Enabled:', settings.taskColoring?.enabled);
  console.log('Task List Coloring Enabled:', settings.taskListColoring?.enabled);
  console.log('OAuth Granted:', settings.taskListColoring?.oauthGranted);
  console.log('\nFull taskColoring:', settings.taskColoring);
  console.log('\nFull taskListColoring:', settings.taskListColoring);
});
