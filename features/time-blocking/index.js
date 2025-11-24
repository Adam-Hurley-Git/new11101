// Time Blocking Feature - Main entry point
// Provides visual time blocks on Google Calendar days
(function () {
  const feature = {
    id: 'timeBlocking',
    name: 'Time Blocking',
    version: '1.0.0',

    // Internal state
    state: {
      settings: null,
      observer: null,
      rendered: false,
      messageHandler: null,
    },

    // Initialize the feature
    init: async function (settings) {
      this.state.settings = settings || {};

      // Register message handler first (needed even when disabled to receive enable messages)
      if (!this.state.messageHandler) {
        this.state.messageHandler = (message, sender, sendResponse) => {
          if (message.type === 'timeBlockingChanged') {
            this.onSettingsChanged(message.settings, message.isColorOnlyChange);
            sendResponse({ success: true });
          } else if (message.type === 'timeBlockingColorChanged') {
            // Real-time color updates
            this.state.settings = message.settings;
            this.initializeCore();
            this.updateColors();
            sendResponse({ success: true });
          }
        };
        chrome.runtime.onMessage.addListener(this.state.messageHandler);
      }

      if (!this.state.settings.enabled) {
        // Don't call full cleanup() here - it would remove the message handler
        // Just ensure any rendering artifacts are cleaned up
        if (window.cc3TimeBlocking && window.cc3TimeBlocking.core) {
          window.cc3TimeBlocking.core.cleanup();
        }
        return;
      }

      // Load required modules
      await this.loadModules();

      // Initialize core functionality
      this.initializeCore();

      // Start observing DOM changes
      this.startObserver();
    },

    // Load required modules
    loadModules: async function () {
      // Core modules will be loaded via script tags in manifest
    },

    // Initialize core functionality
    initializeCore: function () {
      if (window.cc3TimeBlocking && window.cc3TimeBlocking.core) {
        window.cc3TimeBlocking.core.init(this.state.settings);
      }
    },

    // Start DOM observer
    startObserver: function () {
      if (this.state.observer) {
        this.state.observer.disconnect();
      }

      // Anti-flicker approach - immediate render with smart throttling
      let renderTimeout = null;
      let isRendering = false;
      const smartRender = () => {
        if (isRendering) return; // Prevent overlapping renders

        // Immediate render for responsiveness
        isRendering = true;
        this.render();
        isRendering = false;

        // Clear any pending renders since we just completed one
        if (renderTimeout) {
          clearTimeout(renderTimeout);
          renderTimeout = null;
        }
      };

      const debouncedRender = () => {
        if (renderTimeout || isRendering) return;
        renderTimeout = setTimeout(() => {
          smartRender();
          renderTimeout = null;
        }, 100); // Faster response
      };

      this.state.observer = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        let hasNewContainers = false;
        let blocksWereRemoved = false;

        for (const mutation of mutations) {
          // Check for new calendar containers
          if (mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains('cc3-timeblock')) {
                // Check for new date containers without blocks
                if (node.matches && node.matches('[data-datekey]') && !node.querySelector('.cc3-timeblock')) {
                  hasNewContainers = true;
                  break;
                }

                // Check for major calendar rebuilds
                if (node.matches && (node.matches('[role="main"]') || node.querySelector('[role="main"]'))) {
                  shouldUpdate = true;
                  break;
                }
              }
            }
          }

          // Check if our blocks were removed
          if (mutation.removedNodes.length > 0) {
            for (const node of mutation.removedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('cc3-timeblock')) {
                blocksWereRemoved = true;
                break;
              }
            }
          }

          if (shouldUpdate) break;
        }

        // Smart update logic - prioritize immediate vs debounced
        if (blocksWereRemoved) {
          // Blocks removed - immediate render to prevent flicker
          smartRender();
        } else if (hasNewContainers || shouldUpdate) {
          // New containers - debounced render
          debouncedRender();
        }
      });

      this.state.observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: false,
      });

      // Initial render
      setTimeout(() => this.render(), 100);

      // Enhanced persistence check for navigation and toggle issues
      this.state.persistenceInterval = setInterval(() => {
        if (this.state.settings?.enabled) {
          const existingBlocks = document.querySelectorAll('.cc3-timeblock');
          const dayContainers = document.querySelectorAll('div[data-datekey]:not([jsaction])');

          // If we have day containers but no blocks, force render
          if (dayContainers.length > 0 && existingBlocks.length === 0) {
            this.forceRender();
          }
        }
      }, 2000); // More frequent check to catch navigation

      // Listen for view changes (navigation between day/week/month)
      this.state.lastViewKey = document.querySelector('body')?.getAttribute('data-viewkey');
      this.state.viewCheckInterval = setInterval(() => {
        if (this.state.settings?.enabled) {
          const currentViewKey = document.querySelector('body')?.getAttribute('data-viewkey');
          if (currentViewKey !== this.state.lastViewKey) {
            this.state.lastViewKey = currentViewKey;
            // Give the UI time to stabilize then force render
            setTimeout(() => this.forceRender(), 500);
          }
        }
      }, 1000);
    },

    // Render time blocks
    render: function () {
      if (!this.state.settings?.enabled) return;

      if (window.cc3TimeBlocking && window.cc3TimeBlocking.core) {
        window.cc3TimeBlocking.core.render();
      }
    },

    // Force render (bypasses optimizations)
    forceRender: function () {
      if (!this.state.settings?.enabled) return;

      if (window.cc3TimeBlocking && window.cc3TimeBlocking.core) {
        window.cc3TimeBlocking.core.forceRender();
      }
    },

    // Handle settings changes
    onSettingsChanged: function (newSettings, isColorOnlyChange = false) {
      this.state.settings = newSettings;

      if (!newSettings.enabled) {
        this.cleanup();
        return;
      }

      // Re-initialize fully when enabling (includes observer restart)
      this.initializeCore();

      // Restart observer if it's not running (needed after toggle off/on)
      if (!this.state.observer) {
        this.startObserver();
      }

      if (isColorOnlyChange && window.cc3TimeBlocking && window.cc3TimeBlocking.core) {
        // Just update colors without full re-render for better performance
        window.cc3TimeBlocking.core.updateBlockColors();
      } else {
        // Force render to ensure blocks appear after toggle
        this.forceRender();
      }
    },

    // Handle just color updates for real-time changes
    updateColors: function () {
      if (!this.state.settings?.enabled) return;

      if (window.cc3TimeBlocking && window.cc3TimeBlocking.core) {
        window.cc3TimeBlocking.core.updateBlockColors();
      }
    },

    // Cleanup
    cleanup: function () {
      if (this.state.observer) {
        this.state.observer.disconnect();
        this.state.observer = null;
      }

      if (this.state.persistenceInterval) {
        clearInterval(this.state.persistenceInterval);
        this.state.persistenceInterval = null;
      }

      if (this.state.viewCheckInterval) {
        clearInterval(this.state.viewCheckInterval);
        this.state.viewCheckInterval = null;
      }

      if (this.state.messageHandler) {
        chrome.runtime.onMessage.removeListener(this.state.messageHandler);
        this.state.messageHandler = null;
      }

      if (window.cc3TimeBlocking && window.cc3TimeBlocking.core) {
        window.cc3TimeBlocking.core.cleanup();
      }
    },
  };

  // Register with feature registry
  if (window.cc3Features) {
    window.cc3Features.register(feature);
  } else {
    console.warn('Feature registry not available for time blocking');
  }
})();
