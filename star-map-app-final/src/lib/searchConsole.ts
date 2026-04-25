import { loadGoogleServiceAccountJson } from "@/lib/googleServiceAccount";
import { getGoogleAccessToken } from "@/lib/googleAccessToken";

const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

type SearchAnalyticsQueryRequest = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  searchType?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
};

export async function querySearchConsole({
  siteUrl,
  request,
}: {
  siteUrl: string;
  request: SearchAnalyticsQueryRequest;
}) {
  const serviceAccount = loadGoogleServiceAccountJson({
    inlineEnvVar: "GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON",
    pathEnvVar: "GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_PATH",
    fallbackPathEnvVar: "GOOGLE_APPLICATION_CREDENTIALS",
    missingMessage:
      "Missing Google Search Console service account credentials. Set GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_PATH, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON.",
  });

  const accessToken = await getGoogleAccessToken({
    serviceAccount,
    scope: SEARCH_CONSOLE_SCOPE,
  });

  const response = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    throw new Error(
      `Search Console API request failed: POST searchAnalytics/query -> HTTP ${response.status} ${text || ""}`,
    );
  }
  return parsed;
}

