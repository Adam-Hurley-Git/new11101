// Supabase Client for Chrome Extension
// Uses custom storage adapter for chrome.storage
import { CONFIG, debugLog } from '../config.production.js';

// Custom storage adapter using chrome.storage.local
const chromeStorageAdapter = {
  getItem: async (key) => {
    try {
      const result = await chrome.storage.local.get([key]);
      const value = result[key] || null;
      debugLog('Storage getItem:', key, value ? '(exists)' : '(null)');
      return value;
    } catch (error) {
      console.error('Error getting item from storage:', error);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await chrome.storage.local.set({ [key]: value });
      debugLog('Storage setItem:', key);
    } catch (error) {
      console.error('Error setting item in storage:', error);
    }
  },
  removeItem: async (key) => {
    try {
      await chrome.storage.local.remove([key]);
      debugLog('Storage removeItem:', key);
    } catch (error) {
      console.error('Error removing item from storage:', error);
    }
  },
};

// Note: For the extension to use Supabase client, you have two options:
// 1. Use CDN import (works in browser but may have limitations):
//    Import from https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm
// 2. Bundle Supabase with your extension (recommended for production)

// Minimal client for managing Supabase auth sessions via chrome.storage
export const supabaseClient = {
  url: CONFIG.SUPABASE_URL,
  anonKey: CONFIG.SUPABASE_ANON_KEY,
  storage: chromeStorageAdapter,

  // Get session from chrome storage
  async getSession() {
    const session = await chromeStorageAdapter.getItem('supabase.auth.token');
    return session ? JSON.parse(session) : null;
  },

  // Set session in chrome storage
  async setSession(session) {
    if (session) {
      await chromeStorageAdapter.setItem('supabase.auth.token', JSON.stringify(session));
    } else {
      await chromeStorageAdapter.removeItem('supabase.auth.token');
    }
  },

  // Clear auth data
  async signOut() {
    await this.setSession(null);
    await chrome.storage.local.remove(['authenticated', 'subscriptionActive']);
    debugLog('Signed out, auth data cleared');
  },
};

debugLog('Supabase extension client initialized');
