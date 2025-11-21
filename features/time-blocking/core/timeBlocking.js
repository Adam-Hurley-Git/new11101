// Time Blocking Core Module
// Handles the core logic for rendering time blocks on calendar
(function () {
  // Day mappings
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY_NAMES = {
    sun: 'Sunday',
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
  };

  // Color manipulation utilities (simplified from reference extension)
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Core functionality
  const core = {
    settings: null,
    tooltipEl: null,

    // Initialize core module
    init: function (settings) {
      this.settings = settings || {};
      this.createTooltipElement();
    },

    // Create tooltip element for labels
    createTooltipElement: function () {
      if (this.tooltipEl) return;

      this.tooltipEl = document.createElement('div');
      this.tooltipEl.id = 'cc3-timeblock-tooltip';
      this.tooltipEl.style.cssText = `
				position: absolute;
				z-index: 9999;
				background: white;
				border: 1px solid #ccc;
				border-radius: 6px;
				padding: 6px 10px;
				box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
				pointer-events: none;
				font-size: 0.9rem;
				display: none;
				font-family: system-ui, -apple-system, sans-serif;
				max-width: 200px;
				word-wrap: break-word;
			`;
      document.body.appendChild(this.tooltipEl);
    },

    // Main render function
    render: function (forceRender = false) {
      if (!this.settings?.enabled) return;

      // Check current view
      const viewKey = document.querySelector('body')?.getAttribute('data-viewkey');
      if (!['DAY', 'WEEK', 'CUSTOM_DAYS'].includes(viewKey)) {
        return;
      }

      // Find all calendar day containers
      const dayContainers = document.querySelectorAll('div[data-datekey]:not([jsaction])');

      for (const container of dayContainers) {
        this.renderDayBlocks(container, forceRender);
      }
    },

    // Force complete re-render (bypasses optimizations)
    forceRender: function () {
      this.render(true);
    },

    // Render blocks for a specific day container
    renderDayBlocks: function (container, forceRender = false) {
      const dateKey = container.getAttribute('data-datekey');
      if (!dateKey) return;

      // Parse datekey to get actual date
      const dateKeyInt = parseInt(dateKey);
      const year = (dateKeyInt >> 9) + 1970;
      const month = ((dateKeyInt & 511) >> 5) - 1; // 0-based
      const day = dateKeyInt & 31;

      const date = new Date(year, month, day);
      const dayKey = DAY_KEYS[date.getDay()]; // Keep Sun=0 format for storage

      // Get date string in YYYY-MM-DD format for date-specific blocks
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Get time blocks for this day from both weekly schedule and date-specific blocks
      const weeklyBlocks = this.settings.weeklySchedule?.[dayKey] || [];
      const dateSpecificBlocks = this.settings.dateSpecificSchedule?.[dateString] || [];

      // Combine both types of blocks - date-specific blocks take priority
      let allBlocks = [...weeklyBlocks, ...dateSpecificBlocks];

      // Sort combined blocks by start time
      allBlocks.sort((a, b) => {
        const timeToMinutes = (time) => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };
        return timeToMinutes(a.timeRange[0]) - timeToMinutes(b.timeRange[0]);
      });

      // Add metadata to distinguish block types for cleanup
      const combinedBlocks = [
        ...weeklyBlocks.map((block) => ({ ...block, blockType: 'weekly' })),
        ...dateSpecificBlocks.map((block) => ({ ...block, blockType: 'dateSpecific' })),
      ];

      // Sort combined blocks by start time
      combinedBlocks.sort((a, b) => {
        const timeToMinutes = (time) => {
          const [hours, minutes] = time.split(':').map(Number);
          return hours * 60 + minutes;
        };
        return timeToMinutes(a.timeRange[0]) - timeToMinutes(b.timeRange[0]);
      });

      if (combinedBlocks.length === 0) {
        // Clean existing blocks if no blocks should exist
        this.cleanupDayBlocks(container, dayKey, dateString);
        return;
      }

      // Check if container already has the correct blocks to avoid unnecessary updates
      // Skip this optimization if forceRender is true
      if (!forceRender) {
        const existingBlocks = container.querySelectorAll(`.cc3-timeblock-${dayKey}, .cc3-timeblock-date`);
        if (existingBlocks.length === combinedBlocks.length) {
          // Verify blocks are correct by checking their data
          let allCorrect = true;
          for (let i = 0; i < combinedBlocks.length; i++) {
            const existingBlock = existingBlocks[i];
            const expectedRange = `${combinedBlocks[i].timeRange[0]}-${combinedBlocks[i].timeRange[1]}`;
            if (!existingBlock || existingBlock.dataset.timeRange !== expectedRange) {
              allCorrect = false;
              break;
            }
          }
          if (allCorrect) {
            return; // Skip render if blocks are already correct
          }
        }
      }

      // Clean existing time blocks for this day only if we need to rebuild
      this.cleanupDayBlocks(container, dayKey, dateString);

      // Calculate time scale - account for calendar padding/margins
      const containerHeight = container.offsetHeight;
      let pixelsPerHour = containerHeight / 24;

      // For week/day views, try to find the time grid for more accurate positioning
      const timeGrid = container.querySelector('[role="grid"], .Y0LGAe');
      if (timeGrid) {
        const gridHeight = timeGrid.offsetHeight;
        if (gridHeight > 0) {
          pixelsPerHour = gridHeight / 24;
        }
      }

      // Render each block
      combinedBlocks.forEach((block, index) => {
        this.renderTimeBlock(container, block, pixelsPerHour, dayKey, index, dateString);
      });
    },

    // Render a single time block
    renderTimeBlock: function (container, block, pixelsPerHour, dayKey, index, dateString) {
      const { timeRange, color, label, blockType, style } = block;
      const [startTime, endTime] = timeRange;

      // Parse times
      const startDate = new Date(`1970-01-01T${startTime}Z`);
      const endDate = new Date(`1970-01-01T${endTime}Z`);

      const startMinutes = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();
      const endMinutes = endDate.getUTCHours() * 60 + endDate.getUTCMinutes();

      // Calculate positions
      const topPos = (startMinutes / 60) * pixelsPerHour;
      const height = ((endMinutes - startMinutes) / 60) * pixelsPerHour;

      if (height <= 0) {
        console.warn(`Invalid time block: ${startTime} - ${endTime}`);
        return;
      }

      // Create block element
      const blockEl = document.createElement('div');

      // Different class names for different block types
      if (blockType === 'dateSpecific') {
        blockEl.className = `cc3-timeblock cc3-timeblock-date`;
        blockEl.dataset.dateString = dateString;
      } else {
        blockEl.className = `cc3-timeblock cc3-timeblock-${dayKey}`;
      }

      blockEl.dataset.blockIndex = index;
      blockEl.dataset.timeRange = `${startTime}-${endTime}`;
      blockEl.dataset.blockType = blockType || 'weekly';

      // Determine final color and style
      const finalColor = color || this.settings.globalColor || '#FFEB3B';
      const finalStyle = style || this.settings.shadingStyle || 'solid';

      // Apply styles
      this.applyBlockStyles(blockEl, topPos, height, finalColor, label, finalStyle);

      // Add label tooltip if present
      if (label) {
        this.addTooltip(blockEl, label, finalColor);
      }

      // Add to container
      container.appendChild(blockEl);
    },

    // Apply styles to time block element
    applyBlockStyles: function (blockEl, topPos, height, color, label, style) {
      // Ensure container has relative positioning
      const container = blockEl.parentElement;
      if (container) {
        const containerStyle = window.getComputedStyle(container);
        if (containerStyle.position === 'static') {
          container.style.position = 'relative';
        }
      }

      // Use individual style properties for better stability
      blockEl.style.width = 'calc(100% - 4px)';
      blockEl.style.position = 'absolute';
      blockEl.style.left = '2px';
      blockEl.style.top = topPos + 'px';
      blockEl.style.height = Math.max(height - 2, 2) + 'px';
      blockEl.style.pointerEvents = 'none';
      blockEl.style.zIndex = '1';
      blockEl.style.borderRadius = '3px';
      blockEl.style.boxSizing = 'border-box';
      blockEl.style.overflow = 'visible';
      blockEl.style.transition = 'none';

      // Set CSS variables that the CSS file will use
      blockEl.style.setProperty('--cc3-block-color', color);
      blockEl.style.setProperty('--cc3-block-opacity', '1');

      // Use per-block style with fallback to global setting
      const blockStyle = style || this.settings.shadingStyle || 'solid';

      if (blockStyle === 'solid') {
        // Force background via multiple methods
        blockEl.style.setProperty('background-color', color, 'important');
        blockEl.style.setProperty('background', color, 'important');
        blockEl.style.setProperty('opacity', '1', 'important');
        blockEl.style.setProperty('border', `1px solid ${color}`, 'important');
      } else {
        // Hashed pattern
        const encodedColor = encodeURIComponent(color);
        const hashedPattern = `url("data:image/svg+xml;charset=utf8,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22nonzero%22%3E%3Cpath%20fill%3D%22none%22%20d%3D%22M0%200h12v12H0z%22%2F%3E%3Cpath%20d%3D%22M6%200h6L0%2012V6l6-6zm6%206v6H6l6-6z%22%20fill%3D%22${encodedColor}%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`;

        blockEl.style.setProperty('background', hashedPattern + ' transparent repeat', 'important');
        blockEl.style.setProperty('background-color', 'transparent', 'important');
        blockEl.style.setProperty('opacity', '1', 'important');
        blockEl.style.setProperty('border', `1px solid ${color}`, 'important');
      }

      // Add label displays if label exists
      if (label && label.trim()) {
        this.addLabelDisplays(blockEl, label, color, height);
      }

      // Force the element to stay visible with data attribute
      blockEl.setAttribute('data-cc3-timeblock', 'true');
    },

    // Add label displays to timeblock
    addLabelDisplays: function (blockEl, label, color, height) {
      // Clear existing labels
      const existingLabels = blockEl.querySelectorAll('.cc3-label-horizontal, .cc3-label-vertical');
      existingLabels.forEach((el) => el.remove());

      // Calculate text color for contrast
      const getContrastColor = (hexColor) => {
        // Convert hex to RGB
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);

        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Return white for dark colors, dark for light colors
        return luminance > 0.5 ? '#333' : '#fff';
      };

      const textColor = getContrastColor(color);

      // Horizontal label across the top
      const horizontalLabel = document.createElement('div');
      horizontalLabel.className = 'cc3-label-horizontal';
      horizontalLabel.textContent = label;
      horizontalLabel.style.cssText = `
				position: absolute;
				top: 2px;
				left: 4px;
				right: 4px;
				font-size: 12px;
				font-weight: 600;
				color: ${textColor};
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
				line-height: 1;
				pointer-events: none;
			`;

      // Vertical label on the right side (only if block is tall enough)
      if (height > 30) {
        const verticalLabel = document.createElement('div');
        verticalLabel.className = 'cc3-label-vertical';
        verticalLabel.textContent = label;
        verticalLabel.style.cssText = `
					position: absolute;
					top: 50%;
					right: 3px;
					font-size: 12px;
					font-weight: 600;
					color: ${textColor};
					white-space: nowrap;
					writing-mode: vertical-rl;
					text-orientation: mixed;
					transform: translateY(-50%) translateX(50%);
					transform-origin: right center;
					max-height: calc(100% - 8px);
					overflow: hidden;
					pointer-events: none;
					opacity: 1;
				`;
        blockEl.appendChild(verticalLabel);
      }

      blockEl.appendChild(horizontalLabel);
    },

    // Add tooltip functionality to block
    addTooltip: function (blockEl, label, color) {
      blockEl.style.pointerEvents = 'auto';
      blockEl.style.cursor = 'help';

      const showTooltip = (e) => {
        if (!this.tooltipEl) return;

        // Escape HTML in label to prevent XSS
        const escapedLabel = label.replace(/[&<>"']/g, function (match) {
          const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          };
          return escapeMap[match];
        });

        this.tooltipEl.innerHTML = `
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 6px; color: ${color};">
						<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>
						<circle cx="7.5" cy="7.5" r="1.5" fill="white"/>
					</svg>
					<span>${escapedLabel}</span>
				`;
        this.tooltipEl.style.display = 'block';

        // Position tooltip with bounds checking
        const tooltipRect = this.tooltipEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let top = e.pageY - tooltipRect.height - 10;
        let left = e.pageX + 10;

        // Adjust if tooltip would go off screen
        if (left + tooltipRect.width > viewportWidth) {
          left = e.pageX - tooltipRect.width - 10;
        }
        if (top < window.scrollY) {
          top = e.pageY + 10;
        }

        this.tooltipEl.style.top = `${top}px`;
        this.tooltipEl.style.left = `${left}px`;
      };

      const moveTooltip = (e) => {
        if (!this.tooltipEl || this.tooltipEl.style.display === 'none') return;

        const tooltipRect = this.tooltipEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth;

        let top = e.pageY - tooltipRect.height - 10;
        let left = e.pageX + 10;

        if (left + tooltipRect.width > viewportWidth) {
          left = e.pageX - tooltipRect.width - 10;
        }
        if (top < window.scrollY) {
          top = e.pageY + 10;
        }

        this.tooltipEl.style.top = `${top}px`;
        this.tooltipEl.style.left = `${left}px`;
      };

      const hideTooltip = () => {
        if (this.tooltipEl) {
          this.tooltipEl.style.display = 'none';
        }
      };

      blockEl.addEventListener('mouseenter', showTooltip);
      blockEl.addEventListener('mousemove', moveTooltip);
      blockEl.addEventListener('mouseleave', hideTooltip);
    },

    // Clean up existing blocks for a day
    cleanupDayBlocks: function (container, dayKey, dateString) {
      // Clean up both weekly blocks and date-specific blocks
      const weeklyBlocks = container.querySelectorAll(`.cc3-timeblock-${dayKey}`);
      weeklyBlocks.forEach((block) => block.remove());

      if (dateString) {
        const dateBlocks = container.querySelectorAll(`.cc3-timeblock-date[data-date-string="${dateString}"]`);
        dateBlocks.forEach((block) => block.remove());
      } else {
        // If no specific date, clean all date-specific blocks in this container
        const allDateBlocks = container.querySelectorAll(`.cc3-timeblock-date`);
        allDateBlocks.forEach((block) => block.remove());
      }
    },

    // Update colors of existing blocks without full re-render
    updateBlockColors: function () {
      if (!this.settings?.enabled) return;

      document.querySelectorAll('.cc3-timeblock').forEach((blockEl) => {
        const container = blockEl.parentElement;
        if (!container) return;

        const dateKey = container.getAttribute('data-datekey');
        if (!dateKey) return;

        // Parse datekey to get day and date
        const dateKeyInt = parseInt(dateKey);
        const year = (dateKeyInt >> 9) + 1970;
        const month = ((dateKeyInt & 511) >> 5) - 1;
        const day = dateKeyInt & 31;
        const date = new Date(year, month, day);
        const dayKey = DAY_KEYS[date.getDay()];
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Get the block index and type from the element
        const blockIndex = parseInt(blockEl.dataset.blockIndex);
        const blockType = blockEl.dataset.blockType || 'weekly';

        let block = null;
        if (blockType === 'dateSpecific') {
          const dateBlocks = this.settings.dateSpecificSchedule?.[dateString] || [];
          block = dateBlocks[blockIndex];
        } else {
          const dayBlocks = this.settings.weeklySchedule?.[dayKey] || [];
          block = dayBlocks[blockIndex];
        }

        if (block) {
          // Determine new color and style
          const finalColor = block.color || this.settings.globalColor || '#FFEB3B';
          const finalStyle = block.style || this.settings.shadingStyle || 'solid';

          // Update block styles with new color
          this.applyBlockStyles(
            blockEl,
            parseFloat(blockEl.style.top),
            parseFloat(blockEl.style.height),
            finalColor,
            block.label,
            finalStyle,
          );

          // Update tooltip color if it has a label
          if (block.label) {
            // Remove old tooltip listeners and add new ones with updated color
            const newBlockEl = blockEl.cloneNode(true);
            blockEl.parentNode.replaceChild(newBlockEl, blockEl);
            this.addTooltip(newBlockEl, block.label, adjustedColor);
          }
        }
      });
    },

    // Clean up all blocks
    cleanup: function () {
      // Remove all time blocks
      document.querySelectorAll('.cc3-timeblock').forEach((block) => block.remove());

      // Remove tooltip
      if (this.tooltipEl) {
        this.tooltipEl.remove();
        this.tooltipEl = null;
      }
    },
  };

  // Expose globally
  window.cc3TimeBlocking = window.cc3TimeBlocking || {};
  window.cc3TimeBlocking.core = core;
})();
