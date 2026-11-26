import test from 'node:test';
import assert from 'node:assert/strict';
import { planCommerceWebhookEvents } from '../lib/stripe-commerce-webhook-events.mjs';
test('plan adds delayed outcomes while preserving refund/dispute/subscription events',()=>{
 const plan = planCommerceWebhookEvents(['checkout.session.completed','checkout.session.expired','charge.refunded','charge.dispute.created','customer.subscription.updated']);
 assert.deepEqual(plan.missing,['checkout.session.async_payment_succeeded','checkout.session.async_payment_failed']);
 assert.ok(plan.proposedEvents.includes('charge.refunded'));assert.ok(plan.proposedEvents.includes('customer.subscription.updated'));
 assert.equal(planCommerceWebhookEvents(plan.proposedEvents).changeRequired,false);
});
test('wildcard endpoint is already subscribed; malformed inputs fail closed',()=>{
 assert.equal(planCommerceWebhookEvents(['*']).changeRequired,false);
 assert.throws(()=>planCommerceWebhookEvents(null));assert.throws(()=>planCommerceWebhookEvents([1]));
});
