import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createCheckoutTimingCollector, createCheckoutInteriorTimer, checkoutTimingAggregateIncrements, buildCheckoutTimingLog } from '../../src/lib/checkoutTiming.ts';

const fields = ['sessionSetupMs', 'sessionShippingMs', 'sessionLineItemsMs', 'sessionValidationMs', 'sessionParamsMs'];
const stages = ['session_setup', 'session_shipping', 'session_line_items', 'session_validation', 'session_params'];
test('interior timing: monotonic slices increment existing stage sums/counts/buckets', (t) => {
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const collector = createCheckoutTimingCollector();
  const mark = createCheckoutInteriorTimer(collector);
  const durations = [13, 1500, 27, 3300, 9];
  for (let i = 0; i < fields.length; i++) {
    now += durations[i];
    mark(fields[i + 1] ?? null);
  }
  now += 9000; // Stripe work must not leak into the interior timer's finally.
  mark(null);
  const counters = new Map(checkoutTimingAggregateIncrements(collector, now - 100).map(({counter, amount}) => [counter, amount]));
  const log = buildCheckoutTimingLog({ collector, correlationId: 'fixture', method: 'POST', checkoutKind: 'digital', outcome: 'created', qa: false, endedAtPerf: now });
  for (let i = 0; i < fields.length; i++) {
    assert.equal(log[fields[i]], durations[i]);
    assert.equal(counters.get(`stage_${stages[i]}_count`), 1);
    assert.equal(counters.get(`stage_${stages[i]}_sum_ms`), durations[i]);
    assert.equal(counters.get(`stage_${stages[i]}_${['lt1s','1_3s','lt1s','3_10s','lt1s'][i]}`), 1);
  }
});

for (let failingStage = 0; failingStage < fields.length; failingStage++) {
  test(`interior timing: error in ${stages[failingStage]} retains elapsed time and skips unstarted stages`, (t) => {
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    const collector = createCheckoutTimingCollector();
    const mark = createCheckoutInteriorTimer(collector);
    const error = new Error('fixture failure');
    assert.throws(() => {
      try {
        for (let i = 0; i < failingStage; i++) { now += 10; mark(fields[i + 1]); }
        now += 17;
        throw error;
      } finally { mark(null); }
    }, e => e === error);
    const increments = checkoutTimingAggregateIncrements(collector, now);
    assert.equal(collector[fields[failingStage]], 17);
    for (let i = failingStage + 1; i < fields.length; i++) {
      assert.equal(collector[fields[i]], null);
      assert.ok(!increments.some(({counter}) => counter.startsWith(`stage_${stages[i]}_`)));
    }
  });
}

test('interior timing: absent collector does not read the clock', (t) => {
  t.mock.method(performance, 'now', () => { throw new Error('unexpected clock'); });
  const mark = createCheckoutInteriorTimer();
  mark('sessionShippingMs');
  mark(null);
});

test('negative control: removing only F4 instrumentation restores exact base route bytes including session params, idempotency and F3 consent', () => {
  const route = fs.readFileSync(new URL('../../src/app/api/checkout/route.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const stripped = route.replace('  createCheckoutInteriorTimer,\n', '').replace(/  \/\/ CHK-F4 instrumentation begin\n[\s\S]*?  \/\/ CHK-F4 instrumentation end\n/g, '');
  assert.equal(createHash('sha256').update(stripped).digest('hex'), '63e1ee22f00f03d7a6f4e18b97c95eef55959c3ec0551cc792e26db98645e883');
  assert.equal((route.match(/\/\/ CHK-F4 instrumentation begin/g) ?? []).length, 7);
  const additions = [...route.matchAll(/  \/\/ CHK-F4 instrumentation begin\n([\s\S]*?)  \/\/ CHK-F4 instrumentation end\n/g)].map(m => m[1]).join('\n');
  assert.doesNotMatch(additions, /\bawait\b|stripe\.|\bsessionParams\b|\bidempotencyKey\b|consent_collection|recordCheckout/);
});
import ts from 'typescript';
import { buildCheckoutConsentCollection, shouldAttemptPromotionsConsent } from '../../src/lib/stripeConsentCollection.ts';
const routeSource = fs.readFileSync(new URL('../../src/app/api/checkout/route.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function sessionFunction(source) {
  const start = source.indexOf('async function createCheckoutSession(');
  const end = source.indexOf('\nexport async function GET(', start);
  const js = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('scope', 'input', `with (scope) { ${js}; return createCheckoutSession(input); }`);
}
const instrumentedSession = sessionFunction(routeSource);
const baseSession = sessionFunction(routeSource.replace(/  \/\/ CHK-F4 instrumentation begin\n[\s\S]*?  \/\/ CHK-F4 instrumentation end\n/g, ''));
for (const orderType of ['digital', 'print']) {
  test(`negative control: ${orderType} session bytes, idempotency and post-F3 consent unchanged with actual interior marks`, async (t) => {
    const oldConsent = process.env.STRIPE_CONSENT_PROMOTIONS_AUTO;
    process.env.STRIPE_CONSENT_PROMOTIONS_AUTO = '0';
    t.after(() => { if (oldConsent === undefined) delete process.env.STRIPE_CONSENT_PROMOTIONS_AUTO; else process.env.STRIPE_CONSENT_PROMOTIONS_AUTO = oldConsent; });
    let now = 0;
    t.mock.method(performance, 'now', () => ++now);
    const calls = [];
    const tier = { amountCents: 1000, currency: 'usd', credits: 1, label: 'fixture' };
    const scope = {
      performance, createCheckoutInteriorTimer,
      normalizeCheckoutCustomerEmail: x => x,
      stripe: { checkout: { sessions: { create: async (...args) => { calls.push(JSON.stringify(args)); return {url: 'https://checkout.stripe.com/c/pay/fixture'}; } } } },
      parseOrderType: x => x, parsePrintVariant: x => x,
      normalizeIncludeSecondCopy: () => false,
      canUseHostedPromotionCodes: x => x === 'print',
      siteOrigin: () => 'https://example.test', siteUrl: 'https://example.test',
      getPricingTiers: () => ({ single: tier }), getPrintPricingTiers: () => ({poster_framed: tier}),
      getPrintDigitalAddOnPrice: () => tier, printAllowedCountries: ['US'],
      buildCheckoutCancelUrl: () => 'https://example.test/editor',
      resolveCheckoutCurrency: () => 'usd',
      getPrintShippingOptionsForCountry: () => ({ shippingOptions: [], shippingChargeCents: 500 }),
      getGeoDigitalSinglePrice: () => null, normalizeIdempotencyToken: x => x,
      resolveReferralOfferVariant: () => null, applyMarketingAttributionMetadata: () => {},
      applyQaCheckoutMetadata: () => {}, stripePriceIds: {}, stripePrintVariantPriceIds: {},
      getDigitalCadPriceCents: () => 1200,
      applyPrintFreeShippingToCheckout: x => x, evaluatePrintMarginForCheckout: () => ({allowed: true}),
      shouldAttemptPromotionsConsent, buildCheckoutConsentCollection,
      getCheckoutSessionExpiresAt: () => 1800000000, stripePaymentMethodConfigurationId: '',
      boundStripeIdempotencyKey: x => x,
      resolveStripeCheckoutHandoffUrl: url => ({url, strictValid: true, recovered: false}),
    };
    const input = {plan: 'single', orderType, shippingCountry: 'US', idempotencyKey: 'fixture', customerEmail: 'fixture@example.test'};
    const baseline = await baseSession(scope, input);
    const collector = createCheckoutTimingCollector();
    const actual = await instrumentedSession(scope, {...input, timing: collector});
    assert.deepEqual(actual, baseline);
    assert.equal(calls.length, 2);
    assert.equal(calls[1], calls[0]);
    const [params, options] = JSON.parse(calls[1]);
    assert.deepEqual(params.consent_collection, {});
    assert.equal(options.idempotencyKey, 'fixture:exp1800000000');
    const counters = checkoutTimingAggregateIncrements(collector, now);
    for (const stage of stages) assert.ok(counters.some(x => x.counter === `stage_${stage}_count` && x.amount === 1));
    assert.equal(collector.consentFallbackFired, false);
  });
}
