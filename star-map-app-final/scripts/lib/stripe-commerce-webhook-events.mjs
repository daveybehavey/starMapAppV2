export const requiredCommerceEvents = Object.freeze([
  'checkout.session.completed', 'checkout.session.expired',
  'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
]);
export function planCommerceWebhookEvents(enabledEvents) {
  if (!Array.isArray(enabledEvents) || enabledEvents.some(value => typeof value !== 'string')) throw new Error('enabled_events must be an array of strings');
  const missing = enabledEvents.includes('*') ? [] : requiredCommerceEvents.filter(event => !enabledEvents.includes(event));
  return { missing, proposedEvents: [...new Set([...enabledEvents, ...missing])], changeRequired: missing.length > 0 };
}
