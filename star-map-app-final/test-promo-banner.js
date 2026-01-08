// Test if promo banner should show
require('dotenv').config({ path: '.env.local' });

console.log('\n=== PROMO BANNER TEST ===');
console.log('Current Date:', new Date().toISOString().split('T')[0]);
console.log('\nEnvironment Variables:');
console.log('PRICE_CENTS:', process.env.PRICE_CENTS);
console.log('PROMO_PRICE_CENTS:', process.env.PROMO_PRICE_CENTS);
console.log('PROMO_START:', process.env.PROMO_START);
console.log('PROMO_END:', process.env.PROMO_END);

const now = new Date();
const start = new Date(process.env.PROMO_START);
const end = new Date(process.env.PROMO_END);

console.log('\nPromo Window Check:');
console.log('Start date:', start.toISOString().split('T')[0]);
console.log('End date:', end.toISOString().split('T')[0]);
console.log('Current is after start?', now >= start);
console.log('Current is before end?', now <= end);
console.log('Promo SHOULD be active?', now >= start && now <= end);

if (now >= start && now <= end) {
  console.log('\n✅ BANNER SHOULD SHOW');
} else {
  console.log('\n❌ BANNER WILL NOT SHOW - dates are outside window');
}

console.log('\n=========================\n');
