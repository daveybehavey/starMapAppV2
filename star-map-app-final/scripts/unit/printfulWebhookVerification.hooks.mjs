export async function resolve(specifier, context, nextResolve) {
  const stubs = {
    "next/server": "printWebhookResolveRace.nextServer.stub.mjs",
    "@/lib/printfulWebhookOrderEvents": "printfulWebhookVerification.events.stub.mjs",
    "@/lib/shippingNotifications": "printfulWebhookVerification.events.stub.mjs",
    "@/lib/kv": "printfulWebhookVerification.events.stub.mjs",
  };
  if (stubs[specifier]) {
    return { url: new URL(stubs[specifier], import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
