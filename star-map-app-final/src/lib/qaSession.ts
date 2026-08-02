export {
  applyQaCheckoutMetadata,
  normalizeQaSource,
  qaCheckoutIdempotencyTag,
  resolveQaRequestContext,
} from "./qaSession.mjs";

export type QaRequestContext = {
  enabled: boolean;
  source: string | null;
  status: "absent" | "enabled" | "unauthorized";
};
