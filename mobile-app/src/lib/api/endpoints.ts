import { z } from "zod";
import { apiFetch } from "@/lib/api/apiClient";

const healthSchema = z.object({
  paid: z.boolean(),
  plan: z.enum(["single", "pack3", "subscription"]).nullable().optional(),
});

export type HealthResponse = z.infer<typeof healthSchema>;

export async function getApiHealth() {
  const result = await apiFetch<unknown>("/premium");
  return healthSchema.parse(result);
}
