// Feature Registry - Manages modular features for the calendar extension
(function () {
  // Global feature registry
  window.cc3Features = {
    features: new Map(),
    settings: {},
    initialized: false,

    // Register a feature
    register: async function (feature) {
      if (!feature.id) {
        console.warn('Feature missing ID:', feature);
        return;
      }
      this.features.set(feature.id, feature);

      // If already booted, initialize this feature immediately
      if (this.initialized && this.settings[feature.id]) {
        await this.initFeature(feature, this.settings[feature.id]);
      }
    },

    // Initialize a single feature
    initFeature: async function (feature, settings) {
      try {
        if (typeof feature.init === 'function') {
          await feature.init(settings);
        }
      } catch (error) {
        console.error('Error initializing feature:', feature.id, error);
      }
    },

    // Boot all registered features
    boot: async function () {
      if (this.initialized) return;

      // Load settings from storage
      try {
        const rawSettings = await window.cc3Storage.getAll();

        // Handle nested settings structure - settings might be inside a 'settings' property
        if (rawSettings && rawSettings.settings) {
          this.settings = rawSettings.settings;
        } else {
          this.settings = rawSettings || {};
        }

        // If settings are empty or missing, try to load them again
        if (!this.settings || Object.keys(this.settings).length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const retrySettings = await window.cc3Storage.getAll();
          if (retrySettings && retrySettings.settings) {
            this.settings = retrySettings.settings;
          } else {
            this.settings = retrySettings || {};
          }
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        this.settings = {};
      }

      // Initialize all registered features
      for (const [id, feature] of this.features) {
        // Get feature settings - the settings are stored as a flat object with all features
        let featureSettings = {};

        // For dayColoring, the settings are stored directly in the main settings object
        if (id === 'dayColoring') {
          featureSettings = this.settings;
        } else if (this.settings[id]) {
          featureSettings = this.settings[id];
        }

        await this.initFeature(feature, featureSettings);
      }

      this.initialized = true;
    },

    // Update settings for a feature
    updateFeature: function (featureId, newSettings) {
      const feature = this.features.get(featureId);
      if (!feature) {
        console.warn('Feature not found:', featureId);
        return;
      }

      // For dayColoring, settings are stored at root level, so merge with existing settings
      if (featureId === 'dayColoring') {
        // Merge new settings with existing settings to preserve all properties
        // But prioritize the new settings over defaults to respect user choices
        const merged = { ...this.settings, ...newSettings };

        // Special handling for enabled flag - if explicitly set to false, respect it
        if (newSettings.hasOwnProperty('enabled')) {
          merged.enabled = newSettings.enabled;
        }

        this.settings = merged;
      } else {
        // For other features, replace the feature-specific settings
        this.settings[featureId] = newSettings;
      }

      // Notify feature of settings change - pass appropriate settings structure
      try {
        let settingsToPass;
        if (featureId === 'dayColoring') {
          settingsToPass = this.settings;
        } else {
          settingsToPass = newSettings;
        }
        if (typeof feature.onSettingsChanged === 'function') {
          feature.onSettingsChanged(settingsToPass);
        } else if (typeof feature.init === 'function') {
          // Fallback: re-initialize if no onSettingsChanged method
          feature.init(settingsToPass);
        }
      } catch (error) {
        console.error('Error updating feature:', featureId, error);
      }
    },

    // Get current settings for a feature
    getSettings: function (featureId) {
      return this.settings[featureId] || {};
    },

    // Get all settings
    getAllSettings: function () {
      return { ...this.settings };
    },

    // Save settings to storage
    saveSettings: async function (featureId, settings) {
      try {
        this.settings[featureId] = settings;
        await window.cc3Storage.set(featureId, settings);
        this.updateFeature(featureId, settings);
        return true;
      } catch (error) {
        console.error('Error saving settings for feature:', featureId, error);
        return false;
      }
    },

    // Save all settings
    saveAllSettings: async function () {
      try {
        for (const [featureId, settings] of Object.entries(this.settings)) {
          await window.cc3Storage.set(featureId, settings);
        }
        return true;
      } catch (error) {
        console.error('Error saving all settings:', error);
        return false;
      }
    },
  };
})();
