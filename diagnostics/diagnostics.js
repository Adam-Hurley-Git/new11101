import { CONFIG, debugLog } from '../config.production.js';

// Activity log
const activityLog = [];

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}`;

  activityLog.push(logEntry);

  const logElement = document.getElementById('activityLog');
  if (logElement) {
    logElement.textContent = activityLog.slice(-20).join('\n');
    logElement.scrollTop = logElement.scrollHeight;
  }

  debugLog(message);
}

// Initialize diagnostics on load
document.addEventListener('DOMContentLoaded', async () => {
  log('Diagnostics page loaded');
  await checkExtensionStatus();
  await checkPushSubscriptionStatus();

  // Set up button event listeners
  document.getElementById('checkPushBtn')?.addEventListener('click', checkPushSubscriptionStatus);
  document.getElementById('registerPushBtn')?.addEventListener('click', registerPush);
  document.getElementById('runDiagnosticsBtn')?.addEventListener('click', runBackendDiagnostics);
  document.getElementById('testPushBtn')?.addEventListener('click', sendTestPush);
});

// Check extension status
async function checkExtensionStatus() {
  log('Checking extension status...');

  const statusHtml = [];

  try {
    // Check authentication
    const { supabaseSession, authenticated } = await chrome.storage.local.get(['supabaseSession', 'authenticated']);

    statusHtml.push(
      createStatusItem(
        'Authentication',
        authenticated ? '✅ Authenticated' : '❌ Not Authenticated',
        authenticated ? 'status-good' : 'status-bad',
      ),
    );

    if (supabaseSession) {
      statusHtml.push(createStatusItem('User Email', supabaseSession.user?.email || 'Unknown', 'status-info'));
    }

    // Check VAPID configuration
    statusHtml.push(
      createStatusItem(
        'VAPID Public Key',
        CONFIG.VAPID_PUBLIC_KEY ? CONFIG.VAPID_PUBLIC_KEY.substring(0, 20) + '...' : 'NOT CONFIGURED',
        CONFIG.VAPID_PUBLIC_KEY ? 'status-good' : 'status-bad',
      ),
    );

    // Check web app URL
    statusHtml.push(createStatusItem('Web App URL', CONFIG.WEB_APP_URL, 'status-info'));

    // Check push subscription in storage
    const { pushSubscription } = await chrome.storage.local.get('pushSubscription');

    statusHtml.push(
      createStatusItem(
        'Local Push Subscription',
        pushSubscription ? '✅ Stored' : '❌ Not Found',
        pushSubscription ? 'status-good' : 'status-bad',
      ),
    );

    if (pushSubscription) {
      statusHtml.push(
        createStatusItem(
          'Push Endpoint',
          pushSubscription.endpoint ? pushSubscription.endpoint.substring(0, 50) + '...' : 'Unknown',
          'status-info',
        ),
      );
    }

    document.getElementById('extensionStatus').innerHTML = statusHtml.join('');

    log('Extension status check complete');
  } catch (error) {
    log(`Error checking extension status: ${error.message}`, 'error');
    document.getElementById('extensionStatus').innerHTML = `
      <div class="alert alert-error">
        Failed to check extension status: ${error.message}
      </div>
    `;
  }
}

// Check push subscription status
async function checkPushSubscriptionStatus() {
  log('Checking push subscription status...');

  const statusHtml = [];

  try {
    // Get local storage
    const { pushSubscription, supabaseSession } = await chrome.storage.local.get([
      'pushSubscription',
      'supabaseSession',
    ]);

    if (!pushSubscription) {
      document.getElementById('pushStatus').innerHTML = `
        <div class="alert alert-warning">
          No push subscription found locally. Click "Re-register Push" to create one.
        </div>
      `;
      log('No local push subscription found');
      return;
    }

    statusHtml.push(createStatusItem('Local Status', '✅ Registered Locally', 'status-good'));

    // Check backend registration
    if (!supabaseSession?.access_token) {
      statusHtml.push(createStatusItem('Backend Status', '❌ Not Logged In', 'status-bad'));

      document.getElementById('pushStatus').innerHTML =
        statusHtml.join('') +
        `
        <div class="alert alert-warning">
          You need to log in to verify backend registration.
        </div>
      `;

      log('Cannot check backend status - not logged in');
      return;
    }

    // Check with backend
    log('Checking backend registration...');

    const response = await fetch(`${CONFIG.WEB_APP_URL}/api/extension/subscription-status`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${supabaseSession.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    statusHtml.push(
      createStatusItem(
        'Backend Status',
        data.registered ? '✅ Registered' : '❌ Not Registered',
        data.registered ? 'status-good' : 'status-bad',
      ),
    );

    statusHtml.push(
      createStatusItem(
        'Registration Status',
        data.status || 'unknown',
        data.status === 'fully_registered' ? 'status-good' : 'status-warning',
      ),
    );

    if (data.details) {
      statusHtml.push(createStatusItem('Subscription Count', data.details.subscriptionCount || 0, 'status-info'));

      statusHtml.push(
        createStatusItem(
          'Customer ID',
          data.details.customerId || 'Not Set',
          data.details.customerId ? 'status-good' : 'status-warning',
        ),
      );
    }

    statusHtml.push(`
      <div class="alert alert-${data.registered ? 'success' : 'warning'}">
        ${data.message}
      </div>
    `);

    document.getElementById('pushStatus').innerHTML = statusHtml.join('');

    log(`Backend status: ${data.status}`);
  } catch (error) {
    log(`Error checking push status: ${error.message}`, 'error');
    document.getElementById('pushStatus').innerHTML =
      statusHtml.join('') +
      `
      <div class="alert alert-error">
        Failed to check backend status: ${error.message}
      </div>
    `;
  }
}

// Register/re-register push subscription
async function registerPush() {
  log('Triggering push subscription registration...');

  try {
    await chrome.runtime.sendMessage({ type: 'ENSURE_PUSH' });

    log('Push registration triggered successfully');

    setTimeout(async () => {
      await checkPushSubscriptionStatus();
    }, 2000);
  } catch (error) {
    log(`Error triggering push registration: ${error.message}`, 'error');
  }
}

// Run backend diagnostics
async function runBackendDiagnostics() {
  log('Running backend diagnostics...');

  const btn = document.getElementById('runDiagnosticsBtn');
  if (btn) btn.disabled = true;

  try {
    const { supabaseSession } = await chrome.storage.local.get('supabaseSession');

    if (!supabaseSession?.access_token) {
      throw new Error('Not logged in. Please log in to the extension first.');
    }

    const response = await fetch(`${CONFIG.WEB_APP_URL}/api/extension/debug-push`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${supabaseSession.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    // Display diagnostics
    const resultHtml = [`<div class="code-block">${JSON.stringify(data, null, 2)}</div>`];

    // Show analysis
    if (data.diagnostics?.analysis) {
      resultHtml.unshift(
        '<div class="alert alert-info"><strong>Analysis:</strong><br/>' +
          data.diagnostics.analysis.join('<br/>') +
          '</div>',
      );
    }

    document.getElementById('diagnosticsResult').innerHTML = resultHtml.join('');
    document.getElementById('diagnosticsResult').classList.remove('hidden');

    log('Backend diagnostics complete');
  } catch (error) {
    log(`Error running diagnostics: ${error.message}`, 'error');

    document.getElementById('diagnosticsResult').innerHTML = `
      <div class="alert alert-error">
        <strong>Error:</strong> ${error.message}
      </div>
    `;

    document.getElementById('diagnosticsResult').classList.remove('hidden');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Send test push
async function sendTestPush() {
  log('Sending test push notification...');

  const btn = document.getElementById('testPushBtn');
  if (btn) btn.disabled = true;

  try {
    const { supabaseSession } = await chrome.storage.local.get('supabaseSession');

    if (!supabaseSession?.access_token) {
      throw new Error('Not logged in. Please log in to the extension first.');
    }

    const response = await fetch(`${CONFIG.WEB_APP_URL}/api/extension/debug-push?test=true`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${supabaseSession.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    if (data.diagnostics?.testPush) {
      const testResult = data.diagnostics.testPush;

      if (testResult.success) {
        log('✅ Test push sent successfully!');

        document.getElementById('diagnosticsResult').innerHTML = `
          <div class="alert alert-success">
            <strong>Success!</strong> ${testResult.message}<br/>
            Check the service worker console (chrome://extensions → Service Worker) to see if the push was received.
          </div>
        `;
      } else {
        log(`❌ Test push failed: ${testResult.error || 'Unknown error'}`);

        document.getElementById('diagnosticsResult').innerHTML = `
          <div class="alert alert-error">
            <strong>Failed:</strong> ${testResult.error || testResult.message || 'Unknown error'}
          </div>
        `;
      }

      document.getElementById('diagnosticsResult').classList.remove('hidden');
    }
  } catch (error) {
    log(`Error sending test push: ${error.message}`, 'error');

    document.getElementById('diagnosticsResult').innerHTML = `
      <div class="alert alert-error">
        <strong>Error:</strong> ${error.message}
      </div>
    `;

    document.getElementById('diagnosticsResult').classList.remove('hidden');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Helper to create status item HTML
function createStatusItem(label, value, statusClass = 'status-info') {
  return `
    <div class="status-item">
      <span class="status-label">${label}</span>
      <span class="status-value ${statusClass}">${value}</span>
    </div>
  `;
}

// Listen for push events
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SUBSCRIPTION_STATUS') {
    log(`Push notification received! Type: ${message.payload?.type || 'unknown'}`);
  }
});
