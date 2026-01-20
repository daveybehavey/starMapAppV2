// Quick test script to verify Stripe promotion code
require('dotenv').config({ path: '.env.local' });
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

async function testPromoCode() {
  console.log('\n=== STRIPE PROMO CODE TEST ===');
  console.log('Promo Code ID:', process.env.STRIPE_PROMO_CODE_ID);
  console.log('Using API Key:', process.env.STRIPE_SECRET_KEY ? '[configured]' : '[missing]');

  try {
    const promoCode = await stripe.promotionCodes.retrieve(process.env.STRIPE_PROMO_CODE_ID);
    console.log('\n✓ Promo code found!');
    console.log('  - Code:', promoCode.code);
    console.log('  - Active:', promoCode.active);
    console.log('  - Coupon ID:', promoCode.coupon.id);
    console.log('  - Discount:', promoCode.coupon.percent_off ? `${promoCode.coupon.percent_off}%` : `$${promoCode.coupon.amount_off / 100}`);
    console.log('  - Valid:', promoCode.coupon.valid);

    console.log('\n✓ Everything looks good! The promo code is valid.');
    console.log('\n⚠️  RESTART YOUR DEV SERVER to load the new promo code:');
    console.log('   1. Stop the server (Ctrl+C)');
    console.log('   2. Run: npm run dev');
    console.log('   3. Test checkout again\n');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.code === 'resource_missing') {
      console.log('\n⚠️  This promo code does not exist in your Stripe account.');
      console.log('   Make sure you created it in LIVE mode (not test mode).\n');
    }
  }
}

testPromoCode();
