// ========================================
// AUTH & SUBSCRIPTION VALIDATION
// ========================================

// Import validation function (will be loaded as module via script tag)
import { validateSubscription } from '../lib/subscription-validator.js';
import { CONFIG, debugLog } from '../config.production.js';

// Auth state
let isAuthenticated = false;
let hasActiveSubscription = false;

// Check auth and subscription on popup open
async function checkAuthAndSubscription() {
  debugLog('Checking auth and subscription status...');

  // OPTIMIZED: Read directly from storage instead of making API call
  // Storage is kept fresh by push notifications and 3-day alarm
  const stored = await chrome.storage.local.get(['subscriptionStatus']);

  // subscriptionStatus contains the full API response object
  const cachedData = stored.subscriptionStatus || {};

  const result = {
    isActive: cachedData.isActive || false,
    reason: cachedData.reason || 'unknown',
    message: cachedData.message || (cachedData.isActive ? 'Subscription active' : 'No active subscription'),
    status: cachedData.status || 'unknown',
    scheduledCancellation: cachedData.scheduledCancellation || false,
    cancellationDate: cachedData.cancellationDate || null,
    trialEnding: cachedData.trialEnding || null,
    wasPreviouslySubscribed: cachedData.wasPreviouslySubscribed || false,
  };

  debugLog('Validation result from storage:', result);

  if (!result.isActive) {
    showAuthOverlay(result.reason, result.message, result.wasPreviouslySubscribed);
  } else {
    hideAuthOverlay();
    isAuthenticated = true;
    hasActiveSubscription = true;

    // Show trial banner if user is in trial period
    if (result.status === 'trialing' && result.trialEnding) {
      showTrialBanner(result.trialEnding);
    }

    // Show scheduled cancellation banner if subscription is ending
    if (result.scheduledCancellation && result.cancellationDate) {
      showCancellationBanner(result.cancellationDate);
    }
  }
}

// Show auth overlay
function showAuthOverlay(reason, message, wasPreviouslySubscribed = false) {
  const overlay = document.getElementById('authOverlay');
  const mainContent = document.getElementById('mainContent');

  if (overlay && mainContent) {
    // Update overlay content for previously subscribed users
    if (wasPreviouslySubscribed) {
      const title = overlay.querySelector('.auth-title');
      const description = overlay.querySelector('.auth-description');
      const button = overlay.querySelector('#getStartedBtn');
      const note = overlay.querySelector('.auth-note');

      if (title) title.textContent = "We're Sorry to See You Go";
      if (description) description.textContent = 'Reactivate your subscription to continue enjoying ColorKit features';
      if (button) {
        button.innerHTML = `
					Resubscribe to Plan
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				`;
      }
      if (note) note.textContent = 'Questions? Contact our support team anytime.';
    } else {
      // Reset to default "Get Started" content for new users
      const title = overlay.querySelector('.auth-title');
      const description = overlay.querySelector('.auth-description');
      const button = overlay.querySelector('#getStartedBtn');
      const note = overlay.querySelector('.auth-note');

      if (title) title.textContent = 'Welcome to ColorKit';
      if (description) description.textContent = 'Transform your Google Calendar with custom colors and time blocks';
      if (button) {
        button.innerHTML = `
					Get Started
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
						<path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				`;
      }
      if (note) note.textContent = 'Already have an account? Sign in on the website and reopen this extension.';
    }

    overlay.classList.remove('hidden');
    mainContent.classList.add('disabled');
    debugLog('Auth overlay shown:', reason, 'Previously subscribed:', wasPreviouslySubscribed);
  }
}

// Hide auth overlay
function hideAuthOverlay() {
  const overlay = document.getElementById('authOverlay');
  const mainContent = document.getElementById('mainContent');

  if (overlay && mainContent) {
    overlay.classList.add('hidden');
    mainContent.classList.remove('disabled');
    debugLog('Auth overlay hidden');
  }
}

// Show trial banner
function showTrialBanner(trialEnding) {
  const daysLeft = Math.ceil((new Date(trialEnding) - new Date()) / (1000 * 60 * 60 * 24));

  const banner = document.createElement('div');
  banner.className = 'trial-banner';
  banner.innerHTML = `
		<span>🎉 Free Trial: ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} remaining</span>
		<a href="${CONFIG.WEB_APP_URL}/dashboard/subscriptions" target="_blank">Manage</a>
	`;

  const mainContent = document.getElementById('mainContent');
  if (mainContent && mainContent.firstChild) {
    mainContent.insertBefore(banner, mainContent.firstChild);
    debugLog('Trial banner shown:', daysLeft, 'days left');
  }
}

// Show scheduled cancellation banner
function showCancellationBanner(cancellationDate) {
  const endDate = new Date(cancellationDate);
  const formattedDate = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const banner = document.createElement('div');
  banner.className = 'cancellation-banner';
  banner.style.cssText = `
		background: #fff3cd;
		border: 1px solid #ffc107;
		border-radius: 8px;
		padding: 12px 16px;
		margin-bottom: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 13px;
		color: #856404;
	`;
  banner.innerHTML = `
		<span>⚠️ Subscription ends ${formattedDate}</span>
		<a href="${CONFIG.WEB_APP_URL}/dashboard/subscriptions" target="_blank" style="color: #856404; text-decoration: underline; font-weight: 500;">Manage</a>
	`;

  const mainContent = document.getElementById('mainContent');
  if (mainContent && mainContent.firstChild) {
    mainContent.insertBefore(banner, mainContent.firstChild);
    debugLog('Cancellation banner shown: ends', formattedDate);
  }
}

// Handle "Get Started" button click
document.addEventListener('DOMContentLoaded', () => {
  const getStartedBtn = document.getElementById('getStartedBtn');
  if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
      // Check if user was previously subscribed - route accordingly
      chrome.storage.local.get(['subscriptionStatus'], (data) => {
        const wasPreviouslySubscribed = data.subscriptionStatus?.wasPreviouslySubscribed || false;

        if (wasPreviouslySubscribed) {
          // Lapsed subscriber - go directly to checkout (skip onboarding + no trial)
          debugLog('Resubscribe clicked, opening checkout page...');
          chrome.runtime.sendMessage({ type: 'OPEN_WEB_APP', path: '/checkout/pri_01k8m1wyqcebmvsvsc7pwvy69j' });
        } else {
          // New user - go to signup/onboarding
          debugLog('Get Started clicked, opening signup page...');
          chrome.runtime.sendMessage({ type: 'OPEN_WEB_APP', path: '/signup' });
        }
      });
    });
  }

  // Handle Account Dropdown Menu
  const accountMenuBtn = document.getElementById('accountMenuBtn');
  const accountDropdownMenu = document.getElementById('accountDropdownMenu');

  if (accountMenuBtn && accountDropdownMenu) {
    // Toggle dropdown on button click
    accountMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = accountDropdownMenu.style.display === 'block';

      if (isOpen) {
        accountDropdownMenu.style.display = 'none';
        accountMenuBtn.classList.remove('active');
      } else {
        accountDropdownMenu.style.display = 'block';
        accountMenuBtn.classList.add('active');
      }

      debugLog('Account menu toggled:', !isOpen ? 'opened' : 'closed');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!accountMenuBtn.contains(e.target) && !accountDropdownMenu.contains(e.target)) {
        accountDropdownMenu.style.display = 'none';
        accountMenuBtn.classList.remove('active');
      }
    });
  }

  // Handle "Manage Account" menu item
  const menuManageAccount = document.getElementById('menuManageAccount');
  if (menuManageAccount) {
    menuManageAccount.addEventListener('click', (e) => {
      e.preventDefault();
      debugLog('Manage Account clicked, opening dashboard...');
      chrome.runtime.sendMessage({ type: 'OPEN_WEB_APP', path: '/dashboard' });
      accountDropdownMenu.style.display = 'none';
      accountMenuBtn.classList.remove('active');
    });
  }

  // Handle "Open Feedback Portal" menu item
  const menuFeedback = document.getElementById('menuFeedback');
  if (menuFeedback) {
    menuFeedback.addEventListener('click', (e) => {
      e.preventDefault();
      debugLog('Feedback Portal clicked, opening in new tab...');
      chrome.tabs.create({ url: 'https://calendarextension.sleekplan.app' });
      accountDropdownMenu.style.display = 'none';
      accountMenuBtn.classList.remove('active');
    });
  }

  // Handle "Report an Issue or Bug" menu item
  const menuBugReport = document.getElementById('menuBugReport');
  if (menuBugReport) {
    menuBugReport.addEventListener('click', (e) => {
      e.preventDefault();
      debugLog('Bug Report clicked, opening in new tab...');
      chrome.tabs.create({ url: 'https://bugs-calendarextension.sleekplan.app/' });
      accountDropdownMenu.style.display = 'none';
      accountMenuBtn.classList.remove('active');
    });
  }

  // Handle "Tutorials" menu item
  const menuTutorials = document.getElementById('menuTutorials');
  if (menuTutorials) {
    menuTutorials.addEventListener('click', (e) => {
      e.preventDefault();
      debugLog('Tutorials clicked, opening in new tab...');
      chrome.tabs.create({ url: 'https://www.calendarextension.com/help' });
      accountDropdownMenu.style.display = 'none';
      accountMenuBtn.classList.remove('active');
    });
  }
});

// Listen for auth updates from background script
chrome.runtime.onMessage.addListener((message) => {
  debugLog('Message received in popup:', message.type);

  if (message.type === 'AUTH_UPDATED' || message.type === 'SUBSCRIPTION_UPDATED') {
    debugLog('Auth/subscription updated, re-reading from storage...');
    // No need to make API call - background.js already updated storage
    // Just re-read the fresh data from storage
    checkAuthAndSubscription();
  }
});

// Run auth check immediately
checkAuthAndSubscription();

// ========================================
// EXISTING POPUP LOGIC
// ========================================

(function () {
  let settings = {};

  function qs(id) {
    return document.getElementById(id);
  }

  // Helper function to convert hex color to rgba with opacity
  function hexToRgba(hex, alpha) {
    if (!hex || hex === '#ffffff') return `rgba(255, 255, 255, ${alpha})`;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(255, 255, 255, ${alpha})`;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Helper function to update preview with color and opacity
  function updatePreview(dayIndex, color, opacity) {
    const preview = qs(`preview${dayIndex}`);
    if (preview && color) {
      const alpha = opacity / 100; // Convert percentage to decimal
      const rgba = hexToRgba(color, alpha);
      preview.style.backgroundColor = rgba;
    }
  }

  // Default colors for weekdays (vibrant base colors that will be applied with opacity)
  const defaultColors = {
    0: '#f44336', // Sunday - red
    1: '#2196f3', // Monday - blue
    2: '#4caf50', // Tuesday - green
    3: '#ff9800', // Wednesday - orange
    4: '#e91e63', // Thursday - pink
    5: '#00bcd4', // Friday - teal
    6: '#9c27b0', // Saturday - purple
  };

  // Vibrant color palette for color picker - organized by spectrum order, no duplicates
  const colorPickerPalette = [
    // Red family
    '#d50000',
    '#ff1744',
    '#f44336',
    '#ff5722',
    // Orange family
    '#ff9800',
    '#ffc107',
    // Yellow family
    '#ffeb3b',
    '#cddc39',
    // Green family
    '#8bc34a',
    '#4caf50',
    '#00e676',
    '#1de9b6',
    '#009688',
    // Cyan family
    '#00e5ff',
    '#00bcd4',
    '#00b0ff',
    // Blue family
    '#03a9f4',
    '#2196f3',
    '#2979ff',
    '#3d5afe',
    // Purple family
    '#651fff',
    '#3f51b5',
    '#673ab7',
    '#aa00ff',
    // Pink/Magenta family
    '#9c27b0',
    '#e91e63',
    '#c2185b',
    '#ad1457',
    '#880e4f',
    '#4a148c',
    // Additional vibrant accents
    '#795548',
    '#607d8b',
    '#9e9e9e',
  ];

  // Pastel color palette - soft, muted colors
  const pastelPalette = [
    // Pink pastels
    '#f8bbd9',
    '#f48fb1',
    '#f06292',
    '#ec407a',
    '#e1bee7',
    // Purple pastels
    '#d1c4e9',
    '#ce93d8',
    '#ba68c8',
    '#ab47bc',
    '#c8e6c9',
    // Green pastels
    '#c8e6c9',
    '#a5d6a7',
    '#81c784',
    '#66bb6a',
    '#dcedc8',
    // Blue pastels
    '#bbdefb',
    '#90caf9',
    '#64b5f6',
    '#42a5f5',
    '#b3e5fc',
    // Cyan pastels
    '#b2ebf2',
    '#80deea',
    '#4dd0e1',
    '#26c6da',
    '#f0f4c3',
    // Yellow pastels
    '#fff9c4',
    '#fff59d',
    '#fff176',
    '#ffee58',
    '#ffe0b2',
    // Orange pastels
    '#ffccbc',
    '#ffab91',
    '#ff8a65',
    '#ff7043',
    '#d7ccc8',
    // Brown/Grey pastels
    '#bcaaa4',
    '#a1887f',
    '#8d6e63',
    '#e0e0e0',
    '#bdbdbd',
  ];

  // Dark/Deep color palette - rich, dark colors
  const darkPalette = [
    // Dark reds
    '#b71c1c',
    '#c62828',
    '#d32f2f',
    '#f44336',
    '#880e4f',
    // Dark purples
    '#4a148c',
    '#6a1b9a',
    '#7b1fa2',
    '#8e24aa',
    '#311b92',
    // Dark blues
    '#0d47a1',
    '#1565c0',
    '#1976d2',
    '#1e88e5',
    '#01579b',
    // Dark teals/greens
    '#004d40',
    '#00695c',
    '#00796b',
    '#00897b',
    '#1b5e20',
    // Dark greens
    '#2e7d32',
    '#388e3c',
    '#43a047',
    '#4caf50',
    '#33691e',
    // Dark oranges/browns
    '#bf360c',
    '#d84315',
    '#e64100',
    '#ff3d00',
    '#3e2723',
    // Dark greys/blues
    '#212121',
    '#424242',
    '#616161',
    '#757575',
    '#263238',
    // Deep accent colors
    '#1a237e',
    '#3949ab',
    '#5e35b1',
    '#7e57c2',
    '#8bc34a',
  ];

  // Default opacity values for weekdays (0-100)
  const defaultOpacity = {
    0: 30, // Sunday
    1: 30, // Monday
    2: 30, // Tuesday
    3: 30, // Wednesday
    4: 30, // Thursday
    5: 30, // Friday
    6: 30, // Saturday
  };

  // Default week start (0=Sunday, 1=Monday, 6=Saturday)
  const defaultWeekStart = 0;

  // Custom colors storage - shared across all color pickers
  let customColors = [];

  // Color Lab state
  let selectedColors = new Set();
  let colorLabEnabled = true; // Enable by default so users can immediately use the palette tabs

  // Color templates
  const colorTemplates = {
    warmSunset: ['#ff6b35', '#f7931e', '#ffd23f', '#ffeb3b', '#ff5722', '#d84315', '#bf360c', '#ff3d00'],
    coolOcean: ['#0277bd', '#0288d1', '#039be5', '#03a9f4', '#29b6f6', '#4fc3f7', '#81d4fa', '#b3e5fc'],
    professional: ['#263238', '#37474f', '#455a64', '#546e7a', '#607d8b', '#78909c', '#90a4ae', '#b0bec5'],
    material: ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4'],
  };

  // Load custom colors from storage
  async function loadCustomColors() {
    try {
      const result = await chrome.storage.sync.get('customDayColors');
      customColors = result.customDayColors || [];
    } catch (error) {
      console.error('Error loading custom colors:', error);
      customColors = [];
    }
  }

  // Save custom colors to storage
  async function saveCustomColors() {
    try {
      await chrome.storage.sync.set({ customDayColors: customColors });
    } catch (error) {
      console.error('Error saving custom colors:', error);
    }
  }

  // Add a color to custom palette
  async function addCustomColor(dayIndex) {
    const colorInput = qs(`color${dayIndex}`);
    if (colorInput && colorInput.value) {
      const color = colorInput.value.toUpperCase();

      // Don't add duplicates
      if (!customColors.includes(color)) {
        customColors.push(color);
        await saveCustomColors();

        // Refresh all custom palettes for day colors
        for (let i = 0; i < 7; i++) {
          createCustomColorPalette(i);
        }

        // Refresh all custom palettes for task colors
        for (let i = 0; i < 8; i++) {
          createTaskCustomColorPalette(i);
        }

        // Refresh time block global custom palette
        createTimeBlockGlobalCustomColorPalette();

        // Refresh all individual time block custom palettes
        document.querySelectorAll('.time-block-color-item').forEach((item) => {
          const blockId = item.dataset.blockId;
          if (blockId) {
            const colorInput = qs(`timeBlockColor-${blockId}`);
            const preview = qs(`timeBlockPreview-${blockId}`);
            const customPalette = qs(`timeBlockCustomPalette-${blockId}`);

            if (customPalette && colorInput && preview) {
              customPalette.innerHTML = '';
              const blockRef = { colorInput, preview };
              customColors.forEach((color) => {
                customPalette.appendChild(createTimeBlockColorSwatch(color, blockRef, customPalette, true));
              });
            }
          }
        });
      }
    }
  }

  // Remove a color from custom palette
  async function removeCustomColor(color) {
    const index = customColors.indexOf(color);
    if (index !== -1) {
      customColors.splice(index, 1);
      await saveCustomColors();

      // Refresh all custom palettes for day colors and Color Lab
      for (let i = 0; i < 7; i++) {
        createCustomColorPalette(i);
      }

      // Refresh all custom palettes for task colors
      for (let i = 0; i < 8; i++) {
        createTaskCustomColorPalette(i);
      }

      // Refresh time block global custom palette
      createTimeBlockGlobalCustomColorPalette();

      // Refresh all individual time block custom palettes
      document.querySelectorAll('.time-block-color-item').forEach((item) => {
        const blockId = item.dataset.blockId;
        if (blockId) {
          const colorInput = qs(`timeBlockColor-${blockId}`);
          const preview = qs(`timeBlockPreview-${blockId}`);
          const customPalette = qs(`timeBlockCustomPalette-${blockId}`);

          if (customPalette && colorInput && preview) {
            customPalette.innerHTML = '';
            const blockRef = { colorInput, preview };
            customColors.forEach((color) => {
              customPalette.appendChild(createTimeBlockColorSwatch(color, blockRef, customPalette, true));
            });
          }
        }
      });

      updateColorLab();
    }
  }

  // Color Lab Functions
  function updateColorLabToggle() {
    const arrow = qs('colorLabArrow');
    const colorLabSettings = qs('colorLabSettings');

    if (colorLabEnabled) {
      arrow.classList.remove('collapsed');
      colorLabSettings.style.display = 'block';
    } else {
      arrow.classList.add('collapsed');
      colorLabSettings.style.display = 'none';
    }
  }

  function updateColorLab() {
    updateQuickAddPalettes();
    updateCustomColorsLab();
    updateColorCount();
  }

  // Quick Add Palette System - Complete Rewrite
  let activeQuickAddPalette = 'vibrant';

  // Initialize Quick Add system
  function initializeQuickAddPalettes() {
    // Set up tab click handlers
    document.querySelectorAll('.palette-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const paletteName = tab.dataset.palette;
        switchToQuickAddPalette(paletteName);
      });
    });

    // Initialize with the currently active palette (preserve current tab state)
    switchToQuickAddPalette(activeQuickAddPalette);
  }

  // Switch to a specific palette
  function switchToQuickAddPalette(paletteName) {
    // Update active palette
    activeQuickAddPalette = paletteName;

    // Update tab visual states
    document.querySelectorAll('.palette-tab').forEach((tab) => {
      tab.classList.remove('active');
      if (tab.dataset.palette === paletteName) {
        tab.classList.add('active');
      }
    });

    // Get the correct color array
    let colors = [];
    switch (paletteName) {
      case 'vibrant':
        colors = colorPickerPalette;
        break;
      case 'pastel':
        colors = pastelPalette;
        break;
      case 'dark':
        colors = darkPalette;
        break;
      default:
        colors = colorPickerPalette;
    }

    // Update the color grid
    updateQuickAddColorGrid(colors);
  }

  // Update the color grid with new colors
  function updateQuickAddColorGrid(colors) {
    const grid = qs('quickAddGrid');
    if (!grid) return;

    // Clear existing colors
    grid.innerHTML = '';

    // Add new colors
    colors.forEach((color, index) => {
      const colorItem = document.createElement('div');
      colorItem.className = 'quick-add-color';
      colorItem.style.backgroundColor = color;
      colorItem.title = `Add ${color} to collection`;
      colorItem.dataset.color = color;

      // Click handler to add color to lab
      colorItem.onclick = () => {
        addColorToLab(color);
        // Visual feedback
        colorItem.classList.add('added');
        setTimeout(() => {
          colorItem.classList.remove('added');
        }, 1500);
      };

      grid.appendChild(colorItem);
    });
  }

  // Legacy function for backward compatibility
  function updateQuickAddPalettes() {
    initializeQuickAddPalettes();
  }

  function updateCustomColorsLab() {
    updateAllColors();
    updateEmptyState();
  }

  function updateAllColors() {
    const grid = qs('allColorsGrid');
    if (!grid) return;

    grid.innerHTML = '';
    customColors.forEach((color) => {
      grid.appendChild(createLabColorSwatch(color));
    });
  }

  function updateEmptyState() {
    const grid = qs('allColorsGrid');
    const emptyState = qs('customColorsEmpty');

    if (!grid || !emptyState) return;

    if (customColors.length === 0) {
      grid.style.display = 'none';
      emptyState.style.display = 'flex';
    } else {
      grid.style.display = 'grid';
      emptyState.style.display = 'none';
    }
  }

  function updateColorCount() {
    const countElement = qs('colorCount');
    if (countElement) {
      countElement.textContent = customColors.length;
    }
  }

  function createLabColorSwatch(color) {
    const swatch = document.createElement('div');
    swatch.className = 'lab-color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch.dataset.color = color;

    // Click to select/deselect
    swatch.onclick = (e) => {
      e.stopPropagation();
      toggleColorSelection(color, swatch);
    };

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'color-remove';
    removeBtn.innerHTML = '×';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeCustomColor(color);
    };
    swatch.appendChild(removeBtn);

    return swatch;
  }

  function toggleColorSelection(color, swatchElement) {
    if (selectedColors.has(color)) {
      selectedColors.delete(color);
      swatchElement.classList.remove('selected');
    } else {
      selectedColors.add(color);
      swatchElement.classList.add('selected');
    }
  }

  async function addColorToLab(color) {
    if (!color) return;

    // Normalize color format
    color = color.toUpperCase();

    // Don't add duplicates
    if (!customColors.includes(color)) {
      customColors.push(color);
      await saveCustomColors();

      // Refresh all custom palettes for day colors and Color Lab
      for (let i = 0; i < 7; i++) {
        createCustomColorPalette(i);
      }

      // Refresh all custom palettes for task colors
      for (let i = 0; i < 8; i++) {
        createTaskCustomColorPalette(i);
      }

      // Refresh time block global custom palette
      createTimeBlockGlobalCustomColorPalette();

      // Refresh all individual time block custom palettes
      document.querySelectorAll('.time-block-color-item').forEach((item) => {
        const blockId = item.dataset.blockId;
        if (blockId) {
          const colorInput = qs(`timeBlockColor-${blockId}`);
          const preview = qs(`timeBlockPreview-${blockId}`);
          const customPalette = qs(`timeBlockCustomPalette-${blockId}`);

          if (customPalette && colorInput && preview) {
            customPalette.innerHTML = '';
            const blockRef = { colorInput, preview };
            customColors.forEach((color) => {
              customPalette.appendChild(createTimeBlockColorSwatch(color, blockRef, customPalette, true));
            });
          }
        }
      });

      updateColorLab();

      // Visual feedback
      showAddColorFeedback();
    }
  }

  function showAddColorFeedback() {
    const btn = qs('addColorBtn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'Added!';
      btn.style.background = '#059669';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
      }, 1000);
    }
  }

  function validateHexColor(hex) {
    const hexRegex = /^#[0-9A-F]{6}$/i;
    return hexRegex.test(hex);
  }

  function setupColorLabEventListeners() {
    // Color Lab expand/collapse
    const header = qs('colorLabHeader');
    if (header) {
      header.onclick = () => {
        colorLabEnabled = !colorLabEnabled;
        updateColorLabToggle();
      };
    }

    // Color picker sync with hex input
    const colorPicker = qs('colorLabPicker');
    const hexInput = qs('colorLabHex');

    if (colorPicker && hexInput) {
      colorPicker.onchange = () => {
        hexInput.value = colorPicker.value.toUpperCase();
      };

      hexInput.oninput = (e) => {
        let value = e.target.value;
        if (!value.startsWith('#')) value = '#' + value;
        if (validateHexColor(value)) {
          colorPicker.value = value;
          hexInput.style.borderColor = '#1a73e8';
        } else {
          hexInput.style.borderColor = '#dc2626';
        }
      };
    }

    // Add color button
    const addColorBtn = qs('addColorBtn');
    if (addColorBtn) {
      addColorBtn.onclick = () => {
        const color = colorPicker ? colorPicker.value : null;
        if (color) {
          addColorToLab(color);
        }
      };
    }

    // Bulk operations
    const selectAllBtn = qs('selectAllColors');
    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        selectedColors.clear();
        document.querySelectorAll('.lab-color-swatch').forEach((swatch) => {
          const color = swatch.dataset.color;
          if (color) {
            selectedColors.add(color);
            swatch.classList.add('selected');
          }
        });
      };
    }

    const clearSelectedBtn = qs('clearSelectedColors');
    if (clearSelectedBtn) {
      clearSelectedBtn.onclick = async () => {
        if (selectedColors.size === 0) return;

        if (confirm(`Remove ${selectedColors.size} selected colors?`)) {
          // Remove selected colors from customColors array
          customColors = customColors.filter((color) => !selectedColors.has(color));
          selectedColors.clear();
          await saveCustomColors();

          // Refresh all palettes for day colors
          for (let i = 0; i < 7; i++) {
            createCustomColorPalette(i);
          }

          // Refresh all palettes for task colors
          for (let i = 0; i < 8; i++) {
            createTaskCustomColorPalette(i);
          }

          // Refresh time block palettes
          createTimeBlockGlobalCustomColorPalette();
          document.querySelectorAll('.time-block-color-item').forEach((item) => {
            const blockId = item.dataset.blockId;
            if (blockId) {
              const customPalette = qs(`timeBlockCustomPalette-${blockId}`);
              if (customPalette) {
                customPalette.innerHTML = '';
                customColors.forEach((color) => {
                  customPalette.appendChild(
                    createTimeBlockColorSwatch(
                      color,
                      {
                        colorInput: qs(`timeBlockColor-${blockId}`),
                        preview: qs(`timeBlockPreview-${blockId}`),
                      },
                      customPalette,
                      true,
                    ),
                  );
                });
              }
            }
          });

          updateColorLab();
        }
      };
    }

    const exportBtn = qs('exportColors');
    if (exportBtn) {
      exportBtn.onclick = () => {
        const colorsToExport = selectedColors.size > 0 ? Array.from(selectedColors) : customColors;
        const hexList = colorsToExport.join(', ');
        navigator.clipboard.writeText(hexList).then(() => {
          exportBtn.textContent = 'Copied!';
          setTimeout(() => {
            exportBtn.textContent = 'Export';
          }, 1500);
        });
      };
    }

    const clearAllBtn = qs('clearAllColors');
    if (clearAllBtn) {
      clearAllBtn.onclick = async () => {
        if (customColors.length === 0) return;

        if (confirm(`Remove all ${customColors.length} custom colors?`)) {
          customColors = [];
          selectedColors.clear();
          await saveCustomColors();

          // Refresh all palettes for day colors
          for (let i = 0; i < 7; i++) {
            createCustomColorPalette(i);
          }

          // Refresh all palettes for task colors
          for (let i = 0; i < 8; i++) {
            createTaskCustomColorPalette(i);
          }

          // Refresh time block palettes
          createTimeBlockGlobalCustomColorPalette();
          document.querySelectorAll('.time-block-color-item').forEach((item) => {
            const blockId = item.dataset.blockId;
            if (blockId) {
              const customPalette = qs(`timeBlockCustomPalette-${blockId}`);
              if (customPalette) {
                customPalette.innerHTML = '';
                customColors.forEach((color) => {
                  customPalette.appendChild(
                    createTimeBlockColorSwatch(
                      color,
                      {
                        colorInput: qs(`timeBlockColor-${blockId}`),
                        preview: qs(`timeBlockPreview-${blockId}`),
                      },
                      customPalette,
                      true,
                    ),
                  );
                });
              }
            }
          });

          updateColorLab();
        }
      };
    }
  }

  async function loadSettings() {
    try {
      // Use the main storage system - this returns the full settings object
      settings = await window.cc3Storage.getSettings();
    } catch (error) {
      console.error('❌ Error loading settings:', error);
      settings = {
        enabled: false,
        weekdayColors: { ...defaultColors },
        weekdayOpacity: { ...defaultOpacity },
        dateColors: {},
        weekStart: defaultWeekStart,
      };
    }
  }

  async function saveSettings() {
    try {
      // Settings are already saved by the storage methods we used
      // Just need to notify content script of changes
      const tabs = await chrome.tabs.query({ url: '*://calendar.google.com/*' });

      for (const tab of tabs) {
        try {
          const message = {
            type: 'settingsChanged',
            feature: 'dayColoring',
            settings: settings, // Send the full settings object as expected by dayColoring feature
          };

          await chrome.tabs.sendMessage(tab.id, message);
        } catch (e) {}
      }
    } catch (error) {
      console.error('❌ Error saving settings:', error);
    }
  }

  function updateToggle() {
    const toggle = qs('enableDayColoring');

    if (settings.enabled) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  function updateTaskFeaturesToggle() {
    const toggle = qs('enableTaskFeatures');

    // Check if either task coloring or task list coloring is enabled
    const isEnabled = settings.taskColoring?.enabled || settings.taskListColoring?.enabled;

    if (isEnabled) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  function updateTaskColoringToggle() {
    // No longer needed - kept for compatibility
  }

  function updateTimeBlockingToggle() {
    const toggle = qs('enableTimeBlocking');

    if (settings.timeBlocking?.enabled) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  function updateTimeBlockingSettings() {
    const globalColor = qs('timeBlockGlobalColor');
    const globalPreview = qs('globalTimeBlockPreview');
    const shadingStyle = qs('timeBlockShadingStyle');

    if (globalColor) {
      globalColor.value = settings.timeBlocking?.globalColor || '#FFEB3B';
    }
    if (globalPreview) {
      globalPreview.style.backgroundColor = settings.timeBlocking?.globalColor || '#FFEB3B';
    }
    if (shadingStyle) {
      shadingStyle.value = settings.timeBlocking?.shadingStyle || 'solid';
    }

    // Create global time block color palettes
    createTimeBlockGlobalColorPalette();
    createTimeBlockGlobalPastelColorPalette();
    createTimeBlockGlobalDarkColorPalette();
    createTimeBlockGlobalCustomColorPalette();

    updateTimeBlockingSchedule();
    updateDateSpecificSchedule();
  }

  // ========================================
  // TASK LIST COLORING FUNCTIONS
  // ========================================

  function updateTaskListColoringToggle() {
    // Initialize task list coloring if enabled
    if (settings.taskListColoring?.enabled) {
      initTaskListColoring();
    }
  }

  async function initTaskListColoring() {
    // Check OAuth status
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_OAUTH_STATUS' });

    const oauthNotGranted = qs('oauthNotGranted');
    const oauthGranted = qs('oauthGranted');

    if (response?.granted) {
      // OAuth granted - show granted state and load lists
      oauthNotGranted.style.display = 'none';
      oauthGranted.style.display = 'block';

      // Update sync status
      updateSyncStatus();

      // Load task lists
      await loadTaskLists();
    } else {
      // OAuth not granted - show grant button
      oauthNotGranted.style.display = 'block';
      oauthGranted.style.display = 'none';
    }
  }

  function updateSyncStatus() {
    const syncStatus = qs('syncStatus');
    const lastSync = settings.taskListColoring?.lastSync;

    if (lastSync) {
      const date = new Date(lastSync);
      const now = new Date();
      const diffMinutes = Math.floor((now - date) / 60000);

      let timeAgo;
      if (diffMinutes < 1) {
        timeAgo = 'Just now';
      } else if (diffMinutes < 60) {
        timeAgo = `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
      } else if (diffMinutes < 1440) {
        const hours = Math.floor(diffMinutes / 60);
        timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        const days = Math.floor(diffMinutes / 1440);
        timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
      }

      syncStatus.textContent = `Last sync: ${timeAgo}`;
    } else {
      syncStatus.textContent = 'Last sync: Never';
    }
  }

  async function loadTaskLists() {
    const taskListsLoading = qs('taskListsLoading');
    const taskListsEmpty = qs('taskListsEmpty');
    const taskListsGrid = qs('taskListsGrid');
    const taskListItems = qs('taskListItems');

    // Show loading state
    taskListsLoading.style.display = 'block';
    taskListsEmpty.style.display = 'none';
    taskListsGrid.style.display = 'none';

    try {
      // Get task lists from storage
      const lists = await chrome.runtime.sendMessage({ type: 'GET_TASK_LISTS_META' });

      if (!lists || lists.length === 0) {
        // Show empty state
        taskListsLoading.style.display = 'none';
        taskListsEmpty.style.display = 'block';
        return;
      }

      // Get saved list colors
      const [listColors, listTextColors] = await Promise.all([
        window.cc3Storage.getTaskListColors(),
        window.cc3Storage.getTaskListTextColors(),
      ]);

      // Clear existing items
      taskListItems.innerHTML = '';

      // Create item for each list
      for (const list of lists) {
        const item = createTaskListItem(list, {
          background: listColors[list.id],
          text: listTextColors[list.id],
        });
        taskListItems.appendChild(item);
      }

      // Show grid
      taskListsLoading.style.display = 'none';
      taskListsGrid.style.display = 'block';
    } catch (error) {
      console.error('[Task List Colors] Error loading lists:', error);
      taskListsLoading.style.display = 'none';
      taskListsEmpty.style.display = 'block';
    }
  }

  // ========================================
  // COMPLETED TASKS STYLING SECTION BUILDER
  // ========================================

  async function createCompletedTasksSection(list, colorConfig = {}) {
    const settings = await window.cc3Storage.getSettings();
    const completedStyling = settings.taskListColoring?.completedStyling?.[list.id] || {};

    const section = document.createElement('div');
    section.className = 'completed-tasks-section';

    // Header with toggle
    const header = document.createElement('div');
    header.className = 'completed-tasks-header';

    const title = document.createElement('h4');
    title.innerHTML = '✓ Completed Tasks Styling';

    const toggleWrapper = document.createElement('div');
    toggleWrapper.className = 'completed-tasks-toggle';

    const toggleLabel = document.createElement('label');
    toggleLabel.textContent = 'Enable';

    const toggle = document.createElement('div');
    toggle.className = 'switch';
    if (completedStyling.enabled) {
      toggle.classList.add('active');
    }

    toggle.onclick = async () => {
      const newEnabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');

      await window.cc3Storage.setCompletedStylingEnabled(list.id, newEnabled);

      // Update controls visibility
      controls.classList.toggle('completed-tasks-disabled', !newEnabled);

      // Trigger repaint
      chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
    };

    toggleWrapper.appendChild(toggleLabel);
    toggleWrapper.appendChild(toggle);

    header.appendChild(title);
    header.appendChild(toggleWrapper);

    // Controls container
    const controls = document.createElement('div');
    controls.className = 'completed-tasks-controls';
    if (!completedStyling.enabled) {
      controls.classList.add('completed-tasks-disabled');
    }

    // Background Color
    const bgColorGroup = document.createElement('div');
    bgColorGroup.className = 'completed-color-group';

    const bgLabel = document.createElement('div');
    bgLabel.className = 'completed-color-label';
    bgLabel.textContent = 'Card Color';

    const bgColorControl = createTaskListColorControl({
      list,
      label: '',
      prefix: 'completedBg',
      currentColor: completedStyling.bgColor || (colorConfig.background || '#cccccc'),
      setColor: async (listId, color) => {
        await window.cc3Storage.setCompletedBgColor(listId, color);
      },
      clearColor: async (listId) => {
        const current = await window.cc3Storage.getSettings();
        const completedStyling = current.taskListColoring?.completedStyling || {};
        const styling = completedStyling[listId] || {};
        delete styling.bgColor;

        // Update the full styling object in storage
        await window.cc3Storage.setSettings({
          taskListColoring: {
            completedStyling: {
              ...completedStyling,
              [listId]: styling
            }
          }
        });
      },
      toastLabel: 'Completed card color',
      messageType: 'TASK_LISTS_UPDATED',
      helperText: 'Background color for completed tasks in this list.',
      onColorChange: () => {},
    });

    bgColorGroup.appendChild(bgLabel);
    bgColorGroup.appendChild(bgColorControl);

    // Text Color
    const textColorGroup = document.createElement('div');
    textColorGroup.className = 'completed-color-group';

    const textLabel = document.createElement('div');
    textLabel.className = 'completed-color-label';
    textLabel.textContent = 'Text Color';

    const textColorControl = createTaskListColorControl({
      list,
      label: '',
      prefix: 'completedText',
      currentColor: completedStyling.textColor || '#666666',
      setColor: async (listId, color) => {
        await window.cc3Storage.setCompletedTextColor(listId, color);
      },
      clearColor: async (listId) => {
        const current = await window.cc3Storage.getSettings();
        const completedStyling = current.taskListColoring?.completedStyling || {};
        const styling = completedStyling[listId] || {};
        delete styling.textColor;

        // Update the full styling object in storage
        await window.cc3Storage.setSettings({
          taskListColoring: {
            completedStyling: {
              ...completedStyling,
              [listId]: styling
            }
          }
        });
      },
      toastLabel: 'Completed text color',
      messageType: 'TASK_LISTS_UPDATED',
      helperText: 'Text color for completed tasks in this list.',
      onColorChange: () => {},
    });

    textColorGroup.appendChild(textLabel);
    textColorGroup.appendChild(textColorControl);

    // Background Opacity Slider
    const bgOpacityGroup = document.createElement('div');
    bgOpacityGroup.className = 'completed-opacity-group';

    const bgOpacityLabel = document.createElement('div');
    bgOpacityLabel.className = 'completed-color-label';
    bgOpacityLabel.textContent = 'Card Opacity';

    const bgOpacityContainer = document.createElement('div');
    bgOpacityContainer.className = 'opacity-slider-container';

    const bgOpacitySlider = document.createElement('input');
    bgOpacitySlider.type = 'range';
    bgOpacitySlider.min = '0';
    bgOpacitySlider.max = '100';
    bgOpacitySlider.value = String(Math.round((completedStyling.bgOpacity || 0.6) * 100));
    bgOpacitySlider.className = 'opacity-slider';

    const bgOpacityValue = document.createElement('span');
    bgOpacityValue.className = 'opacity-value';
    bgOpacityValue.textContent = bgOpacitySlider.value + '%';

    bgOpacitySlider.oninput = async () => {
      bgOpacityValue.textContent = bgOpacitySlider.value + '%';
      const opacity = parseInt(bgOpacitySlider.value, 10) / 100;
      await window.cc3Storage.setCompletedBgOpacity(list.id, opacity);

      // Debounced repaint
      clearTimeout(bgOpacitySlider._repaintTimer);
      bgOpacitySlider._repaintTimer = setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
      }, 500);
    };

    bgOpacityContainer.appendChild(bgOpacitySlider);
    bgOpacityContainer.appendChild(bgOpacityValue);
    bgOpacityGroup.appendChild(bgOpacityLabel);
    bgOpacityGroup.appendChild(bgOpacityContainer);

    // Text Opacity Slider
    const textOpacityGroup = document.createElement('div');
    textOpacityGroup.className = 'completed-opacity-group';

    const textOpacityLabel = document.createElement('div');
    textOpacityLabel.className = 'completed-color-label';
    textOpacityLabel.textContent = 'Text Opacity';

    const textOpacityContainer = document.createElement('div');
    textOpacityContainer.className = 'opacity-slider-container';

    const textOpacitySlider = document.createElement('input');
    textOpacitySlider.type = 'range';
    textOpacitySlider.min = '0';
    textOpacitySlider.max = '100';
    textOpacitySlider.value = String(Math.round((completedStyling.textOpacity || 1) * 100));
    textOpacitySlider.className = 'opacity-slider';

    const textOpacityValue = document.createElement('span');
    textOpacityValue.className = 'opacity-value';
    textOpacityValue.textContent = textOpacitySlider.value + '%';

    textOpacitySlider.oninput = async () => {
      textOpacityValue.textContent = textOpacitySlider.value + '%';
      const opacity = parseInt(textOpacitySlider.value, 10) / 100;
      await window.cc3Storage.setCompletedTextOpacity(list.id, opacity);

      // Debounced repaint
      clearTimeout(textOpacitySlider._repaintTimer);
      textOpacitySlider._repaintTimer = setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'TASK_LISTS_UPDATED' });
      }, 500);
    };

    textOpacityContainer.appendChild(textOpacitySlider);
    textOpacityContainer.appendChild(textOpacityValue);
    textOpacityGroup.appendChild(textOpacityLabel);
    textOpacityGroup.appendChild(textOpacityContainer);

    // Add all controls
    controls.appendChild(bgColorGroup);
    controls.appendChild(textColorGroup);
    controls.appendChild(bgOpacityGroup);
    controls.appendChild(textOpacityGroup);

    // Assemble section
    section.appendChild(header);
    section.appendChild(controls);

    return section;
  }

  function createTaskListItem(list, colorConfig = {}) {
    const item = document.createElement('div');
    item.className = 'task-list-item';
    item.dataset.listId = list.id;

    const card = document.createElement('div');
    card.className = 'task-list-card';

    const header = document.createElement('div');
    header.className = 'task-list-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'task-list-title-group';
    const titleEl = document.createElement('div');
    titleEl.className = 'task-list-title';
    titleEl.textContent = list.title;
    const metaEl = document.createElement('div');
    metaEl.className = 'task-list-meta';
    metaEl.textContent = 'Google Tasks list';
    titleGroup.appendChild(titleEl);
    titleGroup.appendChild(metaEl);

    const swatchRow = document.createElement('div');
    swatchRow.className = 'task-list-card-swatches';

    const createSwatchDisplay = (label) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'task-list-swatch';

      const chip = document.createElement('span');
      chip.className = 'task-list-swatch-chip';

      const textWrap = document.createElement('div');
      textWrap.className = 'task-list-swatch-text';
      const labelEl = document.createElement('span');
      labelEl.className = 'task-list-swatch-label';
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.className = 'task-list-swatch-value';

      textWrap.appendChild(labelEl);
      textWrap.appendChild(valueEl);
      wrapper.appendChild(chip);
      wrapper.appendChild(textWrap);

      return { wrapper, chip, value: valueEl };
    };

    const backgroundSwatch = createSwatchDisplay('Background');
    const textSwatch = createSwatchDisplay('Text color');
    swatchRow.appendChild(backgroundSwatch.wrapper);
    swatchRow.appendChild(textSwatch.wrapper);

    header.appendChild(titleGroup);
    header.appendChild(swatchRow);

    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'task-list-color-stack';

    const updateSwatchDisplay = (target, color, type) => {
      if (color) {
        target.chip.style.backgroundColor = color;
        target.chip.classList.add('has-color');
        target.chip.textContent = '';
        target.chip.style.color = getReadableTextColor(color, 100);
        target.value.textContent = color.toUpperCase();
      } else {
        target.chip.style.backgroundColor = '#f3f4f6';
        target.chip.style.color = '#6b7280';
        target.chip.textContent = type === 'text' ? 'A' : '';
        target.chip.classList.remove('has-color');
        target.value.textContent = 'Auto';
      }
    };

    const backgroundControl = createTaskListColorControl({
      list,
      label: 'List color',
      prefix: 'taskList',
      currentColor: colorConfig.background,
      setColor: (listId, color) => window.cc3Storage.setTaskListDefaultColor(listId, color),
      clearColor: (listId) => window.cc3Storage.clearTaskListDefaultColor(listId),
      toastLabel: 'Color',
      messageType: 'TASK_LISTS_UPDATED',
      helperText: 'Applies to every task chip from this Google Tasks list.',
      onColorChange: (value) => updateSwatchDisplay(backgroundSwatch, value, 'background'),
    });

    const textControl = createTaskListColorControl({
      list,
      label: 'List text color',
      prefix: 'taskListText',
      currentColor: colorConfig.text,
      setColor: (listId, color) => window.cc3Storage.setTaskListTextColor(listId, color),
      clearColor: (listId) => window.cc3Storage.clearTaskListTextColor(listId),
      toastLabel: 'Text color',
      messageType: 'TASK_LISTS_UPDATED',
      helperText: 'Overrides the auto-contrast text color for this list.',
      onColorChange: (value) => updateSwatchDisplay(textSwatch, value, 'text'),
    });

    controlsWrapper.appendChild(backgroundControl);
    controlsWrapper.appendChild(textControl);

    const settingsSection = document.createElement('div');
    settingsSection.className = 'task-list-card-section';
    settingsSection.appendChild(controlsWrapper);

    // Completed tasks section (will be added asynchronously)
    const completedSection = document.createElement('div');
    completedSection.className = 'task-list-card-section';

    card.appendChild(header);
    card.appendChild(settingsSection);
    card.appendChild(completedSection);

    item.appendChild(card);

    updateSwatchDisplay(backgroundSwatch, colorConfig.background, 'background');
    updateSwatchDisplay(textSwatch, colorConfig.text, 'text');

    // Asynchronously load completed tasks section
    createCompletedTasksSection(list, colorConfig).then((section) => {
      completedSection.innerHTML = '';
      completedSection.appendChild(section);
    });

    return item;
  }

  function createTaskListColorControl(config) {
    const {
      list,
      label,
      prefix,
      currentColor,
      setColor,
      clearColor,
      toastLabel,
      messageType,
      helperText,
      onColorChange = () => {},
    } = config;

    const container = document.createElement('div');
    container.className = 'task-list-color-picker';
    container.dataset.colorPrefix = prefix;

    const labelEl = document.createElement('div');
    labelEl.className = 'task-list-color-label';
    labelEl.textContent = label;
    container.appendChild(labelEl);

    const actions = document.createElement('div');
    actions.className = 'task-list-color-actions';
    container.appendChild(actions);

    const preview = document.createElement('div');
    preview.className = 'task-list-color-preview';
    preview.id = `${prefix}Preview-${list.id}`;
    preview.title = 'Click to open color picker';
    if (currentColor) {
      preview.style.backgroundColor = currentColor;
      preview.classList.add('has-color');
    } else {
      // Show "no color" state with pattern
      preview.style.backgroundColor = '#f3f4f6';
      preview.style.backgroundImage = 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,.05) 5px, rgba(0,0,0,.05) 10px)';
    }
    actions.appendChild(preview);

    const colorDetails = document.createElement('div');
    colorDetails.className = 'task-list-color-details';
    colorDetails.id = `${prefix}Details-${list.id}`;
    colorDetails.innerHTML = buildTaskListColorDetails(prefix, list.id, currentColor, helperText);
    actions.appendChild(colorDetails);

    colorDetails.querySelectorAll('.color-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        switchTaskListColorTab(list.id, tabBtn.dataset.tab, prefix);
      });
    });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = `${prefix}Color-${list.id}`;
    colorInput.value = currentColor || '#4285f4';
    colorInput.style.display = 'none';
    actions.appendChild(colorInput);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'task-list-clear-button';
    clearBtn.textContent = 'Clear';
    clearBtn.disabled = !currentColor;
    actions.appendChild(clearBtn);

    const closeColorModal = () => {
      colorDetails.classList.remove('expanded');
      const backdrop = document.getElementById('task-list-color-backdrop');
      if (backdrop) {
        backdrop.classList.remove('active');
      }
    };

    const openColorModal = () => {
      document.querySelectorAll('.task-list-color-details.expanded').forEach((panel) => {
        if (panel !== colorDetails) {
          panel.classList.remove('expanded');
        }
      });

      colorDetails.classList.add('expanded');
      let backdrop = document.getElementById('task-list-color-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'task-list-color-backdrop';
        backdrop.className = 'task-list-color-backdrop';
        document.body.appendChild(backdrop);
      }
      backdrop.onclick = closeColorModal;
      requestAnimationFrame(() => backdrop.classList.add('active'));
    };

    preview.onclick = openColorModal;
    colorDetails.onclick = (e) => e.stopPropagation();

    const broadcastUpdate = (color) => {
      chrome.tabs.query({ url: 'https://calendar.google.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
          // If color is null, just trigger full repaint without color data
          if (color === null) {
            chrome.tabs.sendMessage(tab.id, {
              type: messageType,
            });
          } else {
            chrome.tabs.sendMessage(tab.id, {
              type: messageType,
              listId: list.id,
              color,
            });
          }
        });
      });
    };

    const updateColor = async (newColor, { closeModal = true } = {}) => {
      if (!newColor) return;

      await setColor(list.id, newColor);
      settings = await window.cc3Storage.getSettings();
      await saveSettings();

      preview.style.backgroundColor = newColor;
      preview.style.backgroundImage = 'none'; // Remove pattern if it was there
      preview.classList.add('has-color');
      colorInput.value = newColor;

      const directColorInput = qs(`${prefix}ColorDirect-${list.id}`);
      const hexInput = qs(`${prefix}Hex-${list.id}`);
      if (directColorInput) directColorInput.value = newColor;
      if (hexInput) hexInput.value = newColor.toUpperCase();

      clearBtn.disabled = false;
      showToast(`${toastLabel} set for "${list.title}"`);
      broadcastUpdate(newColor);
      onColorChange(newColor);

      if (closeModal) {
        closeColorModal();
      }
    };

    setTimeout(() => {
      const directColorInput = qs(`${prefix}ColorDirect-${list.id}`);
      const hexInput = qs(`${prefix}Hex-${list.id}`);

      if (directColorInput && hexInput) {
        directColorInput.value = currentColor || '#4285f4';
        hexInput.value = (currentColor || '#4285f4').toUpperCase();

        directColorInput.oninput = () => {
          hexInput.value = directColorInput.value.toUpperCase();
        };
        directColorInput.onchange = () => {
          updateColor(directColorInput.value);
        };

        hexInput.oninput = () => {
          const hex = hexInput.value.trim();
          const normalized = hex.startsWith('#') ? hex : '#' + hex;
          if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
            directColorInput.value = normalized;
            hexInput.style.borderColor = '#1a73e8';
          } else {
            hexInput.style.borderColor = '#dc2626';
          }
        };
        hexInput.onchange = () => {
          const hex = hexInput.value.trim();
          const normalized = hex.startsWith('#') ? hex : '#' + hex;
          if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
            updateColor(normalized);
          }
        };
      }
    }, 50);

    clearBtn.onclick = async () => {
      // Clear the color from storage
      await clearColor(list.id);
      settings = await window.cc3Storage.getSettings();
      await saveSettings();

      // Reset preview to show "no color" state
      preview.style.backgroundColor = '#f3f4f6';
      preview.style.backgroundImage = 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,.05) 5px, rgba(0,0,0,.05) 10px)';
      preview.classList.remove('has-color');
      colorInput.value = '#4285f4'; // Default for color picker

      const directColorInput = qs(`${prefix}ColorDirect-${list.id}`);
      const hexInput = qs(`${prefix}Hex-${list.id}`);
      if (directColorInput) directColorInput.value = '#4285f4';
      if (hexInput) hexInput.value = '#4285F4';

      clearBtn.disabled = true;
      showToast(`${toastLabel} cleared for "${list.title}" - using Google default`);

      // Broadcast null to trigger full repaint (will re-read from storage)
      broadcastUpdate(null);
      onColorChange(null);

      // Reload task lists to update the swatch display
      await loadTaskLists();

      // Close the modal after clearing
      closeColorModal();
    };

    colorInput.onchange = () => {
      updateColor(colorInput.value, { closeModal: false });
    };

    requestAnimationFrame(() => {
      createTaskListColorPalettes({
        listId: list.id,
        prefix,
        colorInput,
        preview,
        updateColor,
      });
    });

    return container;
  }

  function buildTaskListColorDetails(prefix, listId, currentColor, helperText) {
    const helper = helperText
      ? `<div style="font-size: 12px; color: #5f6368; margin-bottom: 10px;">${helperText}</div>`
      : '';

    return `
      <div class="color-picker-tabs">
        <button type="button" class="color-tab active" data-tab="vibrant" data-list="${listId}" data-color-prefix="${prefix}">Vibrant</button>
        <button type="button" class="color-tab" data-tab="pastel" data-list="${listId}" data-color-prefix="${prefix}">Pastel</button>
        <button type="button" class="color-tab" data-tab="dark" data-list="${listId}" data-color-prefix="${prefix}">Dark</button>
        <button type="button" class="color-tab" data-tab="custom" data-list="${listId}" data-color-prefix="${prefix}">Custom</button>
      </div>
      <div class="color-tab-content">
        ${helper}
        <div class="color-picker-container" style="margin-bottom: 8px;">
          <input type="color" id="${prefix}ColorDirect-${listId}" value="${currentColor || '#4285f4'}" style="width: 60%; height: 28px;">
          <input type="text" id="${prefix}Hex-${listId}" value="${(currentColor || '#4285f4').toUpperCase()}" placeholder="#FF0000" maxlength="7" class="hex-input-small" style="width: 35%; height: 24px; margin-left: 4px; font-size: 10px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px; text-transform: uppercase;">
        </div>
        <div class="color-tab-panel active" id="${prefix}-${listId}-vibrant-panel" data-panel="vibrant">
          <div class="color-palette" id="${prefix}Palette-${listId}"></div>
        </div>
        <div class="color-tab-panel" id="${prefix}-${listId}-pastel-panel" data-panel="pastel">
          <div class="color-palette" id="${prefix}PastelPalette-${listId}"></div>
        </div>
        <div class="color-tab-panel" id="${prefix}-${listId}-dark-panel" data-panel="dark">
          <div class="color-palette" id="${prefix}DarkPalette-${listId}"></div>
        </div>
        <div class="color-tab-panel" id="${prefix}-${listId}-custom-panel" data-panel="custom">
          <div class="color-palette" id="${prefix}CustomPalette-${listId}"></div>
        </div>
      </div>
    `;
  }

  function createTaskListColorPalettes(options) {
    const { listId, prefix, colorInput, preview, updateColor } = options;

    if (!colorInput || !preview) {
      setTimeout(() => createTaskListColorPalettes(options), 50);
      return;
    }

    const listRef = { listId, prefix, colorInput, preview, updateColor };

    const vibrantPalette = qs(`${prefix}Palette-${listId}`);
    if (vibrantPalette) {
      vibrantPalette.innerHTML = '';
      colorPickerPalette.forEach((color) => {
        vibrantPalette.appendChild(createTaskListColorSwatch(color, listRef, vibrantPalette));
      });
    }

    const pastelPaletteEl = qs(`${prefix}PastelPalette-${listId}`);
    if (pastelPaletteEl) {
      pastelPaletteEl.innerHTML = '';
      pastelPalette.forEach((color) => {
        pastelPaletteEl.appendChild(createTaskListColorSwatch(color, listRef, pastelPaletteEl));
      });
    }

    const darkPaletteEl = qs(`${prefix}DarkPalette-${listId}`);
    if (darkPaletteEl) {
      darkPaletteEl.innerHTML = '';
      darkPalette.forEach((color) => {
        darkPaletteEl.appendChild(createTaskListColorSwatch(color, listRef, darkPaletteEl));
      });
    }

    const customPalette = qs(`${prefix}CustomPalette-${listId}`);
    if (customPalette) {
      customPalette.innerHTML = '';
      customColors.forEach((color) => {
        customPalette.appendChild(createTaskListColorSwatch(color, listRef, customPalette, true));
      });
    }
  }

  function createTaskListColorSwatch(color, listRef, palette, isCustom = false) {
    const swatch = document.createElement('div');
    swatch.className = isCustom ? 'color-swatch custom-color-swatch' : 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch.dataset.color = color;

    swatch.onclick = async (e) => {
      e.stopPropagation();

      const detailsPanel = document.getElementById(`${listRef.prefix}Details-${listRef.listId}`);
      if (detailsPanel) {
        detailsPanel.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
      }
      swatch.classList.add('selected');

      listRef.colorInput.value = color;
      await listRef.updateColor(color);
    };

    if (isCustom) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'custom-color-remove';
      removeBtn.innerHTML = 'x';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeCustomColor(color);
      };
      swatch.appendChild(removeBtn);
    }

    return swatch;
  }
  function showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #323232;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // Utility function to calculate luminance and determine readable text color
  function getReadableTextColor(hexColor, opacity = 100) {
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Apply opacity to RGB values (blend with white background)
    const alpha = opacity / 100;
    const blendedR = Math.round(r * alpha + 255 * (1 - alpha));
    const blendedG = Math.round(g * alpha + 255 * (1 - alpha));
    const blendedB = Math.round(b * alpha + 255 * (1 - alpha));

    // Calculate luminance using the relative luminance formula
    const luminance = (0.299 * blendedR + 0.587 * blendedG + 0.114 * blendedB) / 255;

    // Return white for dark backgrounds, black for light backgrounds
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  // Utility function to get day color with opacity applied
  function getDayCardColor(dayKey) {
    const dayIndexMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
    const dayIndex = dayIndexMap[dayKey];

    if (!settings || !settings.weekdayColors || !settings.weekdayOpacity) {
      // Fallback to neutral color
      return { backgroundColor: '#e2e8f0', textColor: '#475569' };
    }

    const color = settings.weekdayColors[dayIndex] || '#e2e8f0';
    const opacity = settings.weekdayOpacity[dayIndex] || 30;

    // Convert to rgba for the background
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const alpha = opacity / 100;

    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    const textColor = getReadableTextColor(color, opacity);

    return { backgroundColor, textColor };
  }

  function updateTimeBlockingSchedule() {
    const scheduleContainer = qs('timeBlockSchedule');
    if (!scheduleContainer) return;

    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const dayNames = {
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
      sun: 'Sunday',
    };

    scheduleContainer.innerHTML = '';

    dayKeys.forEach((dayKey) => {
      const daySection = document.createElement('div');
      daySection.style.cssText = `
				margin-bottom: 16px;
			`;

      const header = document.createElement('div');
      header.className = 'time-block-day-header';

      const dayLabel = document.createElement('div');
      dayLabel.textContent = dayNames[dayKey];
      dayLabel.className = 'time-block-day-title-card';

      // Apply day color styling
      const dayColors = getDayCardColor(dayKey);
      dayLabel.style.backgroundColor = dayColors.backgroundColor;
      dayLabel.style.color = dayColors.textColor;

      const addButton = document.createElement('button');
      addButton.textContent = '+ Add Block';
      addButton.className = 'time-block-add-btn';
      addButton.onclick = () => addTimeBlock(dayKey);

      header.appendChild(dayLabel);
      header.appendChild(addButton);

      const blocksContainer = document.createElement('div');
      blocksContainer.id = `timeBlocks-${dayKey}`;

      const dayBlocks = settings.timeBlocking?.weeklySchedule?.[dayKey] || [];
      dayBlocks.forEach((block, index) => {
        blocksContainer.appendChild(createTimeBlockElement(dayKey, block, index));
      });

      daySection.appendChild(header);
      daySection.appendChild(blocksContainer);
      scheduleContainer.appendChild(daySection);
    });
  }

  function createTimeBlockElement(dayKey, block, index) {
    const blockEl = document.createElement('div');
    blockEl.className = 'time-block-item';

    // Custom time pickers for start and end time (removed auto-update)
    const startTimePicker = createTimePicker(block.timeRange[0], () => {
      // No automatic update - require manual save
    });

    const endTimePicker = createTimePicker(block.timeRange[1], () => {
      // No automatic update - require manual save
    });

    // Color picker with new UI
    const blockColorId = `${dayKey}-${index}`;
    const colorContainer = document.createElement('div');
    colorContainer.className = 'time-block-color-item';
    colorContainer.dataset.blockId = blockColorId;

    const colorPreview = document.createElement('div');
    colorPreview.className = 'time-block-color-preview';
    colorPreview.style.backgroundColor = block.color || settings.timeBlocking?.globalColor || '#FFEB3B';
    colorPreview.id = `timeBlockPreview-${blockColorId}`;

    const colorDetails = document.createElement('div');
    colorDetails.className = 'time-block-color-details';
    colorDetails.id = `timeBlockDetails-${blockColorId}`;
    colorDetails.innerHTML = `
			<div class="color-picker-tabs">
				<button class="color-tab active" data-tab="vibrant" data-timeblock="${blockColorId}">Vibrant</button>
				<button class="color-tab" data-tab="pastel" data-timeblock="${blockColorId}">Pastel</button>
				<button class="color-tab" data-tab="dark" data-timeblock="${blockColorId}">Dark</button>
				<button class="color-tab" data-tab="custom" data-timeblock="${blockColorId}">Custom</button>
			</div>
			<div class="color-tab-content">
				<div class="color-picker-container" style="margin-bottom: 8px;">
					<input type="color" id="timeBlockColor-${blockColorId}" value="${block.color || settings.timeBlocking?.globalColor || '#FFEB3B'}" style="width: 60%; height: 28px;">
					<input type="text" id="timeBlockHex-${blockColorId}" value="${(block.color || settings.timeBlocking?.globalColor || '#FFEB3B').toUpperCase()}" placeholder="#FF0000" maxlength="7" class="hex-input-small" style="width: 35%; height: 24px; margin-left: 4px; font-size: 10px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px; text-transform: uppercase;">
					<div class="color-picker-icon" data-timeblock="${blockColorId}" title="Click to open/close color picker">🎨</div>
				</div>
				<div class="color-tab-panel active" id="timeblock-${blockColorId}-vibrant-panel">
					<div class="color-palette" id="timeBlockPalette-${blockColorId}"></div>
				</div>
				<div class="color-tab-panel" id="timeblock-${blockColorId}-pastel-panel">
					<div class="color-palette" id="timeBlockPastelPalette-${blockColorId}"></div>
				</div>
				<div class="color-tab-panel" id="timeblock-${blockColorId}-dark-panel">
					<div class="color-palette" id="timeBlockDarkPalette-${blockColorId}"></div>
				</div>
				<div class="color-tab-panel" id="timeblock-${blockColorId}-custom-panel">
					<div class="color-palette" id="timeBlockCustomPalette-${blockColorId}"></div>
				</div>
			</div>
		`;

    colorContainer.appendChild(colorPreview);
    colorContainer.appendChild(colorDetails);

    // Get the actual color input for existing functionality
    const colorInput = colorContainer.querySelector(`#timeBlockColor-${blockColorId}`);
    const hexInput = colorContainer.querySelector(`#timeBlockHex-${blockColorId}`);

    // Sync color picker and hex input (removed auto-update)
    if (hexInput) {
      // When color picker changes, update hex input
      const syncHexFromColor = () => {
        hexInput.value = colorInput.value.toUpperCase();
      };

      // When hex input changes, update color picker
      const syncColorFromHex = () => {
        const hexValue = hexInput.value.trim();
        // Add # if missing
        const normalizedHex = hexValue.startsWith('#') ? hexValue : '#' + hexValue;
        // Validate hex format
        if (/^#[0-9A-Fa-f]{6}$/.test(normalizedHex)) {
          colorInput.value = normalizedHex;
          hexInput.style.borderColor = '#1a73e8';
          // Removed auto-update call
        } else {
          hexInput.style.borderColor = '#dc2626';
        }
      };

      colorInput.addEventListener('change', syncHexFromColor);
      colorInput.addEventListener('input', syncHexFromColor);
      hexInput.addEventListener('input', syncColorFromHex);
      hexInput.addEventListener('change', syncColorFromHex);
    }

    // Custom label input (removed auto-update)
    const labelInput = createLabelInput(block.label, 'Label (optional)', 50, () => {
      // No automatic update - require manual save
    });

    // Error indicator
    const errorIndicator = document.createElement('div');
    errorIndicator.className = 'cc3-time-error-indicator';
    errorIndicator.style.cssText = `
			display: none;
			width: 20px;
			height: 20px;
			background: rgba(244, 67, 54, 0.2);
			border: 1px solid #f44336;
			color: #f44336;
			border-radius: 50%;
			font-size: 14px;
			font-weight: bold;
			line-height: 18px;
			text-align: center;
			cursor: help;
			margin-left: 4px;
		`;
    errorIndicator.textContent = '!';
    errorIndicator.title = 'End time must be after start time';

    // Save button
    const saveButton = document.createElement('button');
    saveButton.textContent = '✓';
    saveButton.style.cssText = `
			width: 22px;
			height: 22px;
			padding: 0;
			background: linear-gradient(135deg, #4caf50, #45a049);
			color: white;
			border: none;
			border-radius: 4px;
			font-size: 12px;
			font-weight: bold;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			margin-right: 4px;
			box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
			transition: all 0.2s ease;
		`;
    saveButton.title = 'Save changes';

    // Track original values for change detection
    const originalValues = {
      startTime: block.timeRange[0],
      endTime: block.timeRange[1],
      color: block.color || settings.timeBlocking?.globalColor || '#FFEB3B',
      label: block.label || '',
    };

    // Function to disable save button (greyed out)
    const disableSaveButton = () => {
      saveButton.disabled = true;
      saveButton.style.background = 'linear-gradient(135deg, #9e9e9e, #757575)';
      saveButton.style.cursor = 'not-allowed';
      saveButton.style.opacity = '0.5';
      saveButton.title = 'No changes to save';
    };

    // Function to enable save button
    const enableSaveButton = () => {
      saveButton.disabled = false;
      saveButton.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
      saveButton.style.cursor = 'pointer';
      saveButton.style.opacity = '1';
      saveButton.title = 'Save changes';
    };

    // Function to check if there are changes
    const checkForChanges = () => {
      const hasChanges =
        startTimePicker.getValue() !== originalValues.startTime ||
        endTimePicker.getValue() !== originalValues.endTime ||
        colorInput.value.toUpperCase() !== originalValues.color.toUpperCase() ||
        labelInput.getValue() !== originalValues.label;

      if (hasChanges) {
        enableSaveButton();
      } else {
        disableSaveButton();
      }
    };

    // Initially disable save button (no changes yet)
    disableSaveButton();

    // Add change listeners to all inputs
    startTimePicker.addEventListener('change', checkForChanges);
    endTimePicker.addEventListener('change', checkForChanges);
    colorInput.addEventListener('change', checkForChanges);
    colorInput.addEventListener('input', checkForChanges);
    hexInput.addEventListener('change', checkForChanges);
    hexInput.addEventListener('input', checkForChanges);
    labelInput.addEventListener('input', checkForChanges);

    // Add hover effects (only when enabled)
    saveButton.addEventListener('mouseenter', () => {
      if (!saveButton.disabled) {
        saveButton.style.transform = 'translateY(-1px)';
        saveButton.style.boxShadow = '0 3px 6px rgba(76, 175, 80, 0.4)';
      }
    });
    saveButton.addEventListener('mouseleave', () => {
      if (!saveButton.disabled) {
        saveButton.style.transform = 'translateY(0)';
        saveButton.style.boxShadow = '0 2px 4px rgba(76, 175, 80, 0.3)';
      }
    });

    // Remove button
    const removeButton = document.createElement('button');
    removeButton.textContent = '×';
    removeButton.style.cssText = `
			width: 22px;
			height: 22px;
			padding: 0;
			background: linear-gradient(135deg, #f44336, #d32f2f);
			color: white;
			border: none;
			border-radius: 4px;
			font-size: 14px;
			font-weight: bold;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			box-shadow: 0 2px 4px rgba(244, 67, 54, 0.3);
			transition: all 0.2s ease;
		`;
    removeButton.title = 'Remove timeblock';

    // Add hover effects
    removeButton.addEventListener('mouseenter', () => {
      removeButton.style.transform = 'translateY(-1px)';
      removeButton.style.boxShadow = '0 3px 6px rgba(244, 67, 54, 0.4)';
    });
    removeButton.addEventListener('mouseleave', () => {
      removeButton.style.transform = 'translateY(0)';
      removeButton.style.boxShadow = '0 2px 4px rgba(244, 67, 54, 0.3)';
    });

    // Event listeners
    const updateBlock = async () => {
      const startTime = startTimePicker.getValue();
      const endTime = endTimePicker.getValue();

      if (startTime && endTime && startTime < endTime) {
        // Valid time range - hide error indicator
        errorIndicator.style.display = 'none';
        const newBlock = {
          timeRange: [startTime, endTime],
          color: colorInput.value,
          label: labelInput.getValue(),
        };
        await window.cc3Storage.updateTimeBlock(dayKey, index, newBlock);
        settings = await window.cc3Storage.getSettings();
        notifyTimeBlockingChange();

        // Update original values and disable save button after successful save
        originalValues.startTime = startTime;
        originalValues.endTime = endTime;
        originalValues.color = colorInput.value;
        originalValues.label = labelInput.getValue();
        disableSaveButton();
      } else {
        // Invalid time range - show error indicator instead of alert
        errorIndicator.style.display = 'block';
      }
    };

    // Save button click handler
    saveButton.onclick = updateBlock;

    // Removed automatic color updating

    removeButton.onclick = async () => {
      await window.cc3Storage.removeTimeBlock(dayKey, index);
      settings = await window.cc3Storage.getSettings();
      updateTimeBlockingSchedule();
      notifyTimeBlockingChange();
    };

    blockEl.appendChild(startTimePicker);
    blockEl.appendChild(document.createTextNode(' - '));
    blockEl.appendChild(endTimePicker);
    blockEl.appendChild(errorIndicator);
    blockEl.appendChild(colorContainer);
    blockEl.appendChild(labelInput);
    blockEl.appendChild(saveButton);
    blockEl.appendChild(removeButton);

    // Create color palettes for this time block after element is created
    requestAnimationFrame(() => {
      createIndividualTimeBlockPalettes(blockColorId);
    });

    return blockEl;
  }

  async function addTimeBlock(dayKey) {
    // Create time block modal for recurring weekly blocks
    const modal = createRecurringTimeBlockModal(dayKey);
    document.body.appendChild(modal);

    // Focus the modal for keyboard navigation
    modal.focus();

    return new Promise((resolve) => {
      const cleanup = () => {
        if (modal.parentNode) {
          document.body.removeChild(modal);
        }
        resolve(null);
      };

      // Handle time block creation
      const handleBlockCreate = async (timeRange, isAllDay, label, color) => {
        const newBlock = {
          timeRange: isAllDay ? ['00:00', '23:59'] : timeRange,
          color: color || settings.timeBlocking?.globalColor || '#FFEB3B',
          label: label || '',
        };
        await window.cc3Storage.addTimeBlock(dayKey, newBlock);
        settings = await window.cc3Storage.getSettings();
        updateTimeBlockingSchedule();
        notifyTimeBlockingChange();
        cleanup();
        resolve(newBlock);
      };

      // Set up event handlers
      setupRecurringTimeBlockEvents(modal, handleBlockCreate, cleanup);
    });
  }

  function createRecurringTimeBlockModal(dayKey) {
    const dayNames = {
      sun: 'Sunday',
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
    };

    const modal = document.createElement('div');
    modal.className = 'cc3-time-block-modal';
    modal.tabIndex = -1;
    modal.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 10000;
			opacity: 0;
			transition: opacity 0.2s ease;
		`;

    const picker = document.createElement('div');
    picker.className = 'cc3-time-block-picker';
    picker.style.cssText = `
			background: white;
			border-radius: 12px;
			padding: 24px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
			max-width: 400px;
			width: 90%;
			max-height: 90vh;
			overflow-y: auto;
			transform: translateY(-20px);
			transition: transform 0.2s ease;
		`;

    // Header with close button
    const header = document.createElement('div');
    header.style.cssText = `
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 24px;
		`;

    const title = document.createElement('h3');
    title.textContent = `Add Time Block - ${dayNames[dayKey]}`;
    title.style.cssText = `
			margin: 0;
			font-size: 18px;
			font-weight: 600;
			color: #202124;
		`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cc3-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
			background: none;
			border: none;
			font-size: 28px;
			color: #5f6368;
			cursor: pointer;
			padding: 0;
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			border-radius: 50%;
			transition: background-color 0.2s ease;
		`;
    closeBtn.onmouseover = () => (closeBtn.style.backgroundColor = '#f1f3f4');
    closeBtn.onmouseout = () => (closeBtn.style.backgroundColor = 'transparent');

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Time section
    const timeSection = document.createElement('div');
    timeSection.style.cssText = `
			margin-bottom: 24px;
		`;

    const timeTitle = document.createElement('div');
    timeTitle.textContent = 'Time:';
    timeTitle.style.cssText = `
			font-size: 12px;
			font-weight: 600;
			color: #5f6368;
			margin-bottom: 8px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

    // All-day checkbox
    const allDayContainer = document.createElement('div');
    allDayContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 12px;
		`;

    const allDayCheckbox = document.createElement('input');
    allDayCheckbox.type = 'checkbox';
    allDayCheckbox.id = 'cc3-recurring-all-day-checkbox';
    allDayCheckbox.className = 'cc3-all-day-checkbox';
    allDayCheckbox.style.cssText = `
			width: 18px;
			height: 18px;
			cursor: pointer;
		`;

    const allDayLabel = document.createElement('label');
    allDayLabel.setAttribute('for', 'cc3-recurring-all-day-checkbox');
    allDayLabel.textContent = 'All day';
    allDayLabel.style.cssText = `
			font-size: 14px;
			color: #202124;
			cursor: pointer;
		`;

    allDayContainer.appendChild(allDayCheckbox);
    allDayContainer.appendChild(allDayLabel);

    // Time inputs container
    const timeInputsContainer = document.createElement('div');
    timeInputsContainer.className = 'cc3-time-inputs';
    timeInputsContainer.style.cssText = `
			display: flex;
			gap: 12px;
			align-items: center;
		`;

    // Start time input
    const startTimeContainer = document.createElement('div');
    startTimeContainer.style.cssText = `
			flex: 1;
		`;

    const startTimeLabel = document.createElement('label');
    startTimeLabel.textContent = 'Start';
    startTimeLabel.style.cssText = `
			display: block;
			font-size: 11px;
			color: #5f6368;
			margin-bottom: 4px;
			font-weight: 500;
		`;

    const startTimeInput = document.createElement('input');
    startTimeInput.type = 'time';
    startTimeInput.className = 'cc3-start-time';
    startTimeInput.value = '09:00';
    startTimeInput.style.cssText = `
			width: 100%;
			padding: 10px 12px;
			border: 2px solid #dadce0;
			border-radius: 8px;
			font-size: 14px;
			color: #202124;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    startTimeInput.onfocus = () => (startTimeInput.style.borderColor = '#1a73e8');
    startTimeInput.onblur = () => (startTimeInput.style.borderColor = '#dadce0');

    startTimeContainer.appendChild(startTimeLabel);
    startTimeContainer.appendChild(startTimeInput);

    // End time input
    const endTimeContainer = document.createElement('div');
    endTimeContainer.style.cssText = `
			flex: 1;
		`;

    const endTimeLabel = document.createElement('label');
    endTimeLabel.textContent = 'End';
    endTimeLabel.style.cssText = `
			display: block;
			font-size: 11px;
			color: #5f6368;
			margin-bottom: 4px;
			font-weight: 500;
		`;

    const endTimeInput = document.createElement('input');
    endTimeInput.type = 'time';
    endTimeInput.className = 'cc3-end-time';
    endTimeInput.value = '17:00';
    endTimeInput.style.cssText = `
			width: 100%;
			padding: 10px 12px;
			border: 2px solid #dadce0;
			border-radius: 8px;
			font-size: 14px;
			color: #202124;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    endTimeInput.onfocus = () => (endTimeInput.style.borderColor = '#1a73e8');
    endTimeInput.onblur = () => (endTimeInput.style.borderColor = '#dadce0');

    endTimeContainer.appendChild(endTimeLabel);
    endTimeContainer.appendChild(endTimeInput);

    timeInputsContainer.appendChild(startTimeContainer);
    timeInputsContainer.appendChild(endTimeContainer);

    timeSection.appendChild(timeTitle);
    timeSection.appendChild(allDayContainer);
    timeSection.appendChild(timeInputsContainer);

    // Handle all-day checkbox toggle
    allDayCheckbox.onchange = () => {
      const isAllDay = allDayCheckbox.checked;
      startTimeInput.disabled = isAllDay;
      endTimeInput.disabled = isAllDay;
      timeInputsContainer.style.opacity = isAllDay ? '0.5' : '1';
      timeInputsContainer.style.pointerEvents = isAllDay ? 'none' : 'auto';
    };

    // Label section
    const labelSection = document.createElement('div');
    labelSection.style.cssText = `
			margin-bottom: 24px;
		`;

    const labelTitle = document.createElement('div');
    labelTitle.textContent = 'Label (optional):';
    labelTitle.style.cssText = `
			font-size: 12px;
			font-weight: 600;
			color: #5f6368;
			margin-bottom: 8px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cc3-label-input';
    labelInput.placeholder = 'e.g., Focus Time, Meeting, Break';
    labelInput.style.cssText = `
			width: 100%;
			padding: 12px 16px;
			border: 2px solid #dadce0;
			border-radius: 8px;
			font-size: 14px;
			color: #202124;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    labelInput.onfocus = () => (labelInput.style.borderColor = '#1a73e8');
    labelInput.onblur = () => (labelInput.style.borderColor = '#dadce0');

    labelSection.appendChild(labelTitle);
    labelSection.appendChild(labelInput);

    // Color picker section
    const defaultColor = settings.timeBlocking?.globalColor || '#FFEB3B';
    const colorSection = createTimeBlockColorPicker('recurring', defaultColor);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = `
			display: flex;
			gap: 12px;
			justify-content: flex-end;
		`;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'cc3-cancel-btn';
    cancelBtn.style.cssText = `
			background: none;
			border: 1px solid #dadce0;
			border-radius: 6px;
			padding: 10px 20px;
			font-size: 14px;
			color: #5f6368;
			cursor: pointer;
			transition: all 0.2s ease;
		`;
    cancelBtn.onmouseover = () => {
      cancelBtn.style.backgroundColor = '#f8f9fa';
      cancelBtn.style.borderColor = '#5f6368';
    };
    cancelBtn.onmouseout = () => {
      cancelBtn.style.backgroundColor = 'transparent';
      cancelBtn.style.borderColor = '#dadce0';
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Add Time Block';
    confirmBtn.className = 'cc3-confirm-btn';
    confirmBtn.style.cssText = `
			background: #1a73e8;
			border: none;
			border-radius: 6px;
			padding: 10px 20px;
			font-size: 14px;
			color: white;
			cursor: pointer;
			font-weight: 500;
			transition: background-color 0.2s ease;
		`;
    confirmBtn.onmouseover = () => (confirmBtn.style.backgroundColor = '#1557b0');
    confirmBtn.onmouseout = () => (confirmBtn.style.backgroundColor = '#1a73e8');

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    // Assemble the picker
    picker.appendChild(header);
    picker.appendChild(timeSection);
    picker.appendChild(labelSection);
    picker.appendChild(colorSection);
    picker.appendChild(actions);
    modal.appendChild(picker);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      modal.style.opacity = '1';
      picker.style.transform = 'translateY(0)';
    });

    return modal;
  }

  function setupRecurringTimeBlockEvents(modal, onBlockCreate, onCancel) {
    const closeBtn = modal.querySelector('.cc3-close-btn');
    const cancelBtn = modal.querySelector('.cc3-cancel-btn');
    const confirmBtn = modal.querySelector('.cc3-confirm-btn');
    const startTimeInput = modal.querySelector('.cc3-start-time');
    const endTimeInput = modal.querySelector('.cc3-end-time');
    const allDayCheckbox = modal.querySelector('.cc3-all-day-checkbox');
    const labelInput = modal.querySelector('.cc3-label-input');
    const colorInput = modal.querySelector('.cc3-color-input');

    // Helper to get values
    const getValues = () => {
      const isAllDay = allDayCheckbox.checked;
      const timeRange = [startTimeInput.value || '09:00', endTimeInput.value || '17:00'];
      const label = labelInput.value.trim();
      const color = colorInput.value;
      return { timeRange, isAllDay, label, color };
    };

    // Close handlers
    const handleClose = () => onCancel();
    closeBtn.onclick = handleClose;
    cancelBtn.onclick = handleClose;

    // Confirm button handler
    confirmBtn.onclick = () => {
      const { timeRange, isAllDay, label, color } = getValues();
      onBlockCreate(timeRange, isAllDay, label, color);
    };

    // Click outside to close
    modal.onclick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    // Keyboard navigation
    modal.onkeydown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter') {
        const { timeRange, isAllDay, label, color } = getValues();
        onBlockCreate(timeRange, isAllDay, label, color);
      }
    };

    // Focus the start time input initially
    setTimeout(() => startTimeInput.focus(), 100);
  }

  // Custom Time Picker Helper Function
  function createTimePicker(initialTime, onChangeCallback) {
    const [initialHours, initialMinutes] = initialTime.split(':');

    const timePickerContainer = document.createElement('div');
    timePickerContainer.className = 'custom-time-picker';

    const hoursInput = document.createElement('input');
    hoursInput.type = 'text';
    hoursInput.className = 'time-input hours';
    hoursInput.value = initialHours;
    hoursInput.maxLength = 2;
    hoursInput.placeholder = '00';

    const separator = document.createElement('span');
    separator.className = 'time-separator';
    separator.textContent = ':';

    const minutesInput = document.createElement('input');
    minutesInput.type = 'text';
    minutesInput.className = 'time-input minutes';
    minutesInput.value = initialMinutes;
    minutesInput.maxLength = 2;
    minutesInput.placeholder = '00';

    // Input validation and formatting
    const validateHours = (value) => {
      const num = parseInt(value) || 0;
      return Math.min(23, Math.max(0, num)).toString().padStart(2, '0');
    };

    const validateMinutes = (value) => {
      const num = parseInt(value) || 0;
      return Math.min(59, Math.max(0, num)).toString().padStart(2, '0');
    };

    const updateTime = () => {
      const hours = validateHours(hoursInput.value);
      const minutes = validateMinutes(minutesInput.value);
      const timeString = `${hours}:${minutes}`;

      // Update display values
      hoursInput.value = hours;
      minutesInput.value = minutes;

      if (onChangeCallback) {
        onChangeCallback(timeString);
      }
    };

    // Event listeners for validation and navigation
    hoursInput.addEventListener('input', (e) => {
      // Allow only numbers
      e.target.value = e.target.value.replace(/[^0-9]/g, '');

      // Auto-advance to minutes when 2 digits are entered
      if (e.target.value.length === 2) {
        minutesInput.focus();
        minutesInput.select();
      }
    });

    minutesInput.addEventListener('input', (e) => {
      // Allow only numbers
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    hoursInput.addEventListener('blur', updateTime);
    minutesInput.addEventListener('blur', updateTime);

    // Enter key handling
    hoursInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        minutesInput.focus();
        minutesInput.select();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentHours = parseInt(hoursInput.value) || 0;
        hoursInput.value = Math.min(23, currentHours + 1)
          .toString()
          .padStart(2, '0');
        updateTime();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentHours = parseInt(hoursInput.value) || 0;
        hoursInput.value = Math.max(0, currentHours - 1)
          .toString()
          .padStart(2, '0');
        updateTime();
      }
    });

    minutesInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        updateTime();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentMinutes = parseInt(minutesInput.value) || 0;
        minutesInput.value = Math.min(59, currentMinutes + 1)
          .toString()
          .padStart(2, '0');
        updateTime();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentMinutes = parseInt(minutesInput.value) || 0;
        minutesInput.value = Math.max(0, currentMinutes - 1)
          .toString()
          .padStart(2, '0');
        updateTime();
      }
    });

    timePickerContainer.appendChild(hoursInput);
    timePickerContainer.appendChild(separator);
    timePickerContainer.appendChild(minutesInput);

    // Add a getValue method for easy access
    timePickerContainer.getValue = () => {
      const hours = validateHours(hoursInput.value);
      const minutes = validateMinutes(minutesInput.value);
      return `${hours}:${minutes}`;
    };

    // Add a setValue method
    timePickerContainer.setValue = (timeString) => {
      const [hours, minutes] = timeString.split(':');
      hoursInput.value = hours.padStart(2, '0');
      minutesInput.value = minutes.padStart(2, '0');
    };

    return timePickerContainer;
  }

  // Custom Label Input Helper Function
  function createLabelInput(initialValue, placeholder = 'Label (optional)', maxLength = 50, onChangeCallback) {
    const labelInputContainer = document.createElement('div');
    labelInputContainer.className = 'custom-label-input';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'label-input';
    labelInput.value = initialValue || '';
    labelInput.placeholder = placeholder;
    labelInput.maxLength = maxLength;

    // Store the initial value to compare for changes
    let lastValue = initialValue || '';

    // Only update when user finishes typing (on blur or Enter)
    const handleUpdate = () => {
      const currentValue = labelInput.value.trim();
      // Only call callback if value actually changed
      if (currentValue !== lastValue && onChangeCallback) {
        lastValue = currentValue;
        onChangeCallback(currentValue);
      }
    };

    // Event listeners - NO MORE real-time updates during typing
    labelInput.addEventListener('blur', handleUpdate);

    // Prevent event bubbling to avoid focus issues
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.stopPropagation(); // Only stop propagation for Enter key
        handleUpdate();
        labelInput.blur(); // Remove focus after Enter
      }
      // Allow other keys (including Ctrl+V for paste) to propagate normally
    });

    labelInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    labelInputContainer.appendChild(labelInput);

    // Add getValue method for easy access
    labelInputContainer.getValue = () => {
      return labelInput.value.trim();
    };

    // Add setValue method
    labelInputContainer.setValue = (value) => {
      labelInput.value = value || '';
    };

    // Add focus method
    labelInputContainer.focus = () => {
      labelInput.focus();
    };

    return labelInputContainer;
  }

  // Date-specific timeblock functions
  function updateDateSpecificSchedule() {
    const scheduleContainer = qs('dateSpecificSchedule');
    if (!scheduleContainer) return;

    const dateSpecificBlocks = settings.timeBlocking?.dateSpecificSchedule || {};
    scheduleContainer.innerHTML = '';

    // Sort dates chronologically
    const sortedDates = Object.keys(dateSpecificBlocks).sort();

    sortedDates.forEach((dateKey) => {
      const dateSection = document.createElement('div');
      dateSection.style.cssText = `
				margin-bottom: 8px;
				padding: 6px;
				border: 1px solid #e8eaed;
				border-radius: 6px;
				background: white;
			`;

      const header = document.createElement('div');
      header.style.cssText = `
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 4px;
			`;

      const dateLabel = document.createElement('h4');
      const dateObj = new Date(dateKey + 'T12:00:00'); // Add time to avoid timezone issues
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      dateLabel.textContent = formattedDate;
      dateLabel.style.cssText = `
				margin: 0;
				font-size: 13px;
				color: #333;
				font-weight: 600;
			`;

      const removeAllButton = document.createElement('button');
      removeAllButton.textContent = 'Remove All';
      removeAllButton.style.cssText = `
				padding: 4px 8px;
				background: #f44336;
				color: white;
				border: none;
				border-radius: 4px;
				font-size: 10px;
				cursor: pointer;
			`;
      removeAllButton.onclick = () => removeDateBlocks(dateKey);

      header.appendChild(dateLabel);
      header.appendChild(removeAllButton);

      const blocksContainer = document.createElement('div');
      blocksContainer.id = `dateBlocks-${dateKey}`;

      const dayBlocks = dateSpecificBlocks[dateKey] || [];
      dayBlocks.forEach((block, index) => {
        blocksContainer.appendChild(createDateSpecificBlockElement(dateKey, block, index));
      });

      dateSection.appendChild(header);
      dateSection.appendChild(blocksContainer);
      scheduleContainer.appendChild(dateSection);
    });
  }

  function createDateSpecificBlockElement(dateKey, block, index) {
    const blockEl = document.createElement('div');
    blockEl.style.cssText = `
			display: flex;
			gap: 6px;
			align-items: center;
			margin-bottom: 3px;
			padding: 4px;
			background: #f0f8ff;
			border-radius: 3px;
			border-left: 3px solid #34a853;
		`;

    // Date indicator (read-only)
    const dateIndicator = document.createElement('span');
    dateIndicator.textContent = '📅';
    dateIndicator.style.cssText = `
			font-size: 12px;
			margin-right: 4px;
		`;

    // Custom time pickers for start and end time (removed auto-update)
    const startTimePicker = createTimePicker(block.timeRange[0], () => {
      // No automatic update - require manual save
    });

    const endTimePicker = createTimePicker(block.timeRange[1], () => {
      // No automatic update - require manual save
    });

    // Color picker with new UI
    const blockColorId = `date-${dateKey}-${index}`;
    const colorContainer = document.createElement('div');
    colorContainer.className = 'time-block-color-item';
    colorContainer.dataset.blockId = blockColorId;

    const colorPreview = document.createElement('div');
    colorPreview.className = 'time-block-color-preview';
    colorPreview.style.backgroundColor = block.color || settings.timeBlocking?.globalColor || '#FFEB3B';
    colorPreview.id = `timeBlockPreview-${blockColorId}`;

    const colorDetails = document.createElement('div');
    colorDetails.className = 'time-block-color-details';
    colorDetails.id = `timeBlockDetails-${blockColorId}`;
    colorDetails.innerHTML = `
			<div class="color-picker-tabs">
				<button class="color-tab active" data-tab="vibrant" data-timeblock="${blockColorId}">Vibrant</button>
				<button class="color-tab" data-tab="pastel" data-timeblock="${blockColorId}">Pastel</button>
				<button class="color-tab" data-tab="dark" data-timeblock="${blockColorId}">Dark</button>
				<button class="color-tab" data-tab="custom" data-timeblock="${blockColorId}">Custom</button>
			</div>
			<div class="color-tab-content">
				<div class="color-picker-container" style="margin-bottom: 8px;">
					<input type="color" id="timeBlockColor-${blockColorId}" value="${block.color || settings.timeBlocking?.globalColor || '#FFEB3B'}" style="width: 60%; height: 28px;">
					<input type="text" id="timeBlockHex-${blockColorId}" value="${(block.color || settings.timeBlocking?.globalColor || '#FFEB3B').toUpperCase()}" placeholder="#FF0000" maxlength="7" class="hex-input-small" style="width: 35%; height: 24px; margin-left: 4px; font-size: 10px; padding: 2px 4px; border: 1px solid #ccc; border-radius: 3px; text-transform: uppercase;">
					<div class="color-picker-icon" data-timeblock="${blockColorId}" title="Click to open/close color picker">🎨</div>
				</div>
				<div class="color-tab-panel active" id="timeblock-${blockColorId}-vibrant-panel">
					<div class="color-palette" id="timeBlockPalette-${blockColorId}"></div>
				</div>
				<div class="color-tab-panel" id="timeblock-${blockColorId}-pastel-panel">
					<div class="color-palette" id="timeBlockPastelPalette-${blockColorId}"></div>
				</div>
				<div class="color-tab-panel" id="timeblock-${blockColorId}-dark-panel">
					<div class="color-palette" id="timeBlockDarkPalette-${blockColorId}"></div>
				</div>
				<div class="color-tab-panel" id="timeblock-${blockColorId}-custom-panel">
					<div class="color-palette" id="timeBlockCustomPalette-${blockColorId}"></div>
				</div>
			</div>
		`;

    colorContainer.appendChild(colorPreview);
    colorContainer.appendChild(colorDetails);

    // Get the actual color input for existing functionality
    const colorInput = colorContainer.querySelector(`#timeBlockColor-${blockColorId}`);
    const hexInput = colorContainer.querySelector(`#timeBlockHex-${blockColorId}`);

    // Sync color picker and hex input
    if (hexInput) {
      // When color picker changes, update hex input
      const syncHexFromColor = () => {
        hexInput.value = colorInput.value.toUpperCase();
      };

      // When hex input changes, update color picker
      const syncColorFromHex = () => {
        const hexValue = hexInput.value.trim();
        // Add # if missing
        const normalizedHex = hexValue.startsWith('#') ? hexValue : '#' + hexValue;
        // Validate hex format
        if (/^#[0-9A-Fa-f]{6}$/.test(normalizedHex)) {
          colorInput.value = normalizedHex;
          hexInput.style.borderColor = '#1a73e8';
          // Removed auto-update call
        } else {
          hexInput.style.borderColor = '#dc2626';
        }
      };

      colorInput.addEventListener('change', syncHexFromColor);
      colorInput.addEventListener('input', syncHexFromColor);
      hexInput.addEventListener('input', syncColorFromHex);
      hexInput.addEventListener('change', syncColorFromHex);
    }

    // Custom label input (removed auto-update)
    const labelInput = createLabelInput(block.label, 'Label (optional)', 50, () => {
      // No automatic update - require manual save
    });

    // Error indicator
    const errorIndicator = document.createElement('div');
    errorIndicator.className = 'cc3-time-error-indicator';
    errorIndicator.style.cssText = `
			display: none;
			width: 20px;
			height: 20px;
			background: rgba(244, 67, 54, 0.2);
			border: 1px solid #f44336;
			color: #f44336;
			border-radius: 50%;
			font-size: 14px;
			font-weight: bold;
			line-height: 18px;
			text-align: center;
			cursor: help;
			margin-left: 4px;
		`;
    errorIndicator.textContent = '!';
    errorIndicator.title = 'End time must be after start time';

    // Save button
    const saveButton = document.createElement('button');
    saveButton.textContent = '✓';
    saveButton.style.cssText = `
			width: 22px;
			height: 22px;
			padding: 0;
			background: linear-gradient(135deg, #4caf50, #45a049);
			color: white;
			border: none;
			border-radius: 4px;
			font-size: 12px;
			font-weight: bold;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			margin-right: 4px;
			box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
			transition: all 0.2s ease;
		`;
    saveButton.title = 'Save changes';

    // Track original values for change detection
    const originalValues = {
      startTime: block.timeRange[0],
      endTime: block.timeRange[1],
      color: block.color || settings.timeBlocking?.globalColor || '#FFEB3B',
      label: block.label || '',
    };

    // Function to disable save button (greyed out)
    const disableSaveButton = () => {
      saveButton.disabled = true;
      saveButton.style.background = 'linear-gradient(135deg, #9e9e9e, #757575)';
      saveButton.style.cursor = 'not-allowed';
      saveButton.style.opacity = '0.5';
      saveButton.title = 'No changes to save';
    };

    // Function to enable save button
    const enableSaveButton = () => {
      saveButton.disabled = false;
      saveButton.style.background = 'linear-gradient(135deg, #4caf50, #45a049)';
      saveButton.style.cursor = 'pointer';
      saveButton.style.opacity = '1';
      saveButton.title = 'Save changes';
    };

    // Function to check if there are changes
    const checkForChanges = () => {
      const hasChanges =
        startTimePicker.getValue() !== originalValues.startTime ||
        endTimePicker.getValue() !== originalValues.endTime ||
        colorInput.value.toUpperCase() !== originalValues.color.toUpperCase() ||
        labelInput.getValue() !== originalValues.label;

      if (hasChanges) {
        enableSaveButton();
      } else {
        disableSaveButton();
      }
    };

    // Initially disable save button (no changes yet)
    disableSaveButton();

    // Add change listeners to all inputs
    startTimePicker.addEventListener('change', checkForChanges);
    endTimePicker.addEventListener('change', checkForChanges);
    colorInput.addEventListener('change', checkForChanges);
    colorInput.addEventListener('input', checkForChanges);
    hexInput.addEventListener('change', checkForChanges);
    hexInput.addEventListener('input', checkForChanges);
    labelInput.addEventListener('input', checkForChanges);

    // Add hover effects (only when enabled)
    saveButton.addEventListener('mouseenter', () => {
      if (!saveButton.disabled) {
        saveButton.style.transform = 'translateY(-1px)';
        saveButton.style.boxShadow = '0 3px 6px rgba(76, 175, 80, 0.4)';
      }
    });
    saveButton.addEventListener('mouseleave', () => {
      if (!saveButton.disabled) {
        saveButton.style.transform = 'translateY(0)';
        saveButton.style.boxShadow = '0 2px 4px rgba(76, 175, 80, 0.3)';
      }
    });

    // Remove button
    const removeButton = document.createElement('button');
    removeButton.textContent = '×';
    removeButton.style.cssText = `
			width: 22px;
			height: 22px;
			padding: 0;
			background: linear-gradient(135deg, #f44336, #d32f2f);
			color: white;
			border: none;
			border-radius: 4px;
			font-size: 14px;
			font-weight: bold;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			box-shadow: 0 2px 4px rgba(244, 67, 54, 0.3);
			transition: all 0.2s ease;
		`;
    removeButton.title = 'Remove timeblock';

    // Add hover effects
    removeButton.addEventListener('mouseenter', () => {
      removeButton.style.transform = 'translateY(-1px)';
      removeButton.style.boxShadow = '0 3px 6px rgba(244, 67, 54, 0.4)';
    });
    removeButton.addEventListener('mouseleave', () => {
      removeButton.style.transform = 'translateY(0)';
      removeButton.style.boxShadow = '0 2px 4px rgba(244, 67, 54, 0.3)';
    });

    // Event listeners
    const updateBlock = async () => {
      const startTime = startTimePicker.getValue();
      const endTime = endTimePicker.getValue();

      if (startTime && endTime && startTime < endTime) {
        // Valid time range - hide error indicator
        errorIndicator.style.display = 'none';
        const newBlock = {
          timeRange: [startTime, endTime],
          color: colorInput.value,
          label: labelInput.getValue(),
        };
        await window.cc3Storage.updateDateSpecificTimeBlock(dateKey, index, newBlock);
        settings = await window.cc3Storage.getSettings();
        notifyTimeBlockingChange();

        // Update original values and disable save button after successful save
        originalValues.startTime = startTime;
        originalValues.endTime = endTime;
        originalValues.color = colorInput.value;
        originalValues.label = labelInput.getValue();
        disableSaveButton();
      } else {
        // Invalid time range - show error indicator instead of alert
        errorIndicator.style.display = 'block';
      }
    };

    // Save button click handler
    saveButton.onclick = updateBlock;

    // Removed automatic color updating

    removeButton.onclick = async () => {
      await window.cc3Storage.removeDateSpecificTimeBlock(dateKey, index);
      settings = await window.cc3Storage.getSettings();
      updateDateSpecificSchedule();
      notifyTimeBlockingChange();
    };

    blockEl.appendChild(dateIndicator);
    blockEl.appendChild(startTimePicker);
    blockEl.appendChild(document.createTextNode(' - '));
    blockEl.appendChild(endTimePicker);
    blockEl.appendChild(errorIndicator);
    blockEl.appendChild(colorContainer);
    blockEl.appendChild(labelInput);
    blockEl.appendChild(saveButton);
    blockEl.appendChild(removeButton);

    // Create color palettes for this time block after element is created
    requestAnimationFrame(() => {
      createIndividualTimeBlockPalettes(blockColorId);
    });

    return blockEl;
  }

  async function removeDateBlocks(dateKey) {
    if (confirm(`Remove all blocks for ${dateKey}?`)) {
      await window.cc3Storage.clearDateSpecificBlocks(dateKey);
      settings = await window.cc3Storage.getSettings();
      updateDateSpecificSchedule();
      notifyTimeBlockingChange();
    }
  }

  async function removeAllDateSpecificBlocks() {
    // Get current settings to see if there are any date-specific blocks
    const currentSettings = await window.cc3Storage.getSettings();
    const dateSpecificSchedule = currentSettings.timeBlocking?.dateSpecificSchedule || {};

    // Check if there are any blocks to remove
    const dateKeys = Object.keys(dateSpecificSchedule);
    if (dateKeys.length === 0) {
      alert('No date-specific blocks to remove.');
      return;
    }

    // Show confirmation with count of blocks
    const totalBlocks = dateKeys.reduce((sum, dateKey) => sum + (dateSpecificSchedule[dateKey]?.length || 0), 0);
    const confirmMessage = `⚠️ This will remove ALL date-specific blocks from ALL dates.\n\nThis includes:\n• ${totalBlocks} time blocks across ${dateKeys.length} dates\n\nThis action cannot be undone. Are you sure you want to continue?`;

    if (confirm(confirmMessage)) {
      // Clear all date-specific blocks by setting an empty schedule
      await window.cc3Storage.setSettings({
        timeBlocking: {
          ...currentSettings.timeBlocking,
          dateSpecificSchedule: {},
        },
      });

      // Update the UI and notify of changes
      settings = await window.cc3Storage.getSettings();
      updateDateSpecificSchedule();
      notifyTimeBlockingChange();
    }
  }

  async function addDateSpecificBlock() {
    // Create improved date picker modal with time selection
    const modal = createDatePickerModal();
    document.body.appendChild(modal);

    // Focus the modal for keyboard navigation
    modal.focus();

    return new Promise((resolve) => {
      const cleanup = () => {
        if (modal.parentNode) {
          document.body.removeChild(modal);
        }
        resolve(null);
      };

      // Handle date selection with time range
      const handleDateSelect = async (selectedDate, timeRange, isAllDay, label, color) => {
        if (selectedDate) {
          const newBlock = {
            timeRange: isAllDay ? ['00:00', '23:59'] : timeRange,
            color: color || settings.timeBlocking?.globalColor || '#FFEB3B',
            label: label || '',
          };
          await window.cc3Storage.addDateSpecificTimeBlock(selectedDate, newBlock);
          settings = await window.cc3Storage.getSettings();
          updateDateSpecificSchedule();
          notifyTimeBlockingChange();
        }
        cleanup();
        resolve(selectedDate);
      };

      // Set up event handlers
      setupDatePickerEvents(modal, handleDateSelect, cleanup);
    });
  }

  function createDatePickerModal() {
    const modal = document.createElement('div');
    modal.className = 'cc3-date-picker-modal';
    modal.tabIndex = -1;
    modal.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.4);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 10000;
			backdrop-filter: blur(2px);
			opacity: 0;
			transition: opacity 0.2s ease;
		`;

    const picker = document.createElement('div');
    picker.className = 'cc3-date-picker';
    picker.style.cssText = `
			background: white;
			border-radius: 12px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
			padding: 24px;
			min-width: 320px;
			max-width: 400px;
			max-height: 90vh;
			overflow-y: auto;
			transform: translateY(20px);
			transition: transform 0.2s ease;
		`;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 20px;
			padding-bottom: 16px;
			border-bottom: 1px solid #e8eaed;
		`;

    const title = document.createElement('h3');
    title.textContent = 'Select Date for Time Block';
    title.style.cssText = `
			margin: 0;
			font-size: 16px;
			font-weight: 600;
			color: #202124;
		`;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.className = 'cc3-close-btn';
    closeBtn.style.cssText = `
			background: none;
			border: none;
			font-size: 24px;
			color: #5f6368;
			cursor: pointer;
			padding: 4px;
			border-radius: 4px;
			width: 32px;
			height: 32px;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background-color 0.2s ease;
		`;
    closeBtn.onmouseover = () => (closeBtn.style.backgroundColor = '#f1f3f4');
    closeBtn.onmouseout = () => (closeBtn.style.backgroundColor = 'transparent');

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Quick presets
    const presets = document.createElement('div');
    presets.style.cssText = `
			margin-bottom: 20px;
		`;

    const presetsTitle = document.createElement('div');
    presetsTitle.textContent = 'Quick Select:';
    presetsTitle.style.cssText = `
			font-size: 12px;
			font-weight: 600;
			color: #5f6368;
			margin-bottom: 8px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

    const presetsContainer = document.createElement('div');
    presetsContainer.style.cssText = `
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		`;

    // Create preset buttons
    const today = new Date();
    const presetOptions = [
      { label: 'Today', date: new Date() },
      { label: 'Tomorrow', date: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
      { label: 'Next Week', date: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000) },
    ];

    presetOptions.forEach((preset) => {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.className = 'cc3-preset-btn';
      btn.dataset.date = formatDateForInput(preset.date);
      btn.style.cssText = `
				background: #f8f9fa;
				border: 1px solid #dadce0;
				border-radius: 6px;
				padding: 8px 12px;
				font-size: 12px;
				color: #202124;
				cursor: pointer;
				transition: all 0.2s ease;
			`;
      btn.onmouseover = () => {
        btn.style.backgroundColor = '#e8f0fe';
        btn.style.borderColor = '#1a73e8';
        btn.style.color = '#1a73e8';
      };
      btn.onmouseout = () => {
        btn.style.backgroundColor = '#f8f9fa';
        btn.style.borderColor = '#dadce0';
        btn.style.color = '#202124';
      };
      presetsContainer.appendChild(btn);
    });

    presets.appendChild(presetsTitle);
    presets.appendChild(presetsContainer);

    // Custom date picker
    const customSection = document.createElement('div');
    customSection.style.cssText = `
			margin-bottom: 24px;
		`;

    const customTitle = document.createElement('div');
    customTitle.textContent = 'Or choose a specific date:';
    customTitle.style.cssText = `
			font-size: 12px;
			font-weight: 600;
			color: #5f6368;
			margin-bottom: 8px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'cc3-date-input';
    dateInput.value = formatDateForInput(today);
    dateInput.style.cssText = `
			width: 100%;
			padding: 12px 16px;
			border: 2px solid #dadce0;
			border-radius: 8px;
			font-size: 14px;
			color: #202124;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    dateInput.onfocus = () => (dateInput.style.borderColor = '#1a73e8');
    dateInput.onblur = () => (dateInput.style.borderColor = '#dadce0');

    customSection.appendChild(customTitle);
    customSection.appendChild(dateInput);

    // Time selection section
    const timeSection = document.createElement('div');
    timeSection.style.cssText = `
			margin-bottom: 24px;
		`;

    const timeTitle = document.createElement('div');
    timeTitle.textContent = 'Time:';
    timeTitle.style.cssText = `
			font-size: 12px;
			font-weight: 600;
			color: #5f6368;
			margin-bottom: 8px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

    // All-day checkbox
    const allDayContainer = document.createElement('div');
    allDayContainer.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 12px;
		`;

    const allDayCheckbox = document.createElement('input');
    allDayCheckbox.type = 'checkbox';
    allDayCheckbox.id = 'cc3-all-day-checkbox';
    allDayCheckbox.className = 'cc3-all-day-checkbox';
    allDayCheckbox.style.cssText = `
			width: 18px;
			height: 18px;
			cursor: pointer;
		`;

    const allDayLabel = document.createElement('label');
    allDayLabel.setAttribute('for', 'cc3-all-day-checkbox');
    allDayLabel.textContent = 'All day';
    allDayLabel.style.cssText = `
			font-size: 14px;
			color: #202124;
			cursor: pointer;
		`;

    allDayContainer.appendChild(allDayCheckbox);
    allDayContainer.appendChild(allDayLabel);

    // Time inputs container
    const timeInputsContainer = document.createElement('div');
    timeInputsContainer.className = 'cc3-time-inputs';
    timeInputsContainer.style.cssText = `
			display: flex;
			gap: 12px;
			align-items: center;
		`;

    // Start time input
    const startTimeContainer = document.createElement('div');
    startTimeContainer.style.cssText = `
			flex: 1;
		`;

    const startTimeLabel = document.createElement('label');
    startTimeLabel.textContent = 'Start';
    startTimeLabel.style.cssText = `
			display: block;
			font-size: 11px;
			color: #5f6368;
			margin-bottom: 4px;
			font-weight: 500;
		`;

    const startTimeInput = document.createElement('input');
    startTimeInput.type = 'time';
    startTimeInput.className = 'cc3-start-time';
    startTimeInput.value = '09:00';
    startTimeInput.style.cssText = `
			width: 100%;
			padding: 10px 12px;
			border: 2px solid #dadce0;
			border-radius: 8px;
			font-size: 14px;
			color: #202124;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    startTimeInput.onfocus = () => (startTimeInput.style.borderColor = '#1a73e8');
    startTimeInput.onblur = () => (startTimeInput.style.borderColor = '#dadce0');

    startTimeContainer.appendChild(startTimeLabel);
    startTimeContainer.appendChild(startTimeInput);

    // End time input
    const endTimeContainer = document.createElement('div');
    endTimeContainer.style.cssText = `
			flex: 1;
		`;

    const endTimeLabel = document.createElement('label');
    endTimeLabel.textContent = 'End';
    endTimeLabel.style.cssText = `
			display: block;
			font-size: 11px;
			color: #5f6368;
			margin-bottom: 4px;
			font-weight: 500;
		`;

    const endTimeInput = document.createElement('input');
    endTimeInput.type = 'time';
    endTimeInput.className = 'cc3-end-time';
    endTimeInput.value = '17:00';
    endTimeInput.style.cssText = `
			width: 100%;
			padding: 10px 12px;
			border: 2px solid #dadce0;
			border-radius: 8px;
			font-size: 14px;
			color: #202124;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    endTimeInput.onfocus = () => (endTimeInput.style.borderColor = '#1a73e8');
    endTimeInput.onblur = () => (endTimeInput.style.borderColor = '#dadce0');

    endTimeContainer.appendChild(endTimeLabel);
    endTimeContainer.appendChild(endTimeInput);

    timeInputsContainer.appendChild(startTimeContainer);
    timeInputsContainer.appendChild(endTimeContainer);

    timeSection.appendChild(timeTitle);
    timeSection.appendChild(allDayContainer);
    timeSection.appendChild(timeInputsContainer);

    // Handle all-day checkbox toggle
    allDayCheckbox.onchange = () => {
      const isAllDay = allDayCheckbox.checked;
      startTimeInput.disabled = isAllDay;
      endTimeInput.disabled = isAllDay;
      timeInputsContainer.style.opacity = isAllDay ? '0.5' : '1';
      timeInputsContainer.style.pointerEvents = isAllDay ? 'none' : 'auto';
    };

    // Label section
    const labelSection = document.createElement('div');
    labelSection.style.cssText = `
			margin-bottom: 24px;
		`;

    const labelTitle = document.createElement('div');
    labelTitle.textContent = 'Label (optional):';
    labelTitle.style.cssText = `
			font-size: 12px;
			font-weight: 600;
			color: #5f6368;
			margin-bottom: 8px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cc3-label-input';
    labelInput.placeholder = 'e.g., Focus Time, Meeting, Break';
    labelInput.style.cssText = `
			width: 100%;
			padding: 12px 16px;
			border: 2px solid #dadce0;
			border-radius: 8px;
			font-size: 14px;
			color: #202124;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    labelInput.onfocus = () => (labelInput.style.borderColor = '#1a73e8');
    labelInput.onblur = () => (labelInput.style.borderColor = '#dadce0');

    labelSection.appendChild(labelTitle);
    labelSection.appendChild(labelInput);

    // Color picker section
    const defaultColor = settings.timeBlocking?.globalColor || '#FFEB3B';
    const colorSection = createTimeBlockColorPicker('datespecific', defaultColor);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = `
			display: flex;
			gap: 12px;
			justify-content: flex-end;
		`;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'cc3-cancel-btn';
    cancelBtn.style.cssText = `
			background: none;
			border: 1px solid #dadce0;
			border-radius: 6px;
			padding: 10px 20px;
			font-size: 14px;
			color: #5f6368;
			cursor: pointer;
			transition: all 0.2s ease;
		`;
    cancelBtn.onmouseover = () => {
      cancelBtn.style.backgroundColor = '#f8f9fa';
      cancelBtn.style.borderColor = '#5f6368';
    };
    cancelBtn.onmouseout = () => {
      cancelBtn.style.backgroundColor = 'transparent';
      cancelBtn.style.borderColor = '#dadce0';
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Add Time Block';
    confirmBtn.className = 'cc3-confirm-btn';
    confirmBtn.style.cssText = `
			background: #1a73e8;
			border: none;
			border-radius: 6px;
			padding: 10px 20px;
			font-size: 14px;
			color: white;
			cursor: pointer;
			font-weight: 500;
			transition: background-color 0.2s ease;
		`;
    confirmBtn.onmouseover = () => (confirmBtn.style.backgroundColor = '#1557b0');
    confirmBtn.onmouseout = () => (confirmBtn.style.backgroundColor = '#1a73e8');

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    // Assemble the picker
    picker.appendChild(header);
    picker.appendChild(presets);
    picker.appendChild(customSection);
    picker.appendChild(timeSection);
    picker.appendChild(labelSection);
    picker.appendChild(colorSection);
    picker.appendChild(actions);
    modal.appendChild(picker);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      modal.style.opacity = '1';
      picker.style.transform = 'translateY(0)';
    });

    return modal;
  }

  function setupDatePickerEvents(modal, onDateSelect, onCancel) {
    const closeBtn = modal.querySelector('.cc3-close-btn');
    const cancelBtn = modal.querySelector('.cc3-cancel-btn');
    const confirmBtn = modal.querySelector('.cc3-confirm-btn');
    const dateInput = modal.querySelector('.cc3-date-input');
    const presetBtns = modal.querySelectorAll('.cc3-preset-btn');
    const startTimeInput = modal.querySelector('.cc3-start-time');
    const endTimeInput = modal.querySelector('.cc3-end-time');
    const allDayCheckbox = modal.querySelector('.cc3-all-day-checkbox');
    const labelInput = modal.querySelector('.cc3-label-input');
    const colorInput = modal.querySelector('.cc3-color-input');

    // Helper to get time values
    const getTimeValues = () => {
      const isAllDay = allDayCheckbox.checked;
      const timeRange = [startTimeInput.value || '09:00', endTimeInput.value || '17:00'];
      const label = labelInput.value.trim();
      const color = colorInput.value;
      return { timeRange, isAllDay, label, color };
    };

    // Close handlers
    const handleClose = () => onCancel();
    closeBtn.onclick = handleClose;
    cancelBtn.onclick = handleClose;

    // Preset button handlers - just update date input, don't save yet
    presetBtns.forEach((btn) => {
      btn.onclick = () => {
        dateInput.value = btn.dataset.date;
      };
    });

    // Confirm button handler
    confirmBtn.onclick = () => {
      if (dateInput.value) {
        const { timeRange, isAllDay, label, color } = getTimeValues();
        onDateSelect(dateInput.value, timeRange, isAllDay, label, color);
      }
    };

    // Click outside to close
    modal.onclick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    // Keyboard navigation
    modal.onkeydown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter') {
        if (dateInput.value) {
          const { timeRange, isAllDay, label, color } = getTimeValues();
          onDateSelect(dateInput.value, timeRange, isAllDay, label, color);
        }
      }
    };

    // Focus the date input initially
    setTimeout(() => dateInput.focus(), 100);
  }

  function formatDateForInput(date) {
    return (
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    );
  }

  // Create color picker section for time block modals
  function createTimeBlockColorPicker(modalId, defaultColor) {
    const colorSection = document.createElement('div');
    colorSection.style.cssText = `
			margin-bottom: 20px;
		`;

    const colorTitle = document.createElement('div');
    colorTitle.textContent = 'Color:';
    colorTitle.style.cssText = `
			font-size: 12px;
			font-weight: 600;
			color: #5f6368;
			margin-bottom: 6px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		`;

    // Color preview and inputs container
    const colorInputContainer = document.createElement('div');
    colorInputContainer.style.cssText = `
			display: flex;
			gap: 6px;
			align-items: center;
			margin-bottom: 8px;
		`;

    // Color preview box
    const colorPreview = document.createElement('div');
    colorPreview.className = 'cc3-color-preview';
    colorPreview.style.cssText = `
			width: 28px;
			height: 28px;
			border-radius: 6px;
			background-color: ${defaultColor};
			border: 2px solid #dadce0;
			cursor: pointer;
			transition: all 0.2s ease;
			flex-shrink: 0;
		`;

    // Color input (hidden)
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'cc3-color-input';
    colorInput.value = defaultColor;
    colorInput.style.cssText = `
			width: 0;
			height: 0;
			opacity: 0;
			position: absolute;
		`;

    // Hex input
    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'cc3-hex-input';
    hexInput.value = defaultColor.toUpperCase();
    hexInput.placeholder = '#000000';
    hexInput.maxLength = 7;
    hexInput.style.cssText = `
			flex: 1;
			padding: 6px 10px;
			border: 2px solid #dadce0;
			border-radius: 6px;
			font-size: 12px;
			color: #202124;
			font-family: 'Courier New', monospace;
			text-transform: uppercase;
			transition: border-color 0.2s ease;
			box-sizing: border-box;
		`;
    hexInput.onfocus = () => (hexInput.style.borderColor = '#1a73e8');
    hexInput.onblur = () => (hexInput.style.borderColor = '#dadce0');

    // Color preview click opens color input
    colorPreview.onclick = () => colorInput.click();

    // Sync color input with preview and hex
    colorInput.oninput = () => {
      const color = colorInput.value;
      colorPreview.style.backgroundColor = color;
      hexInput.value = color.toUpperCase();
    };

    // Sync hex input with preview and color input
    hexInput.oninput = () => {
      const hex = hexInput.value;
      if (/^#[0-9A-F]{6}$/i.test(hex)) {
        colorInput.value = hex;
        colorPreview.style.backgroundColor = hex;
      }
    };

    colorInputContainer.appendChild(colorPreview);
    colorInputContainer.appendChild(colorInput);
    colorInputContainer.appendChild(hexInput);

    // Palette tabs
    const paletteTabs = document.createElement('div');
    paletteTabs.style.cssText = `
			display: flex;
			gap: 6px;
			margin-bottom: 12px;
			margin-top: 8px;
			border-bottom: 1px solid #dadce0;
			padding-bottom: 8px;
		`;

    const tabs = [
      { id: 'vibrant', label: 'Vibrant' },
      { id: 'pastel', label: 'Pastel' },
      { id: 'dark', label: 'Dark' },
      { id: 'custom', label: 'Custom' },
    ];

    tabs.forEach((tab, index) => {
      const tabBtn = document.createElement('button');
      tabBtn.textContent = tab.label;
      tabBtn.className = `cc3-palette-tab ${index === 0 ? 'active' : ''}`;
      tabBtn.dataset.tab = tab.id;
      tabBtn.style.cssText = `
				background: ${index === 0 ? '#e8f0fe' : 'transparent'};
				border: none;
				padding: 5px 10px;
				font-size: 11px;
				color: ${index === 0 ? '#1a73e8' : '#5f6368'};
				cursor: pointer;
				border-radius: 4px;
				font-weight: ${index === 0 ? '600' : '500'};
				transition: all 0.2s ease;
			`;
      tabBtn.onclick = () => {
        // Update tab states
        paletteTabs.querySelectorAll('.cc3-palette-tab').forEach((btn) => {
          btn.style.backgroundColor = 'transparent';
          btn.style.color = '#5f6368';
          btn.style.fontWeight = '500';
          btn.classList.remove('active');
        });
        tabBtn.style.backgroundColor = '#e8f0fe';
        tabBtn.style.color = '#1a73e8';
        tabBtn.style.fontWeight = '600';
        tabBtn.classList.add('active');

        // Update panel visibility
        paletteContainer.querySelectorAll('.cc3-palette-panel').forEach((panel) => {
          panel.style.display = 'none';
        });
        paletteContainer.querySelector(`[data-palette="${tab.id}"]`).style.display = 'grid';
      };
      paletteTabs.appendChild(tabBtn);
    });

    // Palette container
    const paletteContainer = document.createElement('div');
    paletteContainer.className = 'cc3-palette-container';
    paletteContainer.style.cssText = `
			width: 100%;
		`;

    // Create palette panels
    const createPalette = (colors, paletteId) => {
      const panel = document.createElement('div');
      panel.className = 'cc3-palette-panel';
      panel.dataset.palette = paletteId;
      panel.style.cssText = `
				display: ${paletteId === 'vibrant' ? 'grid' : 'none'};
				grid-template-columns: repeat(10, 1fr);
				gap: 10px;
				padding: 8px 0;
			`;

      colors.forEach((color) => {
        const swatch = document.createElement('div');
        swatch.className = 'cc3-color-swatch';
        swatch.style.cssText = `
					width: 100%;
					height: 0;
					padding-bottom: 100%;
					border-radius: 4px;
					background-color: ${color};
					cursor: pointer;
					border: 2px solid transparent;
					transition: all 0.2s ease;
					position: relative;
				`;
        swatch.onmouseover = () => {
          swatch.style.transform = 'scale(1.15)';
          swatch.style.borderColor = '#1a73e8';
        };
        swatch.onmouseout = () => {
          swatch.style.transform = 'scale(1)';
          swatch.style.borderColor = 'transparent';
        };
        swatch.onclick = () => {
          colorInput.value = color;
          colorPreview.style.backgroundColor = color;
          hexInput.value = color.toUpperCase();
        };
        panel.appendChild(swatch);
      });

      return panel;
    };

    // Add palettes
    paletteContainer.appendChild(createPalette(colorPickerPalette, 'vibrant'));
    paletteContainer.appendChild(createPalette(pastelPalette, 'pastel'));
    paletteContainer.appendChild(createPalette(darkPalette, 'dark'));
    paletteContainer.appendChild(createPalette(customColors, 'custom'));

    // Assemble color section
    colorSection.appendChild(colorTitle);
    colorSection.appendChild(colorInputContainer);
    colorSection.appendChild(paletteTabs);
    colorSection.appendChild(paletteContainer);

    return colorSection;
  }

  // Function to notify content script of time blocking changes
  async function notifyTimeBlockingChange() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://calendar.google.com/*' });
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'timeBlockingChanged',
            settings: settings.timeBlocking || {},
          });
        } catch (e) {
          // Tab might not be ready or extension not loaded
        }
      }
    } catch (error) {
      console.error('Error notifying time blocking change:', error);
    }
  }

  // Function to notify content script of time blocking color changes (real-time)
  async function notifyTimeBlockingColorChange() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://calendar.google.com/*' });
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'timeBlockingColorChanged',
            settings: settings.timeBlocking || {},
          });
        } catch (e) {
          // Tab might not be ready or extension not loaded
        }
      }
    } catch (error) {
      console.error('Error notifying time blocking color change:', error);
    }
  }

  function updateInlineColorsGrid() {
    // Initialize task color previews with current settings
    const inlineColors =
      settings.taskColoring?.inlineColors || window.cc3Storage.defaultSettings.taskColoring.inlineColors;

    inlineColors.forEach((color, index) => {
      // Update preview color
      const preview = qs(`taskPreview${index}`);
      if (preview) {
        preview.style.backgroundColor = color;
      }

      // Update color input value
      const colorInput = qs(`taskColor${index}`);
      if (colorInput) {
        colorInput.value = color;
      }
    });

    // Create all color palettes for each task color
    for (let i = 0; i < 8; i++) {
      createTaskColorPalette(i);
      createTaskPastelColorPalette(i);
      createTaskDarkColorPalette(i);
      createTaskCustomColorPalette(i);
    }
  }

  // Task color palette creation functions
  function createTaskColorPalette(taskIndex) {
    const palette = qs(`taskPalette${taskIndex}`);
    if (!palette) return;

    palette.innerHTML = '';
    colorPickerPalette.forEach((color) => {
      palette.appendChild(createTaskColorSwatch(color, taskIndex, palette));
    });
  }

  function createTaskPastelColorPalette(taskIndex) {
    const palette = qs(`taskPastelPalette${taskIndex}`);
    if (!palette) return;

    palette.innerHTML = '';
    pastelPalette.forEach((color) => {
      palette.appendChild(createTaskColorSwatch(color, taskIndex, palette));
    });
  }

  function createTaskDarkColorPalette(taskIndex) {
    const palette = qs(`taskDarkPalette${taskIndex}`);
    if (!palette) return;

    palette.innerHTML = '';
    darkPalette.forEach((color) => {
      palette.appendChild(createTaskColorSwatch(color, taskIndex, palette));
    });
  }

  function createTaskCustomColorPalette(taskIndex) {
    const palette = qs(`taskCustomPalette${taskIndex}`);
    if (!palette) return;

    palette.innerHTML = '';
    customColors.forEach((color) => {
      palette.appendChild(createTaskColorSwatch(color, taskIndex, palette, true));
    });
  }

  // Create task color swatch with click handler
  function createTaskColorSwatch(color, taskIndex, palette, isCustom = false) {
    const swatch = document.createElement('div');
    swatch.className = isCustom ? 'color-swatch custom-color-swatch' : 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = color;

    swatch.onclick = () => {
      // Remove selected class from all swatches in this task's palettes
      document
        .querySelectorAll(`#taskDetails${taskIndex} .color-swatch`)
        .forEach((s) => s.classList.remove('selected'));
      // Add selected class to clicked swatch
      swatch.classList.add('selected');
      // Update the color input and save
      const colorInput = qs(`taskColor${taskIndex}`);
      if (colorInput) {
        colorInput.value = color;
        // Update preview
        const preview = qs(`taskPreview${taskIndex}`);
        if (preview) {
          preview.style.backgroundColor = color;
        }
        // Save the change
        saveTaskColorChange(taskIndex, color);
      }
    };

    // Add remove button for custom colors
    if (isCustom) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'custom-color-remove';
      removeBtn.innerHTML = '×';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeCustomColor(color);
      };
      swatch.appendChild(removeBtn);
    }

    return swatch;
  }

  // Save task color change
  async function saveTaskColorChange(taskIndex, color) {
    try {
      await window.cc3Storage.updateTaskInlineColor(taskIndex, color);
      settings = await window.cc3Storage.getSettings();

      // Notify content script of the change
      const tabs = await chrome.tabs.query({ url: '*://calendar.google.com/*' });
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'settingsChanged',
            feature: 'taskColoring',
            settings: settings.taskColoring,
          });
        } catch (e) {
          // Tab might not be ready or extension not loaded
        }
      }
    } catch (error) {
      console.error('Error saving task color:', error);
    }
  }

  // Handle task color tab switching
  function switchTaskColorTab(taskIndex, tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll(`[data-task="${taskIndex}"][data-tab]`);
    tabs.forEach((tab) => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      }
    });

    // Update tab panels
    const panels = [
      `task-vibrant-panel-${taskIndex}`,
      `task-pastel-panel-${taskIndex}`,
      `task-dark-panel-${taskIndex}`,
      `task-custom-panel-${taskIndex}`,
    ];
    panels.forEach((panelId) => {
      const panel = qs(panelId);
      if (panel) {
        panel.classList.remove('active');
        if (panelId === `task-${tabName}-panel-${taskIndex}`) {
          panel.classList.add('active');
        }
      }
    });
  }

  // Time block color picker functions
  function createTimeBlockGlobalColorPalette() {
    const palette = qs('globalTimeBlockPalette');
    if (!palette) return;

    palette.innerHTML = '';
    colorPickerPalette.forEach((color) => {
      palette.appendChild(createTimeBlockColorSwatch(color, 'global', palette));
    });
  }

  function createTimeBlockGlobalPastelColorPalette() {
    const palette = qs('globalTimeBlockPastelPalette');
    if (!palette) return;

    palette.innerHTML = '';
    pastelPalette.forEach((color) => {
      palette.appendChild(createTimeBlockColorSwatch(color, 'global', palette));
    });
  }

  function createTimeBlockGlobalDarkColorPalette() {
    const palette = qs('globalTimeBlockDarkPalette');
    if (!palette) return;

    palette.innerHTML = '';
    darkPalette.forEach((color) => {
      palette.appendChild(createTimeBlockColorSwatch(color, 'global', palette));
    });
  }

  function createTimeBlockGlobalCustomColorPalette() {
    const palette = qs('globalTimeBlockCustomPalette');
    if (!palette) return;

    palette.innerHTML = '';
    customColors.forEach((color) => {
      palette.appendChild(createTimeBlockColorSwatch(color, 'global', palette, true));
    });
  }

  // Create time block color swatch with click handler
  function createTimeBlockColorSwatch(color, blockId, palette, isCustom = false) {
    const swatch = document.createElement('div');
    swatch.className = isCustom ? 'color-swatch custom-color-swatch' : 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = color;
    swatch.dataset.color = color;
    swatch.dataset.blockId = typeof blockId === 'string' ? blockId : 'individual';

    swatch.onclick = (e) => {
      e.stopPropagation();

      if (blockId === 'global') {
        // Remove selected class from all swatches in global palettes
        document
          .querySelectorAll('#globalTimeBlockDetails .color-swatch')
          .forEach((s) => s.classList.remove('selected'));
        // Add selected class to clicked swatch
        swatch.classList.add('selected');

        // Update global color
        const colorInput = qs('timeBlockGlobalColor');
        const preview = qs('globalTimeBlockPreview');
        if (colorInput && preview) {
          colorInput.value = color;
          preview.style.backgroundColor = color;
          // Save the change
          saveTimeBlockGlobalColorChange(color);
        }
      } else if (typeof blockId === 'object' && blockId.colorInput && blockId.preview) {
        // Individual time block - blockId is an object with colorInput and preview
        const detailsId = blockId.colorInput.id.replace('timeBlockColor-', 'timeBlockDetails-');
        document.querySelectorAll(`#${detailsId} .color-swatch`).forEach((s) => s.classList.remove('selected'));
        swatch.classList.add('selected');

        // Update individual time block color
        blockId.colorInput.value = color;
        blockId.preview.style.backgroundColor = color;
        // Trigger the existing save functionality
        blockId.colorInput.dispatchEvent(new Event('change'));
      }
    };

    // Add remove button for custom colors
    if (isCustom) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'custom-color-remove';
      removeBtn.innerHTML = '×';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeCustomColor(color);
      };
      swatch.appendChild(removeBtn);
    }

    return swatch;
  }

  // Save time block global color change
  async function saveTimeBlockGlobalColorChange(color) {
    try {
      await window.cc3Storage.setTimeBlockingGlobalColor(color);
      settings = await window.cc3Storage.getSettings();
      updateTimeBlockingSchedule(); // Refresh to show new default color
      notifyTimeBlockingColorChange();
    } catch (error) {
      console.error('Error saving time block global color:', error);
    }
  }

  // Handle time block color tab switching
  function switchTimeBlockColorTab(blockId, tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll(`[data-timeblock="${blockId}"][data-tab]`);
    tabs.forEach((tab) => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      }
    });

    // Update tab panels
    const panelPrefix = blockId === 'global' ? 'global' : `timeblock-${blockId}`;
    const panels = [
      `${panelPrefix}-vibrant-panel`,
      `${panelPrefix}-pastel-panel`,
      `${panelPrefix}-dark-panel`,
      `${panelPrefix}-custom-panel`,
    ];
    panels.forEach((panelId) => {
      const panel = qs(panelId);
      if (panel) {
        panel.classList.remove('active');
        if (panelId === `${panelPrefix}-${tabName}-panel`) {
          panel.classList.add('active');
        }
      }
    });
  }

  // Handle task list color tab switching
  function switchTaskListColorTab(listId, tabName, prefix = 'taskList') {
    const container = document.getElementById(`${prefix}Details-${listId}`);
    if (!container) return;

    const tabs = container.querySelectorAll(`[data-tab][data-color-prefix="${prefix}"]`);
    tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    const panels = container.querySelectorAll('.color-tab-panel');
    panels.forEach((panel) => {
      const panelName = panel.dataset.panel;
      panel.classList.toggle('active', panelName === tabName);
    });
  }

  // Create individual time block color palettes
  function createIndividualTimeBlockPalettes(blockColorId) {
    // Get references to elements
    const colorInput = qs(`timeBlockColor-${blockColorId}`);
    const preview = qs(`timeBlockPreview-${blockColorId}`);

    if (!colorInput || !preview) {
      // Retry after a short delay if elements aren't ready yet
      setTimeout(() => createIndividualTimeBlockPalettes(blockColorId), 50);
      return;
    }

    const blockRef = { colorInput, preview };

    // Vibrant palette
    const vibrantPalette = qs(`timeBlockPalette-${blockColorId}`);
    if (vibrantPalette) {
      vibrantPalette.innerHTML = '';
      colorPickerPalette.forEach((color) => {
        vibrantPalette.appendChild(createTimeBlockColorSwatch(color, blockRef, vibrantPalette));
      });
    }

    // Pastel palette
    const pastelPaletteEl = qs(`timeBlockPastelPalette-${blockColorId}`);
    if (pastelPaletteEl) {
      pastelPaletteEl.innerHTML = '';
      pastelPalette.forEach((color) => {
        pastelPaletteEl.appendChild(createTimeBlockColorSwatch(color, blockRef, pastelPaletteEl));
      });
    }

    // Dark palette
    const darkPaletteEl = qs(`timeBlockDarkPalette-${blockColorId}`);
    if (darkPaletteEl) {
      darkPaletteEl.innerHTML = '';
      darkPalette.forEach((color) => {
        darkPaletteEl.appendChild(createTimeBlockColorSwatch(color, blockRef, darkPaletteEl));
      });
    }

    // Custom palette
    const customPalette = qs(`timeBlockCustomPalette-${blockColorId}`);
    if (customPalette) {
      customPalette.innerHTML = '';
      customColors.forEach((color) => {
        customPalette.appendChild(createTimeBlockColorSwatch(color, blockRef, customPalette, true));
      });
    }
  }

  // Handle tab switching
  function switchColorTab(dayIndex, tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll(`[data-day="${dayIndex}"][data-tab]`);
    tabs.forEach((tab) => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      }
    });

    // Update tab panels
    const panels = [
      `vibrant-panel-${dayIndex}`,
      `pastel-panel-${dayIndex}`,
      `dark-panel-${dayIndex}`,
      `custom-panel-${dayIndex}`,
    ];
    panels.forEach((panelId) => {
      const panel = qs(panelId);
      if (panel) {
        panel.classList.remove('active');
        if (panelId === `${tabName}-panel-${dayIndex}`) {
          panel.classList.add('active');
        }
      }
    });
  }

  // Create color swatch with click handler
  function createColorSwatch(color, dayIndex, palette, isCustom = false) {
    const swatch = document.createElement('div');
    swatch.className = isCustom ? 'color-swatch custom-color-swatch' : 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.title = color;

    swatch.onclick = () => {
      // Remove selected class from all swatches in this day's palettes
      document.querySelectorAll(`#details${dayIndex} .color-swatch`).forEach((s) => s.classList.remove('selected'));
      // Add selected class to clicked swatch
      swatch.classList.add('selected');
      // Update the color input
      const colorInput = qs(`color${dayIndex}`);
      if (colorInput) {
        colorInput.value = color;
        // Update preview with current opacity
        const opacity = settings.weekdayOpacity?.[String(dayIndex)] || defaultOpacity[String(dayIndex)];
        updatePreview(dayIndex, color, opacity);
        colorInput.dispatchEvent(new Event('change'));
      }
    };

    // Add remove button for custom colors
    if (isCustom) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'custom-color-remove';
      removeBtn.innerHTML = '×';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeCustomColor(color);
      };
      swatch.appendChild(removeBtn);
    }

    return swatch;
  }

  // Create vibrant color palette
  function createColorPalette(dayIndex) {
    const palette = qs(`palette${dayIndex}`);
    if (!palette) return;

    palette.innerHTML = '';

    // Add main color picker palette
    colorPickerPalette.forEach((color) => {
      palette.appendChild(createColorSwatch(color, dayIndex, palette));
    });

    // Add task inline colors to the palette as well
    const taskInlineColors =
      settings.taskColoring?.inlineColors || window.cc3Storage.defaultSettings.taskColoring.inlineColors;
    taskInlineColors.forEach((color) => {
      // Only add if not already in the main palette
      if (!colorPickerPalette.includes(color)) {
        palette.appendChild(createColorSwatch(color, dayIndex, palette));
      }
    });
  }

  // Create pastel color palette
  function createPastelColorPalette(dayIndex) {
    const palette = qs(`pastel-palette${dayIndex}`);
    if (!palette) return;

    palette.innerHTML = '';
    pastelPalette.forEach((color) => {
      palette.appendChild(createColorSwatch(color, dayIndex, palette));
    });
  }

  // Create dark color palette
  function createDarkColorPalette(dayIndex) {
    const palette = qs(`dark-palette${dayIndex}`);
    if (!palette) return;

    palette.innerHTML = '';
    darkPalette.forEach((color) => {
      palette.appendChild(createColorSwatch(color, dayIndex, palette));
    });
  }

  // Create custom color palette
  function createCustomColorPalette(dayIndex) {
    const palette = qs(`custom-palette${dayIndex}`);
    if (!palette) return;

    palette.innerHTML = '';
    customColors.forEach((color) => {
      palette.appendChild(createColorSwatch(color, dayIndex, palette, true));
    });
  }

  function updateColors() {
    for (let i = 0; i < 7; i++) {
      const colorInput = qs(`color${i}`);
      const opacityInput = qs(`opacity${i}`);
      const opacityValue = qs(`opacityValue${i}`);
      const preview = qs(`preview${i}`);

      if (colorInput) {
        colorInput.value = settings.weekdayColors[String(i)] || defaultColors[String(i)];
      }

      if (preview) {
        const color = settings.weekdayColors[String(i)] || defaultColors[String(i)];
        const opacity = settings.weekdayOpacity?.[String(i)] || defaultOpacity[String(i)];
        updatePreview(i, color, opacity);
      }

      if (opacityInput) {
        const opacity = settings.weekdayOpacity?.[String(i)] || defaultOpacity[String(i)];
        opacityInput.value = opacity;
        if (opacityValue) {
          opacityValue.textContent = opacity + '%';
        }
      }

      // Create all color palettes for each day
      createColorPalette(i);
      createPastelColorPalette(i);
      createDarkColorPalette(i);
      createCustomColorPalette(i);
    }

    // Update week start setting
    const weekStartSelect = qs('weekStart');
    if (weekStartSelect && settings.weekStart !== undefined) {
      weekStartSelect.value = String(settings.weekStart);
    }

    // Reorganize day color row based on week start
    reorganizeWeekdaysDisplay();
  }

  // Reorganize the weekdays display based on week start setting
  function reorganizeWeekdaysDisplay() {
    const weekStart = settings.weekStart !== undefined ? settings.weekStart : 0; // 0=Sunday, 1=Monday, 6=Saturday
    const weekdaysContainer = document.querySelector('.weekdays');

    if (!weekdaysContainer) return;

    // Get all day color items
    const dayItems = Array.from(weekdaysContainer.querySelectorAll('.day-color-item'));

    if (dayItems.length !== 7) return;

    // Create a map of day index to element
    const dayMap = {};
    dayItems.forEach((item) => {
      const dayIndex = parseInt(item.getAttribute('data-day'));
      dayMap[dayIndex] = item;
    });

    // Clear the container
    weekdaysContainer.innerHTML = '';

    // Reorganize based on week start
    // If week starts on Sunday (0), order is: 0,1,2,3,4,5,6
    // If week starts on Monday (1), order is: 1,2,3,4,5,6,0
    // If week starts on Saturday (6), order is: 6,0,1,2,3,4,5
    for (let i = 0; i < 7; i++) {
      const dayIndex = (i + weekStart) % 7;
      if (dayMap[dayIndex]) {
        weekdaysContainer.appendChild(dayMap[dayIndex]);
      }
    }
  }

  function setupEventListeners() {
    // Accordion behavior for section headers
    const sectionHeaders = document.querySelectorAll('.section-header[data-section]');

    sectionHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        // Don't trigger accordion if clicking on toggle switch or its label
        if (e.target.closest('.toggle')) {
          return;
        }

        const isExpanded = header.classList.contains('expanded');

        // Close all sections
        sectionHeaders.forEach(h => h.classList.remove('expanded'));

        // If this section was not expanded, expand it
        if (!isExpanded) {
          header.classList.add('expanded');
        }
      });
    });

    // Set Day Coloring as expanded by default
    const dayColoringHeader = document.querySelector('.section-header[data-section="day-coloring"]');
    if (dayColoringHeader) {
      dayColoringHeader.classList.add('expanded');
    }

    // Toggle switch
    qs('enableDayColoring').onclick = async (e) => {
      e.stopPropagation(); // Prevent accordion trigger
      const previousState = settings.enabled;

      // Use storage system's setEnabled method for bulletproof toggling
      settings = await window.cc3Storage.setEnabled(!previousState);

      updateToggle();
      await saveSettings();

      // Trigger immediate update for day coloring feature (same as toolbar)
      const newSettings = await window.cc3Storage.getSettings();
      if (window.cc3Features && window.cc3Features.updateFeature) {
        window.cc3Features.updateFeature('dayColoring', newSettings);
      }
    };

    // Master task features toggle switch
    qs('enableTaskFeatures').onclick = async (e) => {
      e.stopPropagation(); // Prevent accordion trigger
      const currentEnabled = settings.taskColoring?.enabled || settings.taskListColoring?.enabled;
      const newEnabled = !currentEnabled;

      // Enable/disable both task coloring and task list coloring together
      await window.cc3Storage.setTaskColoringEnabled(newEnabled);
      await window.cc3Storage.setTaskListColoringEnabled(newEnabled);
      settings = await window.cc3Storage.getSettings();
      updateTaskFeaturesToggle();
      updateTaskListColoringToggle();
      await saveSettings();

      // Trigger immediate update for task coloring feature
      const newSettings = await window.cc3Storage.getSettings();
      if (window.cc3Features && window.cc3Features.updateFeature) {
        window.cc3Features.updateFeature('taskColoring', newSettings.taskColoring || {});
      }
    };

    // Time blocking toggle switch
    qs('enableTimeBlocking').onclick = async (e) => {
      e.stopPropagation(); // Prevent accordion trigger
      const currentEnabled = settings.timeBlocking?.enabled || false;
      await window.cc3Storage.setTimeBlockingEnabled(!currentEnabled);
      settings = await window.cc3Storage.getSettings();
      updateTimeBlockingToggle();
      updateTimeBlockingSettings();
      await saveSettings();

      // Immediately notify content script
      notifyTimeBlockingChange();
    };

    // OAuth grant button
    const grantOAuthButton = qs('grantOAuthButton');
    if (grantOAuthButton) {
      grantOAuthButton.onclick = async () => {
        try {
          // Show loading state
          const originalText = grantOAuthButton.textContent;
          grantOAuthButton.textContent = 'Granting access...';
          grantOAuthButton.disabled = true;

          const response = await chrome.runtime.sendMessage({ type: 'GOOGLE_OAUTH_REQUEST', interactive: true });

          // Restore button state
          grantOAuthButton.textContent = originalText;
          grantOAuthButton.disabled = false;

          if (response?.success) {
            showToast('Access granted! Task lists synced successfully.');

            // Note: No need to trigger sync here - handleOAuthRequest() already syncs
            // This prevents duplicate API calls

            // Reload the UI
            settings = await window.cc3Storage.getSettings();
            await initTaskListColoring();
          } else {
            // Show specific error messages based on error type
            if (response?.error === 'USER_DENIED') {
              showToast('Access denied. ColorKit needs read-only access to your task lists.');
            } else if (response?.error === 'RATE_LIMIT') {
              showToast('Too many requests. Please wait a minute and try again.');
            } else if (response?.error === 'NO_TOKEN') {
              showToast('Failed to obtain access token. Please try again.');
            } else {
              showToast('Failed to grant access. Please try again.');
            }
          }
        } catch (error) {
          // Restore button state on error
          grantOAuthButton.textContent = 'Grant Access';
          grantOAuthButton.disabled = false;

          console.error('[Task List Colors] OAuth grant error:', error);
          showToast('Error granting access. Please try again.');
        }
      };
    }

    // Task list info card toggle
    const taskListInfoToggle = qs('taskListInfoToggle');
    const taskListInfoExpanded = qs('taskListInfoExpanded');
    if (taskListInfoToggle && taskListInfoExpanded) {
      taskListInfoToggle.onclick = (e) => {
        e.preventDefault();
        const isExpanded = taskListInfoExpanded.style.display !== 'none';

        if (isExpanded) {
          // Collapse
          taskListInfoExpanded.style.display = 'none';
          taskListInfoToggle.innerHTML = `
            See how to use
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        } else {
          // Expand
          taskListInfoExpanded.style.display = 'block';
          taskListInfoToggle.innerHTML = `
            Hide
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transform: rotate(180deg); transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
      };
    }

    // Task list video tutorial button
    const taskListVideoTutorialBtn = qs('taskListVideoTutorialBtn');
    if (taskListVideoTutorialBtn) {
      taskListVideoTutorialBtn.onclick = (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://www.calendarextension.com/help#task-list-coloring' });
      };
    }

    // Day Coloring info card toggle
    const dayColoringInfoToggle = qs('dayColoringInfoToggle');
    const dayColoringInfoExpanded = qs('dayColoringInfoExpanded');
    if (dayColoringInfoToggle && dayColoringInfoExpanded) {
      dayColoringInfoToggle.onclick = (e) => {
        e.preventDefault();
        const isExpanded = dayColoringInfoExpanded.style.display !== 'none';
        if (isExpanded) {
          dayColoringInfoExpanded.style.display = 'none';
          dayColoringInfoToggle.innerHTML = `
            See how to use
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        } else {
          dayColoringInfoExpanded.style.display = 'block';
          dayColoringInfoToggle.innerHTML = `
            Hide
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transform: rotate(180deg); transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
      };
    }

    const dayColoringVideoTutorialBtn = qs('dayColoringVideoTutorialBtn');
    if (dayColoringVideoTutorialBtn) {
      dayColoringVideoTutorialBtn.onclick = (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://www.calendarextension.com/help#day-coloring' });
      };
    }

    // Quick Access Colors info card toggle
    const quickAccessColorsInfoToggle = qs('quickAccessColorsInfoToggle');
    const quickAccessColorsInfoExpanded = qs('quickAccessColorsInfoExpanded');
    if (quickAccessColorsInfoToggle && quickAccessColorsInfoExpanded) {
      quickAccessColorsInfoToggle.onclick = (e) => {
        e.preventDefault();
        const isExpanded = quickAccessColorsInfoExpanded.style.display !== 'none';
        if (isExpanded) {
          quickAccessColorsInfoExpanded.style.display = 'none';
          quickAccessColorsInfoToggle.innerHTML = `
            See how to use
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        } else {
          quickAccessColorsInfoExpanded.style.display = 'block';
          quickAccessColorsInfoToggle.innerHTML = `
            Hide
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transform: rotate(180deg); transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
      };
    }

    const quickAccessColorsVideoTutorialBtn = qs('quickAccessColorsVideoTutorialBtn');
    if (quickAccessColorsVideoTutorialBtn) {
      quickAccessColorsVideoTutorialBtn.onclick = (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://www.calendarextension.com/help#quick-access-colors' });
      };
    }

    // Time Blocking info card toggle
    const timeBlockingInfoToggle = qs('timeBlockingInfoToggle');
    const timeBlockingInfoExpanded = qs('timeBlockingInfoExpanded');
    if (timeBlockingInfoToggle && timeBlockingInfoExpanded) {
      timeBlockingInfoToggle.onclick = (e) => {
        e.preventDefault();
        const isExpanded = timeBlockingInfoExpanded.style.display !== 'none';
        if (isExpanded) {
          timeBlockingInfoExpanded.style.display = 'none';
          timeBlockingInfoToggle.innerHTML = `
            See how to use
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        } else {
          timeBlockingInfoExpanded.style.display = 'block';
          timeBlockingInfoToggle.innerHTML = `
            Hide
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transform: rotate(180deg); transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
      };
    }

    const timeBlockingVideoTutorialBtn = qs('timeBlockingVideoTutorialBtn');
    if (timeBlockingVideoTutorialBtn) {
      timeBlockingVideoTutorialBtn.onclick = (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://www.calendarextension.com/help#time-blocking' });
      };
    }

    // Color Lab info card toggle
    const colorLabInfoToggle = qs('colorLabInfoToggle');
    const colorLabInfoExpanded = qs('colorLabInfoExpanded');
    if (colorLabInfoToggle && colorLabInfoExpanded) {
      colorLabInfoToggle.onclick = (e) => {
        e.preventDefault();
        const isExpanded = colorLabInfoExpanded.style.display !== 'none';
        if (isExpanded) {
          colorLabInfoExpanded.style.display = 'none';
          colorLabInfoToggle.innerHTML = `
            See how to use
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        } else {
          colorLabInfoExpanded.style.display = 'block';
          colorLabInfoToggle.innerHTML = `
            Hide
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transform: rotate(180deg); transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
      };
    }

    const colorLabVideoTutorialBtn = qs('colorLabVideoTutorialBtn');
    if (colorLabVideoTutorialBtn) {
      colorLabVideoTutorialBtn.onclick = (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://www.calendarextension.com/help#color-lab' });
      };
    }

    // Date-Specific Blocks info card toggle
    const dateSpecificBlocksInfoToggle = qs('dateSpecificBlocksInfoToggle');
    const dateSpecificBlocksInfoExpanded = qs('dateSpecificBlocksInfoExpanded');
    if (dateSpecificBlocksInfoToggle && dateSpecificBlocksInfoExpanded) {
      dateSpecificBlocksInfoToggle.onclick = (e) => {
        e.preventDefault();
        const isExpanded = dateSpecificBlocksInfoExpanded.style.display !== 'none';
        if (isExpanded) {
          dateSpecificBlocksInfoExpanded.style.display = 'none';
          dateSpecificBlocksInfoToggle.innerHTML = `
            See how to use
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        } else {
          dateSpecificBlocksInfoExpanded.style.display = 'block';
          dateSpecificBlocksInfoToggle.innerHTML = `
            Hide
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="transform: rotate(180deg); transition: transform 0.2s ease;">
              <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          `;
        }
      };
    }

    const dateSpecificBlocksVideoTutorialBtn = qs('dateSpecificBlocksVideoTutorialBtn');
    if (dateSpecificBlocksVideoTutorialBtn) {
      dateSpecificBlocksVideoTutorialBtn.onclick = (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'https://www.calendarextension.com/help#date-specific-blocks' });
      };
    }

    // Manual sync button
    const manualSyncButton = qs('manualSyncButton');
    if (manualSyncButton) {
      manualSyncButton.onclick = async () => {
        try {
          manualSyncButton.disabled = true;
          manualSyncButton.textContent = '⏳ Syncing...';

          const response = await chrome.runtime.sendMessage({ type: 'SYNC_TASK_LISTS', fullSync: true });

          console.log('[Popup] Sync response:', response);

          if (response?.success) {
            showToast(`Synced ${response.taskCount} tasks successfully!`);

            console.log('[Popup] Sync diagnostics:', {
              syncType: response.syncType,
              taskCount: response.taskCount,
              duration: response.duration + 'ms',
              sampleTaskIds: response.sampleTaskIds
            });

            // Reload task lists
            settings = await window.cc3Storage.getSettings();
            updateSyncStatus();
            await loadTaskLists();
          } else {
            console.error('[Popup] Sync failed:', response);
            showToast('Sync failed. Please try again.');
          }
        } catch (error) {
          console.error('[Task List Colors] Sync error:', error);
          showToast('Sync error. Please try again.');
        } finally {
          manualSyncButton.disabled = false;
          manualSyncButton.textContent = '🔄 Sync Now';
        }
      };
    }

    // Time blocking global settings
    const timeBlockGlobalColor = qs('timeBlockGlobalColor');
    const globalPreview = qs('globalTimeBlockPreview');
    if (timeBlockGlobalColor) {
      timeBlockGlobalColor.onchange = async (e) => {
        const newColor = e.target.value;
        // Update preview
        if (globalPreview) {
          globalPreview.style.backgroundColor = newColor;
        }
        await window.cc3Storage.setTimeBlockingGlobalColor(newColor);
        settings = await window.cc3Storage.getSettings();
        updateTimeBlockingSchedule(); // Refresh to show new default color
        await saveSettings();
        notifyTimeBlockingColorChange(); // Use real-time color update
      };
      // Also add real-time feedback during color picking
      timeBlockGlobalColor.oninput = async (e) => {
        const newColor = e.target.value;
        // Update preview in real-time
        if (globalPreview) {
          globalPreview.style.backgroundColor = newColor;
        }
        await window.cc3Storage.setTimeBlockingGlobalColor(newColor);
        settings = await window.cc3Storage.getSettings();
        notifyTimeBlockingColorChange();
      };

      // Add hex input synchronization for global color
      const globalHexInput = qs('timeBlockGlobalHex');
      if (globalHexInput) {
        // When color picker changes, update hex input
        const syncGlobalHexFromColor = () => {
          globalHexInput.value = timeBlockGlobalColor.value.toUpperCase();
        };

        // When hex input changes, update color picker
        const syncGlobalColorFromHex = async () => {
          const hexValue = globalHexInput.value.trim();
          // Add # if missing
          const normalizedHex = hexValue.startsWith('#') ? hexValue : '#' + hexValue;
          // Validate hex format
          if (/^#[0-9A-Fa-f]{6}$/.test(normalizedHex)) {
            timeBlockGlobalColor.value = normalizedHex;
            globalHexInput.style.borderColor = '#1a73e8';
            // Update preview and save
            if (globalPreview) {
              globalPreview.style.backgroundColor = normalizedHex;
            }
            await window.cc3Storage.setTimeBlockingGlobalColor(normalizedHex);
            settings = await window.cc3Storage.getSettings();
            updateTimeBlockingSchedule();
            await saveSettings();
            notifyTimeBlockingColorChange();
          } else {
            globalHexInput.style.borderColor = '#dc2626';
          }
        };

        timeBlockGlobalColor.addEventListener('change', syncGlobalHexFromColor);
        timeBlockGlobalColor.addEventListener('input', syncGlobalHexFromColor);
        globalHexInput.addEventListener('input', syncGlobalColorFromHex);
        globalHexInput.addEventListener('change', syncGlobalColorFromHex);
      }
    }

    const timeBlockShadingStyle = qs('timeBlockShadingStyle');
    if (timeBlockShadingStyle) {
      timeBlockShadingStyle.onchange = async (e) => {
        await window.cc3Storage.setTimeBlockingShadingStyle(e.target.value);
        settings = await window.cc3Storage.getSettings();
        await saveSettings();
        notifyTimeBlockingChange();
      };
    }

    // Add Date-specific Block button
    const addDateSpecificBlockBtn = qs('addDateSpecificBlock');
    if (addDateSpecificBlockBtn) {
      addDateSpecificBlockBtn.onclick = addDateSpecificBlock;
    }

    // Remove All Date-specific Blocks button
    const removeAllDateSpecificBlocksBtn = qs('removeAllDateSpecificBlocks');
    if (removeAllDateSpecificBlocksBtn) {
      removeAllDateSpecificBlocksBtn.onclick = removeAllDateSpecificBlocks;
    }

    // Color pickers and opacity controls
    for (let i = 0; i < 7; i++) {
      const colorInput = qs(`color${i}`);
      const opacityInput = qs(`opacity${i}`);
      const opacityValue = qs(`opacityValue${i}`);
      const preview = qs(`preview${i}`);

      if (colorInput) {
        colorInput.onchange = async (e) => {
          settings = await window.cc3Storage.setWeekdayColor(i, e.target.value);
          const opacity = settings.weekdayOpacity?.[String(i)] || defaultOpacity[String(i)];
          updatePreview(i, e.target.value, opacity);
          await saveSettings();
        };
      }

      if (opacityInput) {
        // Enhanced real-time preview update as user drags slider
        opacityInput.oninput = (e) => {
          const opacity = parseInt(e.target.value);
          updateOpacityDisplay(i, opacity);
          updateSliderFill(i, opacity);
          // Update preview with new opacity (no save yet)
          const color = settings.weekdayColors?.[String(i)] || defaultColors[String(i)];
          updatePreview(i, color, opacity);
        };

        // Save and apply to calendar when user releases slider
        const saveOpacity = async (e) => {
          const opacity = parseInt(e.target.value);
          settings = await window.cc3Storage.setWeekdayOpacity(i, opacity);
          updateOpacityPresetButtons(i, opacity);
          await saveSettings();
        };

        opacityInput.onchange = saveOpacity;
        opacityInput.onmouseup = saveOpacity;
        opacityInput.ontouchend = saveOpacity;
      }
    }

    // Week start selector
    const weekStartSelect = qs('weekStart');
    if (weekStartSelect) {
      weekStartSelect.onchange = async (e) => {
        settings = await window.cc3Storage.setWeekStart(parseInt(e.target.value, 10));
        await saveSettings();
        // Reorganize day color row to match new week start
        reorganizeWeekdaysDisplay();
      };
    }

    // Enhanced Opacity Preset Buttons
    document.querySelectorAll('.opacity-preset-btn').forEach((button) => {
      button.onclick = async (e) => {
        const dayIndex = parseInt(e.target.dataset.day);
        const opacity = parseInt(e.target.dataset.opacity);
        const opacityInput = qs(`opacity${dayIndex}`);

        if (opacityInput) {
          // Update slider value
          opacityInput.value = opacity;
          // Update all UI elements
          updateOpacityDisplay(dayIndex, opacity);
          updateSliderFill(dayIndex, opacity);
          updateOpacityPresetButtons(dayIndex, opacity);
          // Save settings
          settings = await window.cc3Storage.setWeekdayOpacity(dayIndex, opacity);
          // Update preview with new opacity
          const color = settings.weekdayColors?.[String(dayIndex)] || defaultColors[String(dayIndex)];
          updatePreview(dayIndex, color, opacity);
          await saveSettings();
        }
      };
    });

    // Color tab switching
    document.querySelectorAll('.color-tab').forEach((tab) => {
      tab.onclick = () => {
        const dayIndex = tab.dataset.day;
        const tabName = tab.dataset.tab;
        switchColorTab(dayIndex, tabName);
      };
    });

    // Reset button
    qs('resetBtn').onclick = async () => {
      if (
        confirm(
          '⚠️ WARNING: This will reset ALL extension settings to their default values.\n\nThis includes:\n• All day colors and opacity settings\n• All task coloring settings and custom task colors\n• All time blocking schedules and colors\n• Week start preferences\n\nThis action cannot be undone. Are you sure you want to continue?',
        )
      ) {
        // Reset to completely default settings (including disabling features)
        settings = await window.cc3Storage.setSettings(window.cc3Storage.defaultSettings);

        // Clear all custom task colors stored separately
        await new Promise((resolve) => {
          chrome.storage.sync.remove('cf.taskColors', resolve);
        });

        // Clear custom day colors
        customColors = [];
        await saveCustomColors();

        // Update all UI components
        updateToggle();
        updateTaskFeaturesToggle();
        updateTaskColoringToggle();
        updateTimeBlockingToggle();
        updateColors();
        updateInlineColorsGrid();
        updateTimeBlockingSettings();

        // Notify all content scripts of the reset
        await saveSettings();

        // Visual feedback
        const btn = qs('resetBtn');
        const originalText = btn.textContent;
        const originalStyle = btn.style.background;
        btn.textContent = 'Reset Complete!';
        btn.style.background = '#059669';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = originalStyle;
        }, 2000);

        // Show refresh message
        setTimeout(() => {
          alert('✅ Reset complete!\n\nPlease refresh your Google Calendar page to see the changes take effect.');
        }, 100);
      }
    };
  }

  // Enhanced opacity control helper functions
  function updateOpacityDisplay(dayIndex, opacity) {
    const opacityValue = qs(`opacityValue${dayIndex}`);
    if (opacityValue) {
      opacityValue.textContent = opacity + '%';
    }
  }

  function updateSliderFill(dayIndex, opacity) {
    const sliderFill = qs(`sliderFill${dayIndex}`);
    if (sliderFill) {
      sliderFill.style.width = opacity + '%';
    }
  }

  function updateOpacityPresetButtons(dayIndex, currentOpacity) {
    // Remove active class from all preset buttons for this day
    document.querySelectorAll(`[data-day="${dayIndex}"].opacity-preset-btn`).forEach((btn) => {
      btn.classList.remove('active');
    });

    // Add active class to the button that matches current opacity (if it exists)
    const activeButton = document.querySelector(
      `[data-day="${dayIndex}"][data-opacity="${currentOpacity}"].opacity-preset-btn`,
    );
    if (activeButton) {
      activeButton.classList.add('active');
    }
  }

  function initializeEnhancedOpacityControls() {
    // Initialize all opacity displays and slider fills based on current settings
    for (let i = 0; i < 7; i++) {
      const currentOpacity = settings.weekdayOpacity?.[String(i)] || defaultOpacity[String(i)];
      updateOpacityDisplay(i, currentOpacity);
      updateSliderFill(i, currentOpacity);
      updateOpacityPresetButtons(i, currentOpacity);
    }
  }

  // Enhanced color picker toggle functionality
  function setupColorPickerToggle() {
    // Track which color pickers are currently open
    const colorPickerStates = {};

    // Helper function to update icon appearance
    function updateIconAppearance(icon, isOpen) {
      if (isOpen) {
        icon.style.background = 'rgba(26, 115, 232, 0.9)';
        icon.style.color = 'white';
        icon.title = 'Click to close color picker';
      } else {
        icon.style.background = 'rgba(255, 255, 255, 0.9)';
        icon.style.color = '';
        icon.title = 'Click to open color picker';
      }
    }

    // Set up both icon and color input handlers
    document.querySelectorAll('.color-picker-icon').forEach((icon) => {
      const dayIndex = icon.dataset.day;
      const colorInput = qs(`color${dayIndex}`);
      if (!colorInput) return;

      colorPickerStates[dayIndex] = false; // Initially closed

      // Create a wrapper div to intercept clicks
      const container = colorInput.parentElement;

      // Add a click handler to the container that manages the toggle
      let isProcessingClick = false;

      container.onclick = (e) => {
        // Don't process if we're already handling a click
        if (isProcessingClick) return;
        isProcessingClick = true;

        // If clicking on the icon, handle toggle
        if (e.target === icon) {
          e.preventDefault();
          e.stopPropagation();

          colorPickerStates[dayIndex] = !colorPickerStates[dayIndex];
          updateIconAppearance(icon, colorPickerStates[dayIndex]);

          if (colorPickerStates[dayIndex]) {
            // Delay the click to allow our state to be set first
            setTimeout(() => {
              colorInput.click();
              isProcessingClick = false;
            }, 50);
          } else {
            isProcessingClick = false;
          }
          return;
        }

        // If clicking on the color input, handle toggle
        if (e.target === colorInput) {
          e.preventDefault();
          e.stopPropagation();

          colorPickerStates[dayIndex] = !colorPickerStates[dayIndex];
          updateIconAppearance(icon, colorPickerStates[dayIndex]);

          if (colorPickerStates[dayIndex]) {
            // Allow the native click to proceed for opening
            setTimeout(() => {
              // Restore the default click behavior temporarily
              const originalHandler = colorInput.onclick;
              colorInput.onclick = null;
              colorInput.click();
              colorInput.onclick = originalHandler;
              isProcessingClick = false;
            }, 50);
          } else {
            isProcessingClick = false;
          }
          return;
        }

        isProcessingClick = false;
      };

      // Handle when the color input changes (user selects a color)
      const originalOnChange = colorInput.onchange;
      colorInput.onchange = (e) => {
        // Call the original handler first
        if (originalOnChange) {
          originalOnChange(e);
        }

        // Auto-close the picker after selection
        setTimeout(() => {
          colorPickerStates[dayIndex] = false;
          updateIconAppearance(icon, false);
        }, 100);
      };
    });
  }

  function setupDayClickHandlers() {
    // Set up click handlers for day color items
    document.querySelectorAll('.day-color-item').forEach((dayItem, index) => {
      const dayIndex = parseInt(dayItem.dataset.day);
      const details = qs(`details${dayIndex}`);
      const preview = qs(`preview${dayIndex}`);

      // Click handler for the entire day item
      dayItem.onclick = (e) => {
        // Don't expand/collapse if clicking inside the day-details dropdown
        if (e.target.closest('.day-details')) {
          return;
        }

        // Don't expand if clicking on color input or other controls
        if (
          e.target.tagName === 'INPUT' ||
          e.target.tagName === 'BUTTON' ||
          e.target.classList.contains('color-swatch')
        ) {
          return;
        }

        // Close all other expanded items (including time block and task pickers)
        document
          .querySelectorAll(
            '.day-color-item, .task-color-item, .time-block-color-details, .time-block-global-color-details',
          )
          .forEach((item) => {
            if (item !== dayItem) {
              item.classList.remove('expanded');
              const otherDetails = item.querySelector(
                '.day-details, .task-color-details, .time-block-color-details, .time-block-global-color-details',
              );
              if (otherDetails) {
                otherDetails.classList.remove('expanded');
                otherDetails.style.zIndex = '';
              }
            }
          });

        // Toggle current item
        dayItem.classList.toggle('expanded');
        if (details) {
          details.classList.toggle('expanded');
          if (details.classList.contains('expanded')) {
            details.style.zIndex = '999999';
          } else {
            details.style.zIndex = '';
          }
        }
      };

      // Also add click handler specifically for the preview square
      if (preview) {
        preview.onclick = (e) => {
          e.stopPropagation();

          // Close all other expanded items (including time block and task pickers)
          document
            .querySelectorAll(
              '.day-color-item, .task-color-item, .time-block-color-details, .time-block-global-color-details',
            )
            .forEach((item) => {
              if (item !== dayItem) {
                item.classList.remove('expanded');
                const otherDetails = item.querySelector(
                  '.day-details, .task-color-details, .time-block-color-details, .time-block-global-color-details',
                );
                if (otherDetails) {
                  otherDetails.classList.remove('expanded');
                  otherDetails.style.zIndex = '';
                }
              }
            });

          // Toggle current item
          dayItem.classList.toggle('expanded');
          if (details) {
            details.classList.toggle('expanded');
            if (details.classList.contains('expanded')) {
              // Ensure this picker has maximum z-index
              details.style.zIndex = '2147483000';
            } else {
              details.style.zIndex = '';
            }
          }
        };
      }

      // Prevent clicks inside day-details from bubbling up
      if (details) {
        details.onclick = (e) => {
          e.stopPropagation();
        };
      }
    });
  }

  function setupTaskClickHandlers() {
    // Set up click handlers for task color items
    document.querySelectorAll('.task-color-item').forEach((taskItem, index) => {
      const taskIndex = parseInt(taskItem.dataset.index);
      const details = qs(`taskDetails${taskIndex}`);
      const preview = qs(`taskPreview${taskIndex}`);

      // Click handler for the entire task item
      taskItem.onclick = (e) => {
        // Don't expand/collapse if clicking inside the task-color-details dropdown
        if (e.target.closest('.task-color-details')) {
          return;
        }

        // Don't expand if clicking on color input or other controls
        if (
          e.target.tagName === 'INPUT' ||
          e.target.tagName === 'BUTTON' ||
          e.target.classList.contains('color-swatch')
        ) {
          return;
        }

        // Close all other expanded items (including day and time block pickers)
        document
          .querySelectorAll(
            '.task-color-item, .day-color-item, .time-block-color-details, .time-block-global-color-details',
          )
          .forEach((item) => {
            if (item !== taskItem) {
              item.classList.remove('expanded');
              const otherDetails = item.querySelector(
                '.task-color-details, .day-details, .time-block-color-details, .time-block-global-color-details',
              );
              if (otherDetails) {
                otherDetails.classList.remove('expanded');
                otherDetails.style.zIndex = '';
              }
            }
          });

        // Toggle current item
        taskItem.classList.toggle('expanded');
        if (details) {
          details.classList.toggle('expanded');
          if (details.classList.contains('expanded')) {
            // Ensure this picker has maximum z-index
            details.style.zIndex = '2147483000';
          } else {
            details.style.zIndex = '';
          }
        }
      };

      // Also add click handler specifically for the preview square
      if (preview) {
        preview.onclick = (e) => {
          e.stopPropagation();

          // Close all other expanded items (including day and time block pickers)
          document
            .querySelectorAll(
              '.task-color-item, .day-color-item, .time-block-color-details, .time-block-global-color-details',
            )
            .forEach((item) => {
              if (item !== taskItem) {
                item.classList.remove('expanded');
                const otherDetails = item.querySelector(
                  '.task-color-details, .day-details, .time-block-color-details, .time-block-global-color-details',
                );
                if (otherDetails) {
                  otherDetails.classList.remove('expanded');
                  otherDetails.style.zIndex = '';
                }
              }
            });

          // Toggle current item
          taskItem.classList.toggle('expanded');
          if (details) {
            details.classList.toggle('expanded');
            if (details.classList.contains('expanded')) {
              // Ensure this picker has maximum z-index
              details.style.zIndex = '2147483000';
            } else {
              details.style.zIndex = '';
            }
          }
        };
      }

      // Prevent clicks inside task-color-details from bubbling up
      if (details) {
        details.onclick = (e) => {
          e.stopPropagation();
        };
      }
    });

    // Set up task color tab switching
    document.querySelectorAll('.task-color-details .color-tab').forEach((tab) => {
      tab.onclick = () => {
        const taskIndex = tab.dataset.task;
        const tabName = tab.dataset.tab;
        switchTaskColorTab(taskIndex, tabName);
      };
    });

    // Set up task color inputs
    for (let i = 0; i < 8; i++) {
      const colorInput = qs(`taskColor${i}`);
      if (colorInput) {
        colorInput.onchange = async (e) => {
          const preview = qs(`taskPreview${i}`);
          if (preview) {
            preview.style.backgroundColor = e.target.value;
          }
          await saveTaskColorChange(i, e.target.value);
        };
      }
    }
  }

  function setupTimeBlockClickHandlers() {
    // Use event delegation for all time block color picker interactions
    document.addEventListener('click', (e) => {
      // Handle time block color preview clicks (both global and individual)
      if (e.target.matches('.time-block-global-color-preview') || e.target.matches('.time-block-color-preview')) {
        e.stopPropagation();

        let details;
        if (e.target.matches('.time-block-global-color-preview')) {
          details = qs('globalTimeBlockDetails');
        } else {
          const colorItem = e.target.closest('.time-block-color-item');
          details = colorItem?.querySelector('.time-block-color-details');
        }

        if (details) {
          // Close all other color pickers (including day and task pickers)
          document
            .querySelectorAll(
              '.time-block-color-details, .time-block-global-color-details, .day-details, .task-color-details',
            )
            .forEach((otherDetails) => {
              if (otherDetails !== details) {
                otherDetails.classList.remove('expanded');
                otherDetails.style.zIndex = '';
                const otherRow = otherDetails.closest('.time-block-item');
                if (otherRow) {
                  otherRow.classList.remove('picker-expanded');
                  otherRow.style.zIndex = '';
                }
              }
            });

          // Toggle current picker
          details.classList.toggle('expanded');

          const scheduleSection = document.querySelector('.time-block-schedule-section');
          const row = details.closest('.time-block-item');

          if (details.classList.contains('expanded')) {
            // Raise the active row and mark schedule as "picker open"
            if (row) {
              row.classList.add('picker-expanded');
              row.style.zIndex = '2147483600';
            }
            if (scheduleSection) scheduleSection.classList.add('tb-picker-open');

            // Ensure the panel itself is on top inside the row
            details.style.zIndex = '2147483000';
          } else {
            // Collapse: restore row and schedule state if no other pickers are open
            details.style.zIndex = '';
            if (row) {
              row.classList.remove('picker-expanded');
              row.style.zIndex = '';
            }
            // If no pickers remain open, drop the global "picker-open" state
            const anyOpen = document.querySelector(
              '.time-block-color-details.expanded, .time-block-global-color-details.expanded',
            );
            if (!anyOpen && scheduleSection) {
              scheduleSection.classList.remove('tb-picker-open');
            }
          }
        }
      }

      // Handle time block color tab switching
      else if (e.target.matches('[data-timeblock][data-tab]')) {
        const blockId = e.target.dataset.timeblock;
        const tabName = e.target.dataset.tab;
        switchTimeBlockColorTab(blockId, tabName);
      }

      // Handle task list color tab switching (background + text pickers)
      else if (e.target.closest('[data-list][data-color-prefix][data-tab]')) {
        const tabButton = e.target.closest('[data-list][data-color-prefix][data-tab]');
        const listId = tabButton.dataset.list;
        const tabName = tabButton.dataset.tab;
        const prefix = tabButton.dataset.colorPrefix || 'taskList';
        switchTaskListColorTab(listId, tabName, prefix);
      }

      // Prevent clicks inside time block details from bubbling up
      else if (e.target.closest('.time-block-color-details, .time-block-global-color-details')) {
        e.stopPropagation();
      }

      // Prevent clicks inside task list details from bubbling up
      else if (e.target.closest('.task-list-color-details')) {
        e.stopPropagation();
      }

      // Close color pickers when clicking outside
      else if (
        !e.target.closest(
          '.time-block-color-item, .time-block-global-color-item, .task-list-color-picker, .day-color-item, .task-color-item',
        )
      ) {
        // Close time block color pickers
        document
          .querySelectorAll('.time-block-color-details.expanded, .time-block-global-color-details.expanded')
          .forEach((details) => {
            details.classList.remove('expanded');
            details.style.zIndex = '';
            const row = details.closest('.time-block-item');
            if (row) {
              row.classList.remove('picker-expanded');
              row.style.zIndex = '';
            }
          });
        const scheduleSection = document.querySelector('.time-block-schedule-section');
        if (scheduleSection) scheduleSection.classList.remove('tb-picker-open');

        // Close task list color pickers
        document.querySelectorAll('.task-list-color-details.expanded').forEach((details) => {
          details.classList.remove('expanded');
        });

        // Close day color pickers
        document.querySelectorAll('.day-color-item.expanded').forEach((item) => {
          item.classList.remove('expanded');
        });
        document.querySelectorAll('.day-details.expanded').forEach((details) => {
          details.classList.remove('expanded');
          details.style.zIndex = '';
        });

        // Close quick pick task color pickers
        document.querySelectorAll('.task-color-item.expanded').forEach((item) => {
          item.classList.remove('expanded');
        });
        document.querySelectorAll('.task-color-details.expanded').forEach((details) => {
          details.classList.remove('expanded');
          details.style.zIndex = '';
        });

        // Hide backdrop
        const backdrop = document.getElementById('task-list-color-backdrop');
        if (backdrop) backdrop.classList.remove('active');
      }
    });
  }

  // Setup tab navigation
  function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');

        // Remove active class from all buttons and contents
        tabButtons.forEach((btn) => btn.classList.remove('active'));
        tabContents.forEach((content) => content.classList.remove('active'));

        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        const targetContent = document.getElementById(`${targetTab}Content`);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });
  }

  async function init() {
    // Check auth and subscription first
    await checkAuthAndSubscription();

    await loadSettings();
    await loadCustomColors();
    updateToggle();
    updateTaskFeaturesToggle();
    updateTaskColoringToggle();
    updateTimeBlockingToggle();
    updateTaskListColoringToggle();
    updateColorLabToggle();
    updateColors();
    initializeEnhancedOpacityControls();
    updateInlineColorsGrid();
    updateTimeBlockingSettings();
    updateColorLab();
    setupEventListeners();
    setupColorLabEventListeners();
    setupDayClickHandlers();
    setupTaskClickHandlers(); // Add task color picker handlers
    setupTimeBlockClickHandlers(); // Add time block color picker handlers
    setupTabNavigation(); // Setup tab switching
    // Setup color picker toggle after all other event listeners
    setupColorPickerToggle();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) {
        const oldSettings = changes.settings.oldValue || {};
        const newSettings = changes.settings.newValue || {};
        settings = newSettings;

        // Check if ONLY completedStyling values changed (colors/opacities)
        // If so, we should NOT reload the entire task list (it destroys sliders while dragging)
        const onlyCompletedStylingChanged = (() => {
          if (!oldSettings.taskListColoring || !newSettings.taskListColoring) return false;

          // Check if completedStyling is the only thing that changed
          const oldCopy = JSON.parse(JSON.stringify(oldSettings));
          const newCopy = JSON.parse(JSON.stringify(newSettings));

          // Remove completedStyling from both
          if (oldCopy.taskListColoring) delete oldCopy.taskListColoring.completedStyling;
          if (newCopy.taskListColoring) delete newCopy.taskListColoring.completedStyling;

          // If everything else is the same, only completedStyling changed
          return JSON.stringify(oldCopy) === JSON.stringify(newCopy);
        })();

        updateToggle();
        updateTaskFeaturesToggle();
        updateTaskColoringToggle();
        updateTimeBlockingToggle();

        // Only reload task lists if something other than completedStyling changed
        if (!onlyCompletedStylingChanged) {
          updateTaskListColoringToggle();
        }

        updateColors();
        initializeEnhancedOpacityControls();
        updateInlineColorsGrid();
        updateTimeBlockingSettings();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Quick Add palette switching - Now handled by the rewritten system above

  // Make functions globally available for HTML onclick handlers
  window.addCustomColor = addCustomColor;
  window.switchToQuickAddPalette = switchToQuickAddPalette;
  window.addFromTab = (tabName) => {
    // Get the currently active day color picker
    const expandedDay = document.querySelector('.day-color-item.expanded');
    if (!expandedDay) return;

    const dayIndex = parseInt(expandedDay.dataset.day);
    const activePanel = expandedDay.querySelector('.color-tab-panel.active');
    if (!activePanel) return;

    // Get the selected color from the active panel
    const selectedSwatch = activePanel.querySelector('.color-swatch.selected');
    if (selectedSwatch) {
      const color = selectedSwatch.title || selectedSwatch.style.backgroundColor;
      if (color && color.startsWith('#')) {
        addColorToLab(color);
      }
    }
  };

  window.addCurrentDayColor = () => {
    // Get the currently active day color picker
    const expandedDay = document.querySelector('.day-color-item.expanded');
    if (!expandedDay) return;

    const dayIndex = parseInt(expandedDay.dataset.day);
    const colorInput = qs(`color${dayIndex}`);
    if (colorInput && colorInput.value) {
      addColorToLab(colorInput.value);
    }
  };

  // Handle template file import
  window.handleTemplateImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let colors = [];
        const content = e.target.result;

        if (file.name.endsWith('.json')) {
          const jsonData = JSON.parse(content);
          if (Array.isArray(jsonData)) {
            colors = jsonData;
          } else if (jsonData.colors && Array.isArray(jsonData.colors)) {
            colors = jsonData.colors;
          } else if (jsonData.template && Array.isArray(jsonData.template)) {
            colors = jsonData.template;
          }
        } else {
          // Plain text file - extract hex colors
          colors = extractColorsFromText(content);
        }

        if (colors.length === 0) {
          alert('No valid colors found in the file. Please ensure the file contains hex color codes.');
          return;
        }

        await importColorsToLab(colors, file.name);
      } catch (error) {
        console.error('Error importing template:', error);
        alert("Error reading file. Please ensure it's a valid JSON or text file with hex colors.");
      }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
  };

  // Import colors from text input
  window.importFromText = async () => {
    const textInput = document.getElementById('templateTextInput');
    if (!textInput.value.trim()) return;

    const colors = extractColorsFromText(textInput.value);
    if (colors.length === 0) {
      alert('No valid hex colors found. Please enter colors in format #RRGGBB or RRGGBB.');
      return;
    }

    await importColorsToLab(colors, 'text input');
    textInput.value = '';
  };

  // Extract colors from text content
  function extractColorsFromText(text) {
    const hexPattern = /#?([0-9A-Fa-f]{6})/g;
    const matches = [];
    let match;

    while ((match = hexPattern.exec(text)) !== null) {
      const color = '#' + match[1].toUpperCase();
      if (!matches.includes(color)) {
        matches.push(color);
      }
    }

    return matches;
  }

  // Import colors to the color lab
  async function importColorsToLab(colors, sourceName) {
    if (confirm(`Add ${colors.length} colors from ${sourceName} to your color lab?`)) {
      let addedCount = 0;
      for (const color of colors) {
        if (!customColors.includes(color.toUpperCase())) {
          await addColorToLab(color);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        alert(`Successfully added ${addedCount} new colors to your color lab!`);
      } else {
        alert('All colors from this template are already in your color lab.');
      }
    }
  }
})();

