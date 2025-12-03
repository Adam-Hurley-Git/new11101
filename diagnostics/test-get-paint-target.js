// ============================================================================
// TEST: Does getPaintTarget() work?
// ============================================================================

function testGetPaintTarget() {
  console.clear();
  console.log('🧪 TESTING getPaintTarget() function\n' + '='.repeat(70));

  // Find a task element
  const taskElement = document.querySelector('[data-eventid^="tasks_"]');

  if (!taskElement) {
    console.log('❌ No task elements found!');
    return;
  }

  console.log('✅ Found task element:');
  console.log(taskElement);
  console.log('\nElement info:');
  console.log(`  - Tag: ${taskElement.tagName}`);
  console.log(`  - Classes: ${taskElement.className}`);
  console.log(`  - data-eventid: ${taskElement.getAttribute('data-eventid')}`);
  console.log(`  - Has .GTG3wb class: ${taskElement.classList.contains('GTG3wb') ? '✅' : '❌'}`);

  console.log('\n🔍 Testing getPaintTarget logic...\n');

  // Test 1: querySelector for child .GTG3wb
  const childButton = taskElement.querySelector('.GTG3wb');
  console.log(`1. querySelector('.GTG3wb'): ${childButton ? '✅ Found' : '❌ Not found'}`);

  // Test 2: closest to find if element itself is .GTG3wb
  const closestButton = taskElement.closest('.GTG3wb');
  console.log(`2. closest('.GTG3wb'): ${closestButton ? '✅ Found' : '❌ Not found'}`);
  if (closestButton) {
    console.log(`   → Same element: ${closestButton === taskElement ? '✅ YES' : '❌ NO'}`);
  }

  // Test 3: matches to check if element itself is .GTG3wb
  const matchesButton = taskElement.matches('.GTG3wb');
  console.log(`3. matches('.GTG3wb'): ${matchesButton ? '✅ YES' : '❌ NO'}`);

  // Test 4: Check role="button"
  const matchesRole = taskElement.matches('[role="button"]');
  console.log(`4. matches('[role="button"]'): ${matchesRole ? '✅ YES' : '❌ NO'}`);

  // Test 5: Complete getPaintTarget logic
  console.log('\n🎯 Simulating getPaintTarget() logic:\n');

  let result = null;

  // Step 1: Check if in modal
  const isInModal = taskElement.closest('[role="dialog"]');
  console.log(`Step 1 - In modal: ${isInModal ? '❌ YES (would return null)' : '✅ NO'}`);
  if (isInModal) {
    console.log('  → getPaintTarget would return null');
    return;
  }

  // Step 2: querySelector OR closest
  const target1 = taskElement.querySelector('.GTG3wb') || taskElement.closest('.GTG3wb');
  console.log(`Step 2 - querySelector || closest: ${target1 ? '✅ Found' : '❌ null'}`);
  if (target1 && !target1.closest('[role="dialog"]')) {
    result = target1;
    console.log(`  → Would return this element: ${result === taskElement ? 'SAME element' : 'different element'}`);
  }

  // Step 3: Fallback to role=button check
  if (!result && taskElement.matches('[role="button"]')) {
    result = taskElement;
    console.log(`Step 3 - Fallback role=button: ✅ Would return taskElement`);
  }

  // Step 4: Fallback to querySelector('[role="button"]')
  if (!result) {
    const buttonElement = taskElement.querySelector('[role="button"]');
    if (buttonElement) {
      result = buttonElement;
      console.log(`Step 4 - querySelector role=button: ✅ Would return child button`);
    }
  }

  // Step 5: Final fallback
  if (!result) {
    result = taskElement;
    console.log(`Step 5 - Final fallback: Would return taskElement itself`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 RESULT:');
  console.log('='.repeat(70));
  console.log(`getPaintTarget() would return: ${result ? '✅ Valid element' : '❌ null'}`);

  if (result) {
    console.log(`\nReturned element:`);
    console.log(result);
    console.log(`Is same as input: ${result === taskElement ? '✅ YES' : '❌ NO'}`);

    // Try to actually color it
    console.log(`\n🎨 Attempting to apply RED color...`);
    result.style.backgroundColor = '#FF0000';
    result.style.color = '#FFFFFF';

    console.log(`✅ Color applied! Look at the calendar - do you see RED?`);

    setTimeout(() => {
      result.style.backgroundColor = '';
      result.style.color = '';
      console.log(`\n🔄 Color removed.`);
    }, 3000);
  }

  return result;
}

window.testGetPaintTarget = testGetPaintTarget;

console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║              TEST getPaintTarget()                                     ║
║                                                                        ║
║  Run: testGetPaintTarget()                                            ║
║                                                                        ║
║  This will test if the extension's getPaintTarget() logic works      ║
║  and actually apply a RED color to verify targeting                   ║
╚════════════════════════════════════════════════════════════════════════╝
`);
