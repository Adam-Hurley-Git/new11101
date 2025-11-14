// ColorKit Extension Configuration
// VERCEL PRODUCTION VERSION
//
// INSTRUCTIONS:
// 1. After deploying to Vercel, update WEB_APP_URL with your Vercel URL
// 2. To use production config, update imports in:
//    - background.js
//    - popup/popup.js
//    - lib/subscription-validator.js
//    Change: import { CONFIG } from './config.js'
//    To:     import { CONFIG } from './config.production.js'

export const CONFIG = {
  // Supabase Configuration (same as development)
  SUPABASE_URL: 'https://wmmnunrcthtnahxwjlgn.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtbW51bnJjdGh0bmFoeHdqbGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NTQ0NzYsImV4cCI6MjA3NjIzMDQ3Nn0.dcB_6p7ZW-eBZSRn345A3lRY40z80_xeHIYQ_bH7Ffw',

  // Web App URL
  // Production domain for ColorKit portal
  WEB_APP_URL: 'https://portal.calendarextension.com',

  // Web Push API Configuration (VAPID)
  // Public key for subscribing to push notifications
  // This is the modern, standard approach for push notifications
  // IMPORTANT: This MUST match VAPID_PUBLIC_KEY in Vercel environment variables
  // Updated: January 2025 to match Vercel production key
  VAPID_PUBLIC_KEY: 'BDzFvolcEIcAVROnYjCpQian2gKqPy6rETx0jEJntUSakNLlo0F1pv40LUZ524zaHd5S-xDqfipCDMdpP-o74T4',

  // Environment
  ENVIRONMENT: 'production',

  // Debug logging (set to false for production)
  DEBUG: false,
};

// Helper function for conditional logging
export function debugLog(...args) {
  if (CONFIG.DEBUG) {
    console.log('[ColorKit]', ...args);
  }
}
