(function () {
  const state = {
    settings: null,
    collapsed: true,
  };

  function createEl(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    if (props.className) {
      el.setAttribute('class', props.className);
    }
    for (const child of children) {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child) el.appendChild(child);
    }
    return el;
  }

  function renderToolbar() {
    const existing = document.querySelector('.cc3-toolbar');
    if (existing) existing.remove();

    const settings = state.settings;
    if (!settings) return;

    const root = createEl('div', { className: `cc3-toolbar ${state.collapsed ? 'cc3-collapsed' : ''}` });

    // Collapse/expand button
    const collapseBtn = createEl('button', {
      className: 'cc3-collapse-btn',
      innerHTML: state.collapsed ? '▲' : '▼',
    });
    collapseBtn.addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      renderToolbar();
    });

    if (state.collapsed) {
      root.appendChild(collapseBtn);
      document.documentElement.appendChild(root);
      return;
    }

    const row = createEl('div', { className: 'cc3-row' });

    // Day coloring toggle
    const dayToggleLabel = createEl('label', {}, ['Day Colors']);
    const dayToggle = createEl('div', { className: 'cc3-switch' });
    dayToggle.dataset.on = String(Boolean(settings.enabled));
    dayToggle.addEventListener('click', async () => {
      const next = !state.settings?.enabled;
      dayToggle.dataset.on = String(next);

      // Update local state
      state.settings.enabled = next;

      await window.cc3Storage.setEnabled(next);

      // Trigger immediate update for day coloring feature
      const newSettings = await window.cc3Storage.getSettings();
      if (window.cc3Features && window.cc3Features.updateFeature) {
        window.cc3Features.updateFeature('dayColoring', newSettings);
      }
    });
    const dayToggleWrap = createEl('div', { className: 'cc3-toggle' }, [dayToggleLabel, dayToggle]);

    // Task colors toggle
    const taskToggleLabel = createEl('label', {}, ['Task Colors']);
    const taskToggle = createEl('div', { className: 'cc3-switch' });
    taskToggle.dataset.on = String(Boolean(settings.taskColoring?.enabled || false));
    taskToggle.addEventListener('click', async () => {
      const next = !state.settings?.taskColoring?.enabled;
      taskToggle.dataset.on = String(next);

      // Update local state
      if (!state.settings.taskColoring) state.settings.taskColoring = {};
      state.settings.taskColoring.enabled = next;

      await window.cc3Storage.setTaskColoringEnabled(next);

      // Trigger immediate update for task coloring feature
      const newSettings = await window.cc3Storage.getSettings();
      if (window.cc3Features && window.cc3Features.updateFeature) {
        window.cc3Features.updateFeature('taskColoring', newSettings.taskColoring || {});
      }
    });
    const taskToggleWrap = createEl('div', { className: 'cc3-toggle' }, [taskToggleLabel, taskToggle]);

    // Time blocking toggle
    const timeBlockToggleLabel = createEl('label', {}, ['Time Blocks']);
    const timeBlockToggle = createEl('div', { className: 'cc3-switch' });
    timeBlockToggle.dataset.on = String(Boolean(settings.timeBlocking?.enabled || false));
    timeBlockToggle.addEventListener('click', async () => {
      const next = !state.settings?.timeBlocking?.enabled;
      timeBlockToggle.dataset.on = String(next);

      // Update local state
      if (!state.settings.timeBlocking) state.settings.timeBlocking = {};
      state.settings.timeBlocking.enabled = next;

      await window.cc3Storage.setTimeBlockingEnabled(next);

      // Trigger immediate update for time blocking feature
      const newSettings = await window.cc3Storage.getSettings();
      if (window.cc3Features && window.cc3Features.updateFeature) {
        window.cc3Features.updateFeature('timeBlocking', newSettings.timeBlocking || {});
      }
    });
    const timeBlockToggleWrap = createEl('div', { className: 'cc3-toggle' }, [timeBlockToggleLabel, timeBlockToggle]);

    row.appendChild(dayToggleWrap);
    row.appendChild(createEl('span', {}, ['|']));
    row.appendChild(taskToggleWrap);
    row.appendChild(createEl('span', {}, ['|']));
    row.appendChild(timeBlockToggleWrap);

    row.appendChild(collapseBtn);

    root.appendChild(row);
    document.documentElement.appendChild(root);
  }

  async function mount() {
    state.settings = await window.cc3Storage.getSettings();
    renderToolbar();
    window.cc3Storage.onSettingsChanged((s) => {
      state.settings = s;
      renderToolbar();
    });
  }

  // Global API
  window.cc3Toolbar = { mount };
})();
