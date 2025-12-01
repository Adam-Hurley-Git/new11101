// SHARED UTILITIES FOR ALL FEATURES
// Common functions that can be used by any feature

(function () {
  // === DOM UTILITIES ===
  function ensureStyleElement(id) {
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    return style;
  }

  function removeStyleElement(id) {
    const style = document.getElementById(id);
    if (style) style.remove();
  }

  // === COLOR UTILITIES ===
  function hexToRgb(hex) {
    if (!hex) return { r: 255, g: 255, b: 255 };
    const v = hex.replace('#', '');
    const n =
      v.length === 3
        ? v
            .split('')
            .map((c) => c + c)
            .join('')
        : v;
    const num = parseInt(n, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function relativeLuminance({ r, g, b }) {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function getTextColorForBg(hex) {
    const L = relativeLuminance(hexToRgb(hex || '#ffffff'));
    return L > 0.6 ? '#111111' : '#ffffff';
  }

  function hexToRgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex || '#ffffff');
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // === DATE UTILITIES ===
  function normalizeYmdFromDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // === OBSERVER UTILITIES ===
  function createDebouncedObserver(callback, delay = 100) {
    let timeout = null;
    return new MutationObserver((mutations) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => callback(mutations), delay);
    });
  }

  // === STORAGE UTILITIES ===
  async function loadFeatureSettings(featureId) {
    try {
      if (!window.cc3Storage) return {};
      const rawSettings = await window.cc3Storage.getAll();

      // Handle nested settings structure
      if (rawSettings && rawSettings.settings) {
        return rawSettings.settings[featureId] || {};
      } else {
        return rawSettings[featureId] || {};
      }
    } catch (error) {
      console.error('Error loading settings for feature:', featureId, error);
      return {};
    }
  }

  // === FEATURE REGISTRATION UTILITIES ===
  function createFeatureTemplate(featureId, options = {}) {
    const { initFunction = () => {}, onSettingsChanged = () => {}, teardown = () => {} } = options;

    return {
      id: featureId,
      init: async (settings) => {
        console.log(`=== INITIALIZING FEATURE: ${featureId} ===`);

        // Load settings if not provided
        if (!settings || Object.keys(settings).length === 0) {
          settings = await loadFeatureSettings(featureId);
        }

        // Initialize the feature
        await initFunction(settings);

        console.log(`=== FEATURE INITIALIZED: ${featureId} ===`);
      },
      onSettingsChanged: (settings) => {
        console.log(`Feature settings changed: ${featureId}`, settings);
        onSettingsChanged(settings);
      },
      teardown: () => {
        console.log(`Feature teardown: ${featureId}`);
        teardown();
      },
    };
  }

  // === CUSTOM COLOR PICKER UTILITIES ===
  function createCustomColorPicker(options = {}) {
    const {
      initialColor = '#4285f4',
      openDirection = 'down', // 'up' or 'down'
      position = 'popup', // 'popup' or 'modal'
      enableTabs = true,
      inlineColors = null, // Custom inline colors from settings
      onColorChange = () => {},
      onApply = () => {},
      onClear = () => {},
    } = options;

    // Create container
    const container = document.createElement('div');
    container.className = 'cf-custom-color-picker-container';
    container.style.cssText = `
			position: relative;
			display: flex;
			align-items: center;
			gap: 8px;
		`;

    // Create trigger button (color preview + icon)
    const trigger = document.createElement('div');
    trigger.className = 'cf-color-picker-trigger';
    trigger.style.cssText = `
			width: 37px;
			height: 37px;
			border: 2px solid #dadce0;
			border-radius: 50%;
			cursor: pointer;
			background-color: ${initialColor};
			position: relative;
			transition: all 0.2s ease;
			display: flex;
			align-items: center;
			justify-content: center;
		`;

    // Create trigger icon
    const triggerIcon = document.createElement('div');
    triggerIcon.textContent = '🎨';
    triggerIcon.style.cssText = `
			font-size: 16px;
			pointer-events: none;
		`;
    trigger.appendChild(triggerIcon);

    // Create picker panel
    const pickerPanel = document.createElement('div');
    pickerPanel.className = 'cf-color-picker-panel';
    const positionStyles =
      position === 'modal' && openDirection === 'up'
        ? `
			position: fixed;
			bottom: auto;
			top: auto;
			left: 0;
			transform: none;
			margin-bottom: 8px;
		`
        : `
			position: absolute;
			top: 100%;
			left: 0;
			transform: none;
			margin-top: 8px;
		`;

    pickerPanel.style.cssText = `
			${positionStyles}
			background: #ffffff;
			border: 1px solid #dadce0;
			border-radius: 8px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.15);
			padding: 0;
			width: 320px;
			height: 280px;
			display: none;
			z-index: 999999 !important;
			overflow: hidden;
			visibility: hidden;
		`;

    let currentColor = initialColor;
    let isOpen = false;

    // Exact color palettes from popup.js matching the extension popup
    const colorPalettes = {
      vibrant: [
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
        '#8bc34a',
        '#4caf50',
        // Green family
        '#009688',
        '#00bcd4',
        '#03a9f4',
        '#2196f3',
        // Blue family
        '#3f51b5',
        '#673ab7',
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
        // Black and white
        '#000000',
        '#ffffff',
      ],
      pastel: [
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
        '#a5d6a7',
        '#81c784',
        '#66bb6a',
        '#4db6ac',
        '#4dd0e1',
        // Blue pastels
        '#81d4fa',
        '#64b5f6',
        '#42a5f5',
        '#9fa8da',
        '#b39ddb',
        // Light pastels
        '#fff9c4',
        '#fff59d',
        '#fff176',
        '#ffcc02',
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
      ],
      dark: [
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
        '#3949ab',
        '#3f51b5',
        '#303f9f',
        '#1a237e',
        '#0d47a1',
        // Dark cyans
        '#1976d2',
        '#1565c0',
        '#0277bd',
        '#01579b',
        '#006064',
        // Dark teals/greens
        '#00695c',
        '#00796b',
        '#00838f',
        '#0097a7',
        '#1b5e20',
        // Dark greens
        '#2e7d32',
        '#388e3c',
        '#43a047',
        '#558b2f',
        '#689f38',
        // Dark oranges/browns
        '#7cb342',
        '#827717',
        '#9e9d24',
        '#f57f17',
        '#ff6f00',
        // Dark accent colors
        '#e65100',
        '#d84315',
        '#bf360c',
        '#3e2723',
        '#424242',
        '#263238',
      ],
    };

    // Create header with tabs (fixed at top)
    const pickerHeader = document.createElement('div');
    pickerHeader.style.cssText = `
			background: #f8f9fa;
			border-radius: 8px 8px 0 0;
			border-bottom: 1px solid #e0e0e0;
			flex-shrink: 0;
		`;

    // Create scrollable content area
    const pickerContent = document.createElement('div');
    pickerContent.style.cssText = `
			flex: 1;
			overflow-y: auto;
			padding: 12px;
		`;

    // Create tabs if enabled
    if (enableTabs) {
      const tabsContainer = document.createElement('div');
      tabsContainer.className = 'cf-color-picker-tabs';
      tabsContainer.style.cssText = `
				display: flex;
				background: transparent;
			`;

      const tabs = ['vibrant', 'pastel', 'dark', 'custom'];
      tabs.forEach((tabName, index) => {
        const tab = document.createElement('button');
        tab.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);
        tab.className = `cf-color-tab ${index === 0 ? 'active' : ''}`;
        tab.style.cssText = `
					flex: 1;
					padding: 8px 12px;
					border: none;
					background: ${index === 0 ? '#ffffff' : 'transparent'};
					cursor: pointer;
					font-size: 12px;
					font-weight: 500;
					color: ${index === 0 ? '#1a73e8' : '#5f6368'};
					border-radius: ${index === 0 ? '8px 0 0 0' : index === tabs.length - 1 ? '0 8px 0 0' : '0'};
					transition: all 0.2s ease;
				`;

        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          // Update active tab
          tabsContainer.querySelectorAll('.cf-color-tab').forEach((t) => {
            t.classList.remove('active');
            t.style.background = 'transparent';
            t.style.color = '#5f6368';
          });
          tab.classList.add('active');
          tab.style.background = '#ffffff';
          tab.style.color = '#1a73e8';

          // Update active panel
          pickerContent.querySelectorAll('.cf-color-tab-panel').forEach((p) => {
            p.style.display = 'none';
          });
          const activePanel = pickerContent.querySelector(`#cf-${tabName}-panel`);
          if (activePanel) {
            activePanel.style.display = 'block';
          }
        });

        tabsContainer.appendChild(tab);
      });

      pickerHeader.appendChild(tabsContainer);
    }

    // Set up panel structure
    pickerPanel.style.display = 'flex';
    pickerPanel.style.flexDirection = 'column';
    pickerPanel.appendChild(pickerHeader);
    pickerPanel.appendChild(pickerContent);

    // Create tab panels
    Object.entries(colorPalettes).forEach(([paletteName, colors], paletteIndex) => {
      const panel = document.createElement('div');
      panel.id = `cf-${paletteName}-panel`;
      panel.className = 'cf-color-tab-panel';
      panel.style.cssText = `
				display: ${paletteIndex === 0 ? 'block' : 'none'};
				margin-bottom: 8px;
			`;

      const colorGrid = document.createElement('div');
      colorGrid.className = 'color-palette';
      colorGrid.style.cssText = `
				display: grid;
				grid-template-columns: repeat(6, 1fr);
				gap: 4px;
				margin-bottom: 8px;
				padding: 4px;
			`;

      colors.forEach((color) => {
        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'color-swatch';
        colorSwatch.style.cssText = `
					width: 28px;
					height: 28px;
					border: 2px solid #e0e0e0;
					border-radius: 4px;
					background-color: ${color};
					cursor: pointer;
					transition: all 0.2s ease;
					position: relative;
				`;
        colorSwatch.title = color;

        colorSwatch.addEventListener('click', (e) => {
          e.stopPropagation();

          // Remove selected class from all swatches in this picker
          pickerPanel.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
          // Add selected class to clicked swatch
          colorSwatch.classList.add('selected');

          currentColor = color;
          trigger.style.backgroundColor = color;
          onColorChange(color);
        });

        colorSwatch.addEventListener('mouseover', () => {
          colorSwatch.style.transform = 'scale(1.1)';
          colorSwatch.style.borderColor = '#1a73e8';
          colorSwatch.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        });

        colorSwatch.addEventListener('mouseout', () => {
          colorSwatch.style.transform = 'scale(1)';
          colorSwatch.style.borderColor = '#e0e0e0';
          colorSwatch.style.boxShadow = 'none';
        });

        colorGrid.appendChild(colorSwatch);
      });

      panel.appendChild(colorGrid);
      pickerContent.appendChild(panel);
    });

    // Create custom color panel
    const customPanel = document.createElement('div');
    customPanel.id = 'cf-custom-panel';
    customPanel.className = 'cf-color-tab-panel';
    customPanel.style.cssText = `
			display: ${enableTabs ? 'none' : 'block'};
			margin-bottom: 8px;
		`;

    // Custom color input container
    const customColorContainer = document.createElement('div');
    customColorContainer.style.cssText = `
			margin-bottom: 8px;
			display: flex;
			gap: 8px;
			align-items: center;
		`;

    const customColorInput = document.createElement('input');
    customColorInput.type = 'color';
    customColorInput.value = currentColor;
    customColorInput.style.cssText = `
			width: 50px;
			height: 36px;
			border: 2px solid #dadce0;
			border-radius: 4px;
			cursor: pointer;
		`;

    const addCustomBtn = document.createElement('button');
    addCustomBtn.textContent = '+ Add to Custom';
    addCustomBtn.style.cssText = `
			padding: 8px 12px;
			border: 1px solid #dadce0;
			border-radius: 4px;
			background: #f8f9fa;
			color: #3c4043;
			cursor: pointer;
			font-size: 11px;
			white-space: nowrap;
		`;

    customColorInput.addEventListener('change', (e) => {
      e.stopPropagation();
      currentColor = e.target.value;
      trigger.style.backgroundColor = currentColor;
      onColorChange(currentColor);
    });

    // Custom colors grid (initially empty, would be populated from storage)
    const customColorsGrid = document.createElement('div');
    customColorsGrid.className = 'color-palette custom-color-palette';
    customColorsGrid.style.cssText = `
			display: grid;
			grid-template-columns: repeat(6, 1fr);
			gap: 4px;
			margin-bottom: 8px;
			padding: 4px;
			min-height: 40px;
			border: 1px solid #e0e0e0;
			border-radius: 4px;
			background: #fafafa;
		`;

    // Add button functionality - integrates with extension's Color Lab storage
    addCustomBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const color = customColorInput.value.toUpperCase();

      // Check if color already exists
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          const result = await chrome.storage.sync.get('customDayColors');
          const customColors = result.customDayColors || [];

          if (!customColors.includes(color)) {
            // Add to storage
            const updatedColors = [...customColors, color];
            await chrome.storage.sync.set({ customDayColors: updatedColors });

            // Create and add the swatch
            const customSwatch = createCustomColorSwatch(color, customColorsGrid);
            customColorsGrid.appendChild(customSwatch);
          }
        }
      } catch (error) {
        console.warn('Could not save custom color to extension storage:', error);
        // Fallback: still create the swatch locally
        const customSwatch = createCustomColorSwatch(color, customColorsGrid);
        customColorsGrid.appendChild(customSwatch);
      }
    });

    customColorContainer.appendChild(customColorInput);
    customColorContainer.appendChild(addCustomBtn);
    customPanel.appendChild(customColorContainer);
    customPanel.appendChild(customColorsGrid);

    // Load existing custom colors from extension storage
    loadExtensionCustomColors(customColorsGrid);

    pickerContent.appendChild(customPanel);

    // Function to load custom colors from extension storage (Color Lab)
    async function loadExtensionCustomColors(grid) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          const result = await chrome.storage.sync.get('customDayColors');
          const customColors = result.customDayColors || [];

          // Clear existing custom colors in grid
          grid.innerHTML = '';

          // Show empty state message if no custom colors
          if (customColors.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'cf-custom-colors-empty-state';
            emptyMessage.style.cssText = `
							grid-column: 1 / -1;
							display: flex;
							flex-direction: column;
							align-items: center;
							justify-content: center;
							padding: 12px 12px;
							text-align: center;
							color: #5f6368;
							font-size: 12px;
							line-height: 1.5;
							min-height: 80px;
							width: 100%;
							box-sizing: border-box;
						`;

            const icon = document.createElement('div');
            icon.textContent = '🎨';
            icon.style.cssText = `
							font-size: 26px;
							margin-bottom: 6px;
							opacity: 0.5;
						`;

            const text = document.createElement('div');
            text.style.cssText = `
							width: 100%;
							margin: 0 auto;
						`;
            text.innerHTML = `
							<div style="font-weight: 600; margin-bottom: 5px; color: #202124; font-size: 12px;">No custom colors yet</div>
							<div style="font-size: 10px; color: #5f6368; line-height: 1.5;">
								Open the extension popup and go to<br>Preferences → Color Lab to add custom colors
							</div>
						`;

            emptyMessage.appendChild(icon);
            emptyMessage.appendChild(text);
            grid.appendChild(emptyMessage);
          } else {
            // Add each custom color as a swatch
            customColors.forEach((color) => {
              const customSwatch = createCustomColorSwatch(color, grid);
              grid.appendChild(customSwatch);
            });
          }
        }
      } catch (error) {
        console.warn('Could not load custom colors from extension storage:', error);
      }
    }

    // Function to create a custom color swatch
    function createCustomColorSwatch(color, grid) {
      const customSwatch = document.createElement('div');
      customSwatch.className = 'color-swatch custom-color-swatch';
      customSwatch.style.cssText = `
				width: 28px;
				height: 28px;
				border: 2px solid #e0e0e0;
				border-radius: 4px;
				background-color: ${color};
				cursor: pointer;
				transition: all 0.2s ease;
				position: relative;
			`;

      customSwatch.addEventListener('mouseover', () => {
        customSwatch.style.transform = 'scale(1.1)';
        customSwatch.style.borderColor = '#1a73e8';
      });

      customSwatch.addEventListener('mouseout', () => {
        customSwatch.style.transform = 'scale(1)';
        customSwatch.style.borderColor = '#e0e0e0';
      });

      customSwatch.addEventListener('click', (e) => {
        e.stopPropagation();
        pickerContent.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
        customSwatch.classList.add('selected');
        currentColor = color;
        trigger.style.backgroundColor = color;
        onColorChange(color);
      });

      return customSwatch;
    }

    // Add CSS styles for selected state
    const styleElement = document.createElement('style');
    styleElement.textContent = `
			.color-swatch.selected {
				border-color: #1a73e8 !important;
				box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2) !important;
				transform: scale(1.05) !important;
			}
		`;
    if (!document.head.querySelector('style[data-cf-color-picker]')) {
      styleElement.setAttribute('data-cf-color-picker', 'true');
      document.head.appendChild(styleElement);
    }

    // Picker open/close logic
    function openPicker() {
      if (isOpen) return;
      isOpen = true;

      // Update custom color input to current color
      customColorInput.value = currentColor;

      // Calculate positioning for modal mode with upward direction
      if (position === 'modal' && openDirection === 'up') {
        const triggerRect = trigger.getBoundingClientRect();
        const modalElement = trigger.closest('[role="dialog"]');
        const modalRect = modalElement ? modalElement.getBoundingClientRect() : { top: 0, left: 0 };

        // Position above trigger with left edge aligned to trigger left edge
        const topPosition = triggerRect.top - 8; // 8px margin above trigger
        const leftPosition = triggerRect.left; // Align left edges

        pickerPanel.style.top = `${topPosition}px`;
        pickerPanel.style.left = `${leftPosition}px`;
        pickerPanel.style.transform = 'translateY(-100%)'; // Only translate Y, not X
      }

      // Show the picker panel
      pickerPanel.style.display = 'flex';
      pickerPanel.style.visibility = 'visible';

      // Add click outside listener
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
      }, 0);
    }

    function closePicker() {
      if (!isOpen) return;
      isOpen = false;
      pickerPanel.style.display = 'none';
      pickerPanel.style.visibility = 'hidden';
      document.removeEventListener('click', handleClickOutside, true);
    }

    function handleClickOutside(e) {
      if (!container.contains(e.target)) {
        closePicker();
      }
    }

    // Trigger click handler
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen) {
        closePicker();
      } else {
        openPicker();
      }
    });

    // Hover effects
    trigger.addEventListener('mouseover', () => {
      trigger.style.borderColor = '#1a73e8';
      trigger.style.transform = 'scale(1.05)';
    });

    trigger.addEventListener('mouseout', () => {
      trigger.style.borderColor = '#dadce0';
      trigger.style.transform = 'scale(1)';
    });

    // Prevent all clicks inside picker from bubbling
    pickerPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Create inline colors (always visible quick access colors)
    const inlineColorsRow = document.createElement('div');
    inlineColorsRow.className = 'cf-inline-colors-row';
    inlineColorsRow.style.cssText = `
			display: flex;
			gap: 4px;
			align-items: center;
		`;

    // Use custom inline colors from settings, or fall back to defaults
    const quickColors = inlineColors || [
      '#4285f4',
      '#34a853',
      '#ea4335',
      '#fbbc04',
      '#ff6d01',
      '#9c27b0',
      '#e91e63',
      '#00bcd4',
    ];
    quickColors.forEach((color) => {
      const quickBtn = document.createElement('button');
      quickBtn.style.cssText = `
				width: 20px;
				height: 20px;
				border: 2px solid #dadce0;
				border-radius: 3px;
				background-color: ${color};
				cursor: pointer;
				transition: all 0.2s ease;
				margin: 0;
				padding: 0;
			`;

      quickBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        currentColor = color;
        trigger.style.backgroundColor = color;
        onColorChange(color);
      });

      quickBtn.addEventListener('mouseover', () => {
        quickBtn.style.transform = 'scale(1.2)';
        quickBtn.style.borderColor = '#1a73e8';
      });

      quickBtn.addEventListener('mouseout', () => {
        quickBtn.style.transform = 'scale(1)';
        quickBtn.style.borderColor = '#dadce0';
      });

      inlineColorsRow.appendChild(quickBtn);
    });

    // Create a wrapper for trigger and picker to maintain relative positioning
    const triggerWrapper = document.createElement('div');
    triggerWrapper.style.cssText = `
			position: relative;
			display: inline-block;
		`;
    triggerWrapper.appendChild(trigger);
    triggerWrapper.appendChild(pickerPanel);

    // Assemble the components
    container.appendChild(triggerWrapper);
    container.appendChild(inlineColorsRow);

    // Return public API
    return {
      container,
      setColor: (color) => {
        currentColor = color;
        trigger.style.backgroundColor = color;
        customColorInput.value = color;
      },
      getColor: () => currentColor,
      open: openPicker,
      close: closePicker,
      destroy: () => {
        document.removeEventListener('click', handleClickOutside, true);
        container.remove();
      },
    };
  }

  // === EXPORT SHARED UTILITIES ===
  window.cc3SharedUtils = {
    // DOM utilities
    ensureStyleElement,
    removeStyleElement,

    // Color utilities
    hexToRgb,
    relativeLuminance,
    getTextColorForBg,
    hexToRgba,

    // Date utilities
    normalizeYmdFromDate,

    // Observer utilities
    createDebouncedObserver,

    // Storage utilities
    loadFeatureSettings,

    // Feature registration utilities
    createFeatureTemplate,

    // Custom color picker utilities
    createCustomColorPicker,
  };

  console.log('Shared utilities loaded for all features');
})();
