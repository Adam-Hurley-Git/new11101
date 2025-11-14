// DEBUG SCRIPT: Clear all cached OAuth tokens
// Run this from the extension's background service worker console

(async function clearAllOAuthTokens() {
  console.log('🧹 Clearing all cached OAuth tokens...');

  try {
    // Method 1: Get all cached tokens and remove them
    const token = await chrome.identity.getAuthToken({ interactive: false });
    if (token) {
      console.log('Found cached token, removing...');
      await chrome.identity.removeCachedAuthToken({ token: token });
      console.log('✅ Cached token removed');
    } else {
      console.log('ℹ️ No cached token found');
    }
  } catch (error) {
    console.log('ℹ️ No token to clear:', error.message);
  }

  try {
    // Method 2: Clear all cached tokens (nuclear option)
    await chrome.identity.clearAllCachedAuthTokens();
    console.log('✅ All cached auth tokens cleared');
  } catch (error) {
    console.log('⚠️ clearAllCachedAuthTokens not available:', error.message);
  }

  console.log('✅ OAuth cache clear complete!');
  console.log('📋 Next steps:');
  console.log('1. Close this DevTools window');
  console.log('2. Reload the extension (chrome://extensions/)');
  console.log('3. Try the OAuth flow again');
})();
