(function () {
  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    for (const c of children) {
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else if (c) n.appendChild(c);
    }
    return n;
  }
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let settings = null;

  function WeekdayPanel() {
    const wrap = el('div', { className: 'panel' });
    wrap.appendChild(el('h3', {}, ['Weekday colors']));
    for (let i = 0; i < 7; i++) {
      const row = el('div', { className: 'row' });
      row.appendChild(el('div', {}, [weekdayNames[i]]));
      const input = el('input', { type: 'color', value: settings.weekdayColors?.[String(i)] || '#FFFFFF' });
      input.onchange = async (e) => (settings = await window.cc3Storage.setWeekdayColor(i, e.target.value));
      row.appendChild(input);
      wrap.appendChild(row);
    }

    // Add week start setting
    const weekStartRow = el('div', { className: 'row' });
    weekStartRow.appendChild(el('div', {}, ['Week starts on:']));
    const weekStartSelect = el('select', { value: settings.weekStart || 0 });
    ['Sunday', 'Monday', 'Saturday'].forEach((day, index) => {
      const option = el('option', { value: index === 2 ? 6 : index }, [day]);
      weekStartSelect.appendChild(option);
    });
    weekStartSelect.onchange = async (e) =>
      (settings = await window.cc3Storage.setWeekStart(parseInt(e.target.value, 10)));
    weekStartRow.appendChild(weekStartSelect);
    wrap.appendChild(weekStartRow);

    return wrap;
  }

  function PresetPanel() {
    const wrap = el('div', { className: 'panel' });
    wrap.appendChild(el('h3', {}, ['Presets']));
    const box = el('div', { className: 'row' });
    const inp = el('input', { type: 'color', value: '#FDE68A' });
    const btn = el('button', {}, ['Add preset']);
    btn.onclick = async () => {
      settings = await window.cc3Storage.addPresetColor(inp.value);
      render();
    };
    box.appendChild(inp);
    box.appendChild(btn);
    wrap.appendChild(box);
    const list = el('div', { className: 'row' });
    (settings.presetColors || []).forEach((hex) => {
      const chip = el('div', {
        style: `width:24px;height:20px;border-radius:6px;border:1px solid #d0d7de;background:${hex}`,
      });
      list.appendChild(chip);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function DatePanel() {
    const wrap = el('div', { className: 'panel' });
    wrap.appendChild(el('h3', {}, ['Individual dates']));
    const row = el('div', { className: 'row' });
    const d = el('input', { type: 'date' });
    const c = el('input', { type: 'color', value: '#FDE68A' });
    const setBtn = el('button', {}, ['Set']);
    const clrBtn = el('button', {}, ['Clear']);
    setBtn.onclick = async () => {
      if (!d.value) return;
      settings = await window.cc3Storage.setDateColor(d.value, c.value);
      render();
    };
    clrBtn.onclick = async () => {
      if (!d.value) return;
      settings = await window.cc3Storage.clearDateColor(d.value);
      render();
    };
    row.appendChild(d);
    row.appendChild(c);
    row.appendChild(setBtn);
    row.appendChild(clrBtn);
    wrap.appendChild(row);
    const list = el('div', {});
    Object.entries(settings.dateColors || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([k, v]) => {
        const item = el('div', { className: 'row' });
        const chip = el('div', {
          style: `width:18px;height:18px;border-radius:4px;border:1px solid #d0d7de;background:${v}`,
        });
        const del = el('button', {}, ['Remove']);
        del.onclick = async () => {
          settings = await window.cc3Storage.clearDateColor(k);
          render();
        };
        item.appendChild(chip);
        item.appendChild(el('div', {}, [k]));
        item.appendChild(del);
        list.appendChild(item);
      });
    wrap.appendChild(list);
    return wrap;
  }

  function render() {
    const root = document.getElementById('mount');
    root.innerHTML = '';
    const grid = el('div', { className: 'grid' });
    grid.appendChild(WeekdayPanel());
    grid.appendChild(PresetPanel());
    grid.appendChild(DatePanel());
    root.appendChild(grid);
  }

  async function init() {
    settings = await window.cc3Storage.getSettings();
    render();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) {
        settings = changes.settings.newValue;
        render();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
