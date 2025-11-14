// ColorKit Extension Configuration
// LOCALHOST DEVELOPMENT VERSION

export const CONFIG = {
  // Supabase Configuration
  SUPABASE_URL: 'https://wmmnunrcthtnahxwjlgn.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtbW51bnJjdGh0bmFoeHdqbGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NTQ0NzYsImV4cCI6MjA3NjIzMDQ3Nn0.dcB_6p7ZW-eBZSRn345A3lRY40z80_xeHIYQ_bH7Ffw',

  // Web App URL
  WEB_APP_URL: 'http://localhost:3000',

  // Environment
  ENVIRONMENT: 'development',

  // Debug logging
  DEBUG: true,
};

// Helper function for conditional logging
export function debugLog(...args) {
  if (CONFIG.DEBUG) {
    console.log('[ColorKit]', ...args);
  }
}
