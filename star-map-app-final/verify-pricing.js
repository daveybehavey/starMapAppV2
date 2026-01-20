// Verify pricing configuration before starting dev server
require('dotenv').config({ path: '.env.local' });

console.log('\n=== PRICING CONFIGURATION ===');
console.log('✓ Base Price:', process.env.PRICE_CENTS, 'cents ($' + (process.env.PRICE_CENTS / 100).toFixed(2) + ')');
console.log('✓ Promo Price:', process.env.PROMO_PRICE_CENTS, 'cents ($' + (process.env.PROMO_PRICE_CENTS / 100).toFixed(2) + ')');
console.log('✓ Promo Window:', process.env.PROMO_START, 'to', process.env.PROMO_END);
console.log('✓ Currency:', process.env.CURRENCY?.toUpperCase());
console.log('✓ Stripe Promo Code ID:', process.env.STRIPE_PROMO_CODE_ID);

const now = new Date();
const start = new Date(process.env.PROMO_START);
const end = new Date(process.env.PROMO_END);
const isActive = now >= start && now <= end;

console.log('\n=== PROMO STATUS ===');
console.log('Current Date:', now.toISOString().split('T')[0]);
console.log('Promo Active:', isActive ? '✓ YES' : '✗ NO');

if (isActive) {
  console.log('\n✓ Promo is ACTIVE - Stripe checkout will show:');
  console.log('  Subtotal: $0.99');
  console.log('  Discount (NEWYEARS26): -$9.00');
  console.log('  Total: $0.99');
} else {
  console.log('\n⚠️  Promo is NOT active yet. It will be active during:');
  console.log('  Start:', start.toISOString().split('T')[0]);
  console.log('  End:', end.toISOString().split('T')[0]);
}

console.log('\n=== NEXT STEPS ===');
console.log('1. Make sure your dev server is restarted');
console.log('2. Go to your website and click "Unlock Now"');
console.log('3. You should see the discount on Stripe checkout');
console.log('\n');
