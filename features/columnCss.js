(function () {
  const STYLE_ID = 'cc3_daily_styles';

  function ensureStyle(id) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.documentElement.appendChild(el);
    }
    return el;
  }

  function removeStyle(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

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

  function buildGridScopedVariables(settings) {
    // Map each visible grid's column position to the correct weekday color
    const grids = document.querySelectorAll("[role='grid'] > [data-start-date-key]");
    let css = '';
    grids.forEach((grid) => {
      const start = grid.getAttribute('data-start-date-key');
      const headerContainer = grid.querySelector(":scope > [role='presentation']");
      const headers = headerContainer ? headerContainer.querySelectorAll(":scope > [role='columnheader']") : [];
      let numDays = 0;
      if (headers.length >= 8)
        numDays = 7; // includes gutter
      else if (headers.length >= 6) numDays = 5;
      else if (headers.length >= 2) numDays = 1;
      if (!start || numDays === 0) return;
      const vars = [];
      for (let pos = 0; pos < numDays; pos++) {
        // Compute date for this position
        let y, m, d;
        if (/\d{4}-\d{2}-\d{2}/.test(start)) {
          [y, m, d] = start.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          dt.setDate(dt.getDate() + pos);
          const wd = dt.getDay();
          const bg = settings.weekdayColors?.[String(wd)] || '#ffffff';
          const fg = getTextColorForBg(bg);
          vars.push(`--cc3-pos-bg-${pos}: ${hexToRgba(bg, 0.3)}; --cc3-pos-fg-${pos}: ${fg};`);
        }
      }
      css += `\n[role='grid'] > [data-start-date-key='${start}']{${vars.join(' ')}}`;
    });
    return css;
  }

  // Note: Month view coloring is handled by the monthColoring.js module
  // which uses direct cell painting instead of CSS nth-child selectors

  let updateQueued = false;
  function scheduleApply(settings) {
    if (updateQueued) return;
    updateQueued = true;
    const run = () => {
      updateQueued = false;
      applyStyles(settings);
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 300 });
    } else {
      setTimeout(run, 50);
    }
  }

  function applyStyles(settings) {
    if (!settings?.enabled) {
      removeStyle(STYLE_ID);
      return;
    }
    // Skip if dayColoring feature is enabled to avoid conflicts
    const dayColoringSettings = window.cc3Features?.getSettings('dayColoring');
    if (dayColoringSettings?.enabled) {
      removeStyle(STYLE_ID);
      console.log('columnCss: Skipping due to dayColoring being enabled');
      return;
    }
    const style = ensureStyle(STYLE_ID);
    const gridVars = buildGridScopedVariables(settings);
    style.textContent = gridVars;
  }

  const feature = {
    id: 'columnCss',
    init: (settings) => {
      applyStyles(settings);
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.matches?.('[data-start-date-key]') || n.querySelector?.('[data-start-date-key]')) {
              scheduleApply(settings);
              return;
            }
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    },
    onSettingsChanged: (settings) => scheduleApply(settings),
  };

  window.cc3Features.register(feature);
})();
