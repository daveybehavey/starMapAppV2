import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./tsAliasLoader.mjs', import.meta.url);
register('./consistencyCoordinator.hooks.mjs', import.meta.url);
register('./hcapNull.hooks.mjs', import.meta.url);
const { createSendCapClient } = await import('../../src/lib/sharedSendCap.ts');
const { deliverPromotionSend } = await import('../../src/lib/promotions.ts');
const { executeReviewDispatch } = await import('../../src/lib/reviewRequestSuppression.ts');
test('H-cap explicit null: remote unset precedes fence and provider guards', async () => {
  const trap = new Proxy({}, { get() { assert.fail('provider guard accessed'); } });
  for (const family of ['promotion', 'review']) assert.deepEqual(await createSendCapClient().reserve(family), { permitted: false, reason: 'send_cap_unset' });
  assert.deepEqual(await deliverPromotionSend(trap), { outcome: 'refused', provider: 'none', reason: 'send_cap_unset' });
  assert.deepEqual(await executeReviewDispatch({}, { sendCap: createSendCapClient(), get isSuppressed() { assert.fail('suppression accessed'); } }), { outcome: 'refused', reason: 'send_cap_unset' });
});
