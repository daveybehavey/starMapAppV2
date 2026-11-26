import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
register('./tsAliasLoader.mjs', import.meta.url);
const { evaluateMerchContribution } = await import('../../src/lib/merchContribution.ts');
const { getMerchShippingOptionsForCountry, getMerchQuoteExpiresAt } = await import('../../src/lib/merchCheckout.ts');
const { submitPrintfulV2CatalogOrder } = await import('../../src/lib/printfulV2Orders.ts');
const profile = { productCents: 300, providerTaxCents: 0, processingBps: 300, processingFixedCents: 30, fxBps: 200, replacementReserveCents: 50 };
const contribution = { catalogVariantId: 123, amountTotalCents: 3000, taxCents: 0, currency: 'usd', shippingCostUsdCents: 500 };
const input = { externalId: 'synthetic-order', catalogVariantId: 123, fileUrl: 'https://example.test/art.png', recipient: { name: 'Test', address1: 'Test', city: 'Test', country_code: 'CA', state_code: 'BC', zip: 'V0V0V0' }, placement: 'default', technique: 'digital', contribution };
async function fixture(fn, { autoConfirm = 'true', costProfile = profile } = {}) {
  const keys = ['PRINTFUL_API_TOKEN', 'PRINTFUL_STORE_ID', 'PRINTFUL_AUTO_CONFIRM', 'MERCH_VARIANT_COSTS_JSON'];
  const old = keys.map(k => process.env[k]); const fetch = globalThis.fetch;
  Object.assign(process.env, { PRINTFUL_API_TOKEN: 'test-placeholder', PRINTFUL_STORE_ID: 'test-store', PRINTFUL_AUTO_CONFIRM: autoConfirm, MERCH_VARIANT_COSTS_JSON: JSON.stringify({ 123: costProfile }) });
  try { await fn(); } finally { globalThis.fetch = fetch; keys.forEach((k,i) => old[i] === undefined ? delete process.env[k] : process.env[k] = old[i]); }
}
const json = (data,status=200) => new Response(JSON.stringify(data),{status});
test('contribution requires exact variant, complete costs, currency and tax; subtracts tax/fees/reserve',()=>fixture(()=>{
  assert.equal(evaluateMerchContribution(contribution).allowed,true);
  for(const patch of [{catalogVariantId:999},{currency:'eur'},{taxCents:null},{shippingCostUsdCents:null},{amountTotalCents:NaN}]) assert.equal(evaluateMerchContribution({...contribution,...patch}).allowed,false);
  assert.equal(evaluateMerchContribution({...contribution,taxCents:2000}).allowed,false);
  assert.equal(evaluateMerchContribution({...contribution,providerTotalUsdCents:2400}).allowed,false);
  assert.equal(evaluateMerchContribution({...contribution,currency:'cad',amountTotalCents:4200}).allowed,true);
}));
test('shipping blocks missing region and unknown, malformed, wrong-currency or nonstandard rates',()=>fixture(async()=>{
  globalThis.fetch=async()=>{throw Error('must not fetch without region');};
  for(const country of ['US','CA','AU']) await assert.rejects(getMerchShippingOptionsForCountry(123,country),e=>e.code==='merch_shipping_state_required');
  for(const rate of [[],[{shipping:'EXPRESS',rate:'5.00',currency:'USD'}],[{shipping:'STANDARD',rate:'5garbage',currency:'USD'}],[{shipping:'STANDARD',rate:'-5',currency:'USD'}],[{shipping:'STANDARD',rate:'5.00',currency:'EUR'}]]) {
    globalThis.fetch=async()=>json({data:rate});
    await assert.rejects(getMerchShippingOptionsForCountry(123,'CA','cad','BC'),e=>e.code==='merch_shipping_quote_unavailable');
  }
  globalThis.fetch=async(_url,options)=>{assert.equal(JSON.parse(options.body).recipient.state_code,'BC');return json({data:[{shipping:'STANDARD',rate:'5.00',currency:'USD'}]});};
  const result=await getMerchShippingOptionsForCountry(123,'CA','cad','BC');
  assert.equal(result.shippingOptions[0].shipping_rate_data.fixed_amount.amount,700);
  assert.equal(result.shippingChargeCents,500);
}));
function provider({state='draft',costState='done',total='8.00',confirmState='pending',timeout=false}={}) {
  const calls=[]; let current=state;
  globalThis.fetch=async(url,options={})=>{
    calls.push([String(url),options.method||'GET']);
    if(String(url).endsWith('/confirmation')) {current=confirmState;if(timeout) throw Error('accepted then timeout');return json({data:{id:321,external_id:input.externalId,recipient:input.recipient,status:current}});}
    return json({data:{id:321,external_id:input.externalId,recipient:input.recipient,status:current,costs:{calculation_status:costState,currency:'USD',total}}});
  };return calls;
}
test('v2 draft with pending costs is held, not sent or confirmed',()=>fixture(async()=>{
 const calls=provider({costState:'calculating'});const result=await submitPrintfulV2CatalogOrder(input);
 assert.equal(result.ok,false);assert.equal(result.orderId,321);assert.equal(result.error,'printful_v2_costs_pending');assert.equal(calls.filter(c=>c[0].endsWith('/confirmation')).length,0);
}));
test('v2 manual review never confirms or reports production',()=>fixture(async()=>{
 const calls=provider();const result=await submitPrintfulV2CatalogOrder(input);assert.equal(result.ok,false);assert.equal(result.error,'printful_v2_manual_review_required');assert.equal(calls.length,2);
},{autoConfirm:'false'}));
test('v2 actual provider margin failure blocks confirmation',()=>fixture(async()=>{
 const calls=provider({total:'29.00'});assert.equal((await submitPrintfulV2CatalogOrder(input)).ok,false);assert.equal(calls.length,2);
}));
test('v2 confirms once, verifies status and reconciles timeout-after-accept',()=>fixture(async()=>{
 for(const timeout of [false,true]) {const calls=provider({timeout});const result=await submitPrintfulV2CatalogOrder(input);assert.equal(result.ok,true);assert.equal(result.providerState,'pending');assert.equal(calls.filter(c=>c[0].endsWith('/confirmation')).length,1);}
}));
test('v2 an HTTP 200 that remains draft is not confirmed; existing production never reconfirms',()=>fixture(async()=>{
 provider({confirmState:'draft'});assert.equal((await submitPrintfulV2CatalogOrder(input)).ok,false);
 const calls=provider({state:'inprocess'});assert.equal((await submitPrintfulV2CatalogOrder(input)).ok,true);assert.equal(calls.length,2);
}));

test('retained draft reconciliation is read-only even when costs are now ready',()=>fixture(async()=>{
 const calls=provider(); const result=await submitPrintfulV2CatalogOrder({...input,existingDraftOrderId:321});
 assert.equal(result.ok,false);assert.equal(result.error,'printful_v2_existing_draft_review_required');assert.deepEqual(calls.map(c=>c[1]),['GET']);
}));
test('manual confirmation readback reuses retained identity without any POST',()=>fixture(async()=>{
 const calls=provider({state:'pending'});const result=await submitPrintfulV2CatalogOrder({...input,existingDraftOrderId:321});
 assert.equal(result.ok,true);assert.equal(result.orderId,321);assert.deepEqual(calls.map(c=>c[1]),['GET']);
}));

test('quote expiry stays stable across retries in a minute and is bounded to 31–32 minutes',()=>{
 const now=1800000000000;assert.equal(getMerchQuoteExpiresAt(now),getMerchQuoteExpiresAt(now+59000));
 assert.equal(getMerchQuoteExpiresAt(now)-now/1000,1920);assert.equal(getMerchQuoteExpiresAt(now+59000)-(now+59000)/1000,1861);
});

test('editor checkout normalization retains the shipping region from either purchase panel',()=>{
 const source=fs.readFileSync(new URL('../../src/components/EditorExperience.tsx',import.meta.url),'utf8');
 const start=source.indexOf('      const merchOptions =');const end=source.indexOf('      const printVariant =',start);
 assert.ok(start>=0 && end>start);
 const normalize=new Function('options',source.slice(start,end)+';return merchOptions;');
 assert.deepEqual(normalize({merchOptions:{size:'3x3',color:'Black',stateCode:'BC'}}),{size:'3x3',color:'Black',stateCode:'BC'});
 assert.equal(normalize(undefined),undefined);
});
