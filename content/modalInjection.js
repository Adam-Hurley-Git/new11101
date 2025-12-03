(function () {
  let mounted = false;
  let currentSettings = null;
  let lastInjectedModal = null;

  // Store references for cleanup
  let modalObserver = null;
  let clickHandler = null;

  function isEventDialog(el) {
    // Google Calendar uses role="dialog" with various classes, search for known container
    return el.getAttribute && el.getAttribute('role') === 'dialog';
  }

  function findOpenDialog(root = document) {
    return [...root.querySelectorAll('div[role="dialog"], div[aria-modal="true"]')].find(
      (d) => d.offsetParent !== null,
    );
  }

  function isTaskDialog(dialog) {
    console.log('Checking if dialog is task dialog...');

    // First, explicitly check if this is an appearance/settings modal and exclude it
    const modalContent = dialog.textContent?.toLowerCase() || '';
    const hasAppearanceKeywords =
      modalContent.includes('appearance') ||
      modalContent.includes('theme') ||
      modalContent.includes('light mode') ||
      modalContent.includes('dark mode');
    const hasAppearanceLabels = dialog.querySelector('[aria-label*="appearance"], [aria-label*="theme"]');

    // Check buttons for light/dark mode text
    const buttons = dialog.querySelectorAll('button');
    const hasThemeButtons = Array.from(buttons).some((button) => {
      const buttonText = button.textContent?.toLowerCase() || '';
      return buttonText.includes('light') || buttonText.includes('dark');
    });

    const isAppearanceModal = hasAppearanceKeywords || hasAppearanceLabels || hasThemeButtons;

    if (isAppearanceModal) {
      console.log('Appearance modal detected, excluding from task detection');
      return false;
    }

    // For task color UI to appear, we need an EXISTING task (not create new)
    // Check for existing task data attributes (most reliable indicator)
    // Support both OLD UI (tasks.) and NEW UI (ttb_)
    const hasExistingTaskElements = dialog.querySelector('[data-eventid^="tasks."], [data-eventid^="ttb_"], [data-taskid]');

    // Check if we have a captured task ID from a recent click on an existing task
    const taskId = window.cfTasksColoring?.getLastClickedTaskId?.();

    // Only allow task color UI for existing tasks - require either:
    // 1. Task elements with actual task IDs in the DOM, OR
    // 2. A recently clicked task ID that indicates we're editing an existing task
    const isExistingTaskContext = hasExistingTaskElements || taskId;

    console.log('Task detection results:', {
      hasExistingTaskElements: !!hasExistingTaskElements,
      taskId,
      isExistingTaskContext,
      isAppearanceModal,
      modalContent: modalContent.substring(0, 100) + '...',
    });

    return isExistingTaskContext;
  }

  function isEditModal(dialog) {
    console.log('Checking if dialog is edit modal...');

    // Look for Save button - this is the key indicator of an edit modal
    const saveButton = dialog.querySelector('button[aria-label*="Save"], button[type="submit"]');
    if (!saveButton) {
      // Look for any button that might be a save button by text content
      const buttons = dialog.querySelectorAll('button');
      const foundSaveButton = Array.from(buttons).find(
        (btn) =>
          btn.textContent?.toLowerCase().includes('save') ||
          btn.textContent?.toLowerCase().includes('done') ||
          btn.textContent?.toLowerCase().includes('ok'),
      );
      if (foundSaveButton) {
        saveButton = foundSaveButton;
      }
    }
    const hasSaveButton = !!saveButton;

    // Look for editable input fields
    const hasEditableInputs = dialog.querySelector(
      'input[type="text"], input[type="email"], textarea, [contenteditable="true"]',
    );
    const hasEditableFields = !!hasEditableInputs;

    // Look for form elements that indicate editing capability
    const hasFormElements = dialog.querySelector('form, [role="form"]');
    const hasForm = !!hasFormElements;

    // Look for edit-specific UI elements
    const hasEditControls = dialog.querySelector(
      'button[aria-label*="Edit"], button[aria-label*="Delete"], button[aria-label*="Remove"]',
    );
    const hasEditButtons = !!hasEditControls;

    // Check if modal has input focus capability (indicates editing)
    const hasFocusableInputs = dialog.querySelector(
      'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])',
    );
    const hasFocusableFields = !!hasFocusableInputs;

    // Look for "Add" or "Create" buttons which indicate edit mode
    let hasAddButtons = dialog.querySelector('button[aria-label*="Add"], button[aria-label*="Create"]');
    if (!hasAddButtons) {
      // Look for any button that might be an Add/Create button by text content
      const buttons = dialog.querySelectorAll('button');
      hasAddButtons = Array.from(buttons).find(
        (btn) => btn.textContent?.toLowerCase().includes('add') || btn.textContent?.toLowerCase().includes('create'),
      );
    }
    const hasAddControls = !!hasAddButtons;

    // Check if this looks like a read-only preview modal
    const isReadOnly = dialog.querySelector('[readonly], [disabled], .readonly, .disabled');
    const hasReadOnlyElements = !!isReadOnly;

    // Determine if this is an edit modal based on multiple indicators
    // For task dialogs, be more permissive - if it has any editing capability, consider it an edit modal
    const isEditModal =
      hasSaveButton || hasEditableFields || hasEditButtons || hasFocusableFields || hasAddControls || hasForm;

    console.log('Edit modal detection results:', {
      hasSaveButton,
      hasEditableFields,
      hasForm,
      hasEditButtons,
      hasFocusableFields,
      hasAddControls,
      hasReadOnlyElements,
      isEditModal,
      modalClasses: dialog.className,
      modalRole: dialog.getAttribute('role'),
    });

    return isEditModal;
  }

  async function mountInto(dialog) {
    console.log('=== MODAL DETECTED ===');
    console.log('Modal element:', dialog);
    console.log('Modal classes:', dialog.className);
    console.log('Modal role:', dialog.getAttribute('role'));
    console.log('Modal HTML preview:', dialog.innerHTML.substring(0, 300) + '...');

    // Check if this is a Task dialog first
    if (isTaskDialog(dialog)) {
      console.log("Task dialog detected, checking if it's an edit modal...");

      // Simplified detection - just check if it's a task dialog and proceed
      // The injection logic will handle the placement correctly
      console.log('Task dialog detected, proceeding with injection...');

      console.log('This is an EDIT modal, proceeding with injection...');

      // Handle task switching: remove existing color picker if the task has changed
      const existingColorPicker = dialog.querySelector('.cf-task-color-inline-row');
      const existingTaskId = dialog.getAttribute('data-current-task-id');

      // Always try to get the freshest task ID - prioritize current modal content over cached clicks
      let taskId = null;

      // First, try to find task ID directly from current modal content (most reliable)
      // Support both OLD UI (tasks.) and NEW UI (ttb_)
      const modalTaskElement = dialog.querySelector('[data-eventid^="tasks."], [data-eventid^="ttb_"]');
      if (modalTaskElement) {
        const eventId = modalTaskElement.getAttribute('data-eventid');
        if (eventId) {
          // OLD UI: tasks. format - direct extraction
          if (eventId.startsWith('tasks.') || eventId.startsWith('tasks_')) {
            taskId = eventId.slice(6);
            console.log('[ModalInjection] Found OLD UI task ID from modal content:', taskId);
          }
          // NEW UI: ttb_ format - need to resolve via getResolvedTaskId
          else if (eventId.startsWith('ttb_')) {
            console.log('[ModalInjection] Found NEW UI (ttb_) in modal, resolving...');
            if (window.cfTasksColoring?.getResolvedTaskId) {
              taskId = await window.cfTasksColoring.getResolvedTaskId(modalTaskElement);
              console.log('[ModalInjection] Resolved NEW UI task ID:', taskId);
            } else {
              console.warn('[ModalInjection] getResolvedTaskId not available yet');
            }
          }
        }
      }

      // Fallback to last clicked task ID if no task found in modal
      if (!taskId) {
        const clickedTaskId = window.cfTasksColoring?.getLastClickedTaskId?.();
        console.log('[ModalInjection] Using task ID from getLastClickedTaskId:', clickedTaskId);

        // If it's a Promise (NEW UI), await it
        if (clickedTaskId && typeof clickedTaskId.then === 'function') {
          console.log('[ModalInjection] Task ID is Promise, awaiting...');
          taskId = await clickedTaskId;
          console.log('[ModalInjection] Resolved Promise task ID:', taskId);
        } else {
          taskId = clickedTaskId;
        }
      }

      // If we have an existing color picker but the task ID has changed, remove the old one
      if (existingColorPicker && existingTaskId && taskId && existingTaskId !== taskId) {
        console.log('Task switched from', existingTaskId, 'to', taskId, '- removing old color picker');
        existingColorPicker.remove();
      }

      // Check if we already have color controls for the current task
      if (existingColorPicker && existingTaskId === taskId && taskId) {
        console.log('Task color controls already exist for the current task, skipping');
        return;
      }

      if (!taskId) {
        console.log('[ModalInjection] No task ID found, performing comprehensive search...');

        // More comprehensive search for task elements and IDs
        // Include both OLD UI (tasks.) and NEW UI (ttb_) selectors
        const taskSelectors = ['[data-eventid^="tasks."]', '[data-eventid^="tasks_"]', '[data-eventid^="ttb_"]', '[data-taskid]'];

        for (const selector of taskSelectors) {
          const taskElement = dialog.querySelector(selector);
          if (taskElement) {
            console.log('[ModalInjection] Task element found with selector:', selector);
            const eventId = taskElement.getAttribute('data-eventid');
            const taskIdAttr = taskElement.getAttribute('data-taskid');

            // OLD UI: tasks. or tasks_ prefix
            if (eventId && (eventId.startsWith('tasks.') || eventId.startsWith('tasks_'))) {
              taskId = eventId.slice(6);
              console.log('[ModalInjection] Found OLD UI task ID from event ID:', taskId);
              break;
            }
            // NEW UI: ttb_ prefix
            else if (eventId && eventId.startsWith('ttb_')) {
              console.log('[ModalInjection] Found NEW UI (ttb_) task in comprehensive search, resolving...');
              if (window.cfTasksColoring?.getResolvedTaskId) {
                taskId = await window.cfTasksColoring.getResolvedTaskId(taskElement);
                console.log('[ModalInjection] Resolved NEW UI task ID:', taskId);
                if (taskId) break;
              } else {
                console.warn('[ModalInjection] getResolvedTaskId not available');
              }
            }
            // Direct task ID attribute
            else if (taskIdAttr) {
              taskId = taskIdAttr;
              console.log('[ModalInjection] Found task ID from task ID attribute:', taskId);
              break;
            }
          }
        }

        if (!taskId) {
          console.warn('[ModalInjection] No real task ID found in comprehensive search');
          return; // Don't inject for non-task dialogs
        }
      }

      // Don't use test or temporary task IDs - only proceed with real existing task IDs
      if (taskId && (taskId.startsWith('test-task-') || taskId.startsWith('temp-') || taskId.startsWith('new-task-'))) {
        console.warn('Test/temporary task ID detected, skipping injection to prevent loops');
        return;
      }

      // If we don't have a real task ID, this is likely a create new event dialog - don't inject
      if (!taskId) {
        console.log(
          'No real task ID found - this appears to be a create new event dialog, not injecting color controls',
        );
        return;
      }

      console.log('Final Task ID:', taskId);

      // Use the globally available function instead of importing
      console.log('Checking for tasks coloring availability...');
      console.log('window.cfTasksColoring exists:', !!window.cfTasksColoring);
      console.log('injectTaskColorControls exists:', !!window.cfTasksColoring?.injectTaskColorControls);

      // Store the current task ID on the modal element for tracking
      dialog.setAttribute('data-current-task-id', taskId);

      // Initialize timeout tracking array for cleanup
      if (!dialog._injectionTimeouts) {
        dialog._injectionTimeouts = [];
      }

      // Cleanup function to cancel pending timeouts
      const cleanupTimeouts = () => {
        if (dialog._injectionTimeouts && dialog._injectionTimeouts.length > 0) {
          console.log(`Canceling ${dialog._injectionTimeouts.length} pending injection timeouts`);
          dialog._injectionTimeouts.forEach(id => clearTimeout(id));
          dialog._injectionTimeouts = [];
        }
      };

      // Enhanced timing mechanism to handle different modal loading scenarios
      const injectWithRetry = (attempt = 0) => {
        console.log(`Injection attempt ${attempt + 1}`);

        // Check if modal structure is ready
        const hasSaveButton = dialog.querySelector('button')?.textContent?.toLowerCase().includes('save');
        const hasHcF6Td = dialog.querySelector('div.HcF6Td');
        const hasFormElements = dialog.querySelector('input, textarea, select');

        console.log('Modal readiness check:', {
          hasSaveButton: !!hasSaveButton,
          hasHcF6Td: !!hasHcF6Td,
          hasFormElements: !!hasFormElements,
          attempt: attempt + 1,
          taskId: taskId,
        });

        if (window.cfTasksColoring?.injectTaskColorControls) {
          console.log('Tasks coloring UI available, injecting for task ID:', taskId);
          window.cfTasksColoring.injectTaskColorControls(dialog, taskId, () => window.cfTasksColoring?.repaint());
          // Success - cancel remaining retries
          cleanupTimeouts();
        } else if (attempt < 30) {
          console.warn(`Tasks coloring UI not available yet, retrying in ${50 + attempt * 10}ms...`);
          // Track this timeout for cleanup
          const timeoutId = setTimeout(() => injectWithRetry(attempt + 1), 50 + attempt * 10);
          dialog._injectionTimeouts.push(timeoutId);
        } else {
          console.warn('Tasks coloring UI not available after waiting');
          // Max attempts reached - cleanup
          cleanupTimeouts();
        }
      };

      // Start with immediate attempt, then retry with increasing delays
      // Track initial timeout
      const initialTimeoutId = setTimeout(() => injectWithRetry(), 50);
      dialog._injectionTimeouts.push(initialTimeoutId);

      // Add a secondary injection attempt after a longer delay to catch modals that load slowly
      // Track secondary timeout
      const secondaryTimeoutId = setTimeout(() => {
        const currentTaskId = dialog.getAttribute('data-current-task-id');
        const existingColorPicker = dialog.querySelector('.cf-task-color-inline-row');

        // Check if color picker was already injected for the current task
        if (!existingColorPicker || currentTaskId !== taskId) {
          console.log('Secondary injection attempt - modal may have loaded more content or task switched');
          console.log('Current task ID:', currentTaskId, 'Target task ID:', taskId);

          // Remove old color picker if task has changed
          if (existingColorPicker && currentTaskId !== taskId) {
            console.log('Removing old color picker due to task switch in secondary attempt');
            existingColorPicker.remove();
          }

          // Update the task ID
          dialog.setAttribute('data-current-task-id', taskId);

          // Check specifically for HcF6Td div
          const hcF6TdDiv = dialog.querySelector('div.HcF6Td');
          if (hcF6TdDiv) {
            console.log('HcF6Td div found in secondary attempt, injecting...');
          }
          if (window.cfTasksColoring?.injectTaskColorControls) {
            window.cfTasksColoring.injectTaskColorControls(dialog, taskId, () => window.cfTasksColoring?.repaint());
          }
        }
      }, 300); // Reduced delay to 300ms for faster secondary attempt
      dialog._injectionTimeouts.push(secondaryTimeoutId);
      return;
    }

    // No additional UI needed for regular event dialogs
  }

  function observe() {
    // Disconnect existing observer if any
    if (modalObserver) {
      modalObserver.disconnect();
    }

    modalObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        // Handle new modal elements being added
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (isEventDialog(n) || n.querySelector?.('[role="dialog"]')) {
            const dlg = isEventDialog(n) ? n : n.querySelector('[role="dialog"]');
            if (dlg) mountInto(dlg);
          }
        }

        // Handle modal removal - cancel pending timeouts
        for (const n of m.removedNodes) {
          if (!(n instanceof HTMLElement)) continue;

          // Check if removed node is a dialog or contains dialogs
          const dialogs = [];
          if (isEventDialog(n)) {
            dialogs.push(n);
          } else {
            const innerDialogs = n.querySelectorAll?.('[role="dialog"]');
            if (innerDialogs) dialogs.push(...innerDialogs);
          }

          // Cancel timeouts for each removed dialog
          dialogs.forEach(dlg => {
            if (dlg._injectionTimeouts && dlg._injectionTimeouts.length > 0) {
              console.log(`Modal closed - canceling ${dlg._injectionTimeouts.length} pending timeouts`);
              dlg._injectionTimeouts.forEach(id => clearTimeout(id));
              dlg._injectionTimeouts = [];
            }

            // Also clear other tracked timeouts
            if (dlg._contentChangeTimeout) {
              clearTimeout(dlg._contentChangeTimeout);
            }
            if (dlg._taskSwitchTimeout) {
              clearTimeout(dlg._taskSwitchTimeout);
            }
          });
        }

        // Handle content changes within existing modals
        if (m.target && m.target.closest && m.target.closest('[role="dialog"]')) {
          const parentDialog = m.target.closest('[role="dialog"]');
          if (parentDialog && isTaskDialog(parentDialog)) {
            console.log('Content change detected in existing modal');

            // Debounce to avoid excessive re-mounting during rapid changes
            clearTimeout(parentDialog._contentChangeTimeout);
            parentDialog._contentChangeTimeout = setTimeout(() => {
              console.log('Processing modal content change after debounce');
              mountInto(parentDialog);
            }, 100);
          }
        }
      }
    });
    modalObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init(settings) {
    currentSettings = settings;
    if (mounted) return;
    mounted = true;
    observe();

    // Listen for task clicks while a modal is open to handle task switching
    clickHandler = (e) => {
      const openDialog = findOpenDialog();
      if (openDialog && isTaskDialog(openDialog)) {
        // Check if this click is on a task element (not within the modal)
        // Support both OLD UI (tasks.) and NEW UI (ttb_)
        const taskElement = e.target.closest('[data-eventid^="tasks."], [data-eventid^="ttb_"]');
        if (taskElement && !taskElement.closest('[role="dialog"]')) {
          console.log('[ModalInjection] Task clicked while modal is open - potential task switch');

          // Clear existing timeout to avoid multiple re-injections
          clearTimeout(openDialog._taskSwitchTimeout);

          // Multiple attempts with increasing delays to catch the content swap
          openDialog._taskSwitchTimeout = setTimeout(() => {
            const updatedDialog = findOpenDialog();
            if (updatedDialog && isTaskDialog(updatedDialog)) {
              console.log('Re-mounting into updated modal after task switch (attempt 1)');
              mountInto(updatedDialog);
            }
          }, 100);

          // Second attempt with longer delay
          setTimeout(() => {
            const updatedDialog = findOpenDialog();
            if (updatedDialog && isTaskDialog(updatedDialog)) {
              console.log('Re-mounting into updated modal after task switch (attempt 2)');
              mountInto(updatedDialog);
            }
          }, 300);
        }
      }
    };
    document.addEventListener('click', clickHandler, true);
  }

  function disable() {
    if (modalObserver) {
      modalObserver.disconnect();
      modalObserver = null;
    }

    if (clickHandler) {
      document.removeEventListener('click', clickHandler, true);
      clickHandler = null;
    }

    mounted = false;
  }

  window.cc3Features.register({
    id: 'modalInjection',
    init,
    disable,
    onSettingsChanged: (s) => {
      currentSettings = s;
    },
  });
})();
