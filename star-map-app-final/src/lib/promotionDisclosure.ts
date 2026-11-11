/** Immutable, append-only disclosure artifacts. Hash is SHA-256 of exact UTF-8 text;
 * layout-only whitespace outside the text is immaterial. Never edit an issued version. */
export const RD_K_DISCLOSURE = Object.freeze({
  version: "rdk-en-2026-11-10-v1",
  text: "I agree to receive StarMapCo promotional email, including updates about new looks, sales, and restocks. I can unsubscribe at any time.",
  hash: "09a783f3adb5084faf3b07a77779038967a9c84136bf70376fa91c53591f0a18",
  sender: "StarMapCo",
  channel: "email",
  scope: "StarMapCo promotional email",
  locale: "en",
  variant: "homepage",
  presentationVersion: "rdk-checkbox-v1",
  controlText: "I agree to receive StarMapCo promotional email",
  defaultChecked: false,
});
const disclosures = Object.freeze({ [RD_K_DISCLOSURE.version]: RD_K_DISCLOSURE });
export function resolvePromotionDisclosure(version: string) {
  return Object.prototype.hasOwnProperty.call(disclosures, version)
    ? disclosures[version as keyof typeof disclosures]
    : null;
}
export type PromotionCapture = {
  email: string;
  disclosureVersion: string;
  disclosureHash: string;
  affirmativeAction: "checkbox_and_submit";
};
