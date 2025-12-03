// ========================================
// QUICK CHECK: Is Task Coloring Enabled?
// ========================================
// Run this in browser console on calendar.google.com

chrome.storage.sync.get('settings', (data) => {
  const settings = data.settings || {};
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TASK COLORING STATUS CHECK');
  console.log('='.repeat(60));
  
  console.log('\n🎨 Task Coloring (Manual Colors):');
  console.log('  Enabled:', settings.taskColoring?.enabled);
  console.log('  Preset Colors:', settings.taskColoring?.presetColors?.length || 0);
  console.log('  Inline Colors:', settings.taskColoring?.inlineColors?.length || 0);
  
  console.log('\n📋 Task List Coloring (Auto Colors):');
  console.log('  Enabled:', settings.taskListColoring?.enabled);
  console.log('  OAuth Granted:', settings.taskListColoring?.oauthGranted);
  console.log('  Last Sync:', settings.taskListColoring?.lastSync ? new Date(settings.taskListColoring.lastSync).toLocaleString() : 'Never');
  
  console.log('\n🔍 DIAGNOSIS:');
  
  if (!settings.taskColoring?.enabled && !settings.taskListColoring?.enabled) {
    console.log('❌ ISSUE: Both task coloring features are DISABLED');
    console.log('   Action: Enable "Task Coloring" in extension popup');
  } else if (!settings.taskColoring?.enabled) {
    console.log('⚠️  Manual task coloring is disabled');
    console.log('   This means individual task colors won\'t work');
  } else if (!settings.taskListColoring?.enabled) {
    console.log('⚠️  Task list coloring is disabled');
    console.log('   This means list default colors won\'t work');
  } else {
    console.log('✅ Features are enabled in settings');
    console.log('   But cfTasksColoring is undefined - initialization failed!');
    console.log('   Check console for initialization errors');
  }
  
  console.log('\n' + '='.repeat(60));
});
