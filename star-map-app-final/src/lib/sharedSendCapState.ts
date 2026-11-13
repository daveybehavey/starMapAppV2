/** One global attempt window. Pending reservations never age out: a crashed
 * caller may already have invoked its provider. Only proven non-attempts release.
 */
export const SEND_CAP_OBJECT_NAME = "commercial-send-cap:v1:global";
export const SEND_CAP_WINDOW_MS = 86_400_000;
export type SendFamily = "promotion" | "review";
export type SendCapState = {
  kind: "send_cap";
  slots: Array<{ id: string; family: SendFamily; reservedAt: number; attemptedAt: number | null }>;
};

export function isValidSendCapState(value: unknown): value is SendCapState {
  if (!value || typeof value !== "object") return false;
  const state = value as SendCapState;
  if (state.kind !== "send_cap" || !Array.isArray(state.slots)) return false;
  const ids = new Set<string>();
  return state.slots.every((slot) => {
    if (
      !slot ||
      typeof slot.id !== "string" ||
      !slot.id ||
      ids.has(slot.id) ||
      !["promotion", "review"].includes(slot.family) ||
      !Number.isSafeInteger(slot.reservedAt) ||
      slot.reservedAt < 0 ||
      (slot.attemptedAt !== null &&
        (!Number.isSafeInteger(slot.attemptedAt) || slot.attemptedAt < slot.reservedAt))
    )
      return false;
    ids.add(slot.id);
    return true;
  });
}

export function reserveSendSlot(
  state: SendCapState | null,
  input: {
    id: string;
    family: SendFamily;
    now: number;
    cap: number;
  }
): { state: SendCapState; reserved: boolean } {
  if (
    (state !== null && !isValidSendCapState(state)) ||
    !Number.isSafeInteger(input.now) ||
    input.now < 0 ||
    !Number.isSafeInteger(input.cap) ||
    input.cap < 1 ||
    !input.id ||
    !["promotion", "review"].includes(input.family)
  )
    throw new Error("send_cap_invalid_state");
  // A backwards clock must not silently discard future attempts.
  if (state?.slots.some((slot) => (slot.attemptedAt ?? slot.reservedAt) > input.now)) {
    throw new Error("send_cap_clock_regressed");
  }
  const slots = (state?.slots ?? []).filter(
    (slot) => slot.attemptedAt === null || slot.attemptedAt > input.now - SEND_CAP_WINDOW_MS
  );
  if (slots.some((slot) => slot.id === input.id)) throw new Error("send_cap_duplicate_reservation");
  if (slots.length >= input.cap) return { state: { kind: "send_cap", slots }, reserved: false };
  return {
    state: {
      kind: "send_cap",
      slots: [
        ...slots,
        {
          id: input.id,
          family: input.family,
          reservedAt: input.now,
          attemptedAt: null,
        },
      ],
    },
    reserved: true,
  };
}

export function settleSendSlot(
  state: SendCapState,
  input: {
    id: string;
    attemptedAt: number | null;
    now: number;
  }
): SendCapState {
  if (!isValidSendCapState(state)) throw new Error("send_cap_invalid_state");
  const slot = state.slots.find((item) => item.id === input.id);
  if (!slot) throw new Error("send_cap_unknown_reservation");
  if (slot.attemptedAt !== null) throw new Error("send_cap_already_committed");
  if (
    input.attemptedAt !== null &&
    (!Number.isSafeInteger(input.attemptedAt) ||
      input.attemptedAt < slot.reservedAt ||
      input.attemptedAt > input.now)
  ) {
    throw new Error("send_cap_invalid_attempt_time");
  }
  return {
    kind: "send_cap",
    slots:
      input.attemptedAt === null
        ? state.slots.filter((item) => item.id !== input.id)
        : state.slots.map((item) =>
            item.id === input.id ? { ...item, attemptedAt: input.attemptedAt } : item
          ),
  };
}
