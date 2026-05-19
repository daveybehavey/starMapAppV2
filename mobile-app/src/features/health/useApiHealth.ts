import { useQuery } from "@tanstack/react-query";
import { getApiHealth } from "@/lib/api/endpoints";

export function useApiHealth() {
  return useQuery({
    queryKey: ["api-health"],
    queryFn: getApiHealth,
  });
}
