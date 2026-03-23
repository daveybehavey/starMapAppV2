"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EditorFontShell from "@/components/EditorFontShell";
import { track } from "@/lib/analytics";

type AccountSessionItem = {
  sessionId: string;
  createdAt: number;
  label: string;
  orderType: "digital" | "print";
  printVariant: "poster_framed" | "poster_unframed" | null;
  plan: "single" | "pack3" | "subscription" | null;
  downloadUrl: string | null;
  creditsRemaining: number | null;
  subscriptionActive: boolean;
};

type ViewState = "checking" | "auth_required" | "claiming" | "ready" | "error";

const supportEmail = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@starmapco.com").trim() || "support@starmapco.com";

function formatDate(epochMs: number) {
  try {
    return new Date(epochMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Recent";
  }
}

function planLabel(item: AccountSessionItem) {
  if (item.orderType === "print") {
    if (item.printVariant === "poster_framed") return "Framed print";
    if (item.printVariant === "poster_unframed") return "Unframed print";
    return "Print order";
  }
  if (item.plan === "pack3") return "3 HD credits";
  if (item.plan === "subscription") return "Unlimited HD";
  return "Single HD";
}

function detectDeviceKind() {
  if (typeof navigator === "undefined") return "desktop";
  const userAgent = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  if (/android/i.test(userAgent)) return "android";
  return "desktop";
}

export default function MyDownloadsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AccountSessionItem[]>([]);
  const [email, setEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [magicMessage, setMagicMessage] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [copyLinkError, setCopyLinkError] = useState<string | null>(null);
  const claimHandledRef = useRef(false);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceKind = useMemo(() => detectDeviceKind(), []);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const loadSessions = useCallback(async () => {
    setView("checking");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/account/my-sessions", { cache: "no-store" });
      if (res.status === 401) {
        setSessions([]);
        setView("auth_required");
        return;
      }
      if (!res.ok) {
        throw new Error("load_failed");
      }
      const payload = (await res.json()) as { ok?: boolean; sessions?: AccountSessionItem[] };
      if (!payload?.ok) {
        throw new Error("load_failed");
      }
      setSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
      setView("ready");
    } catch {
      setView("error");
      setErrorMessage("Could not load your downloads right now. Please retry.");
    }
  }, []);

  const claimMagicToken = useCallback(
    async (token: string) => {
      setView("claiming");
      setErrorMessage(null);
      try {
        const res = await fetch("/api/account/magic/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          throw new Error("invalid_token");
        }
        track("account_magic_link_claimed", { source: "my_downloads" });
        router.replace("/my-downloads");
        await loadSessions();
      } catch {
        setView("auth_required");
        setErrorMessage("This sign-in link expired or was already used. Request a new link below.");
        track("account_magic_link_claimed", { source: "my_downloads", outcome: "invalid" });
      }
    },
    [loadSessions, router],
  );

  useEffect(() => {
    const token = searchParams.get("token")?.trim();
    if (token && !claimHandledRef.current) {
      claimHandledRef.current = true;
      void claimMagicToken(token);
      return;
    }
    if (!token) {
      claimHandledRef.current = true;
      void loadSessions();
    }
  }, [claimMagicToken, loadSessions, searchParams]);

  useEffect(() => {
    if (view !== "ready") return;
    track("my_downloads_sessions_loaded", {
      session_count: sessions.length,
    });
  }, [sessions.length, view]);

  const requestMagicLink = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMagicStatus("error");
      setMagicMessage("Enter the checkout email used for your order.");
      return;
    }
    setMagicStatus("sending");
    setMagicMessage(null);
    try {
      const res = await fetch("/api/account/magic/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!res.ok) {
        if (res.status === 400) {
          setMagicStatus("error");
          setMagicMessage("Use a valid email address.");
          track("account_magic_link_requested", { source: "my_downloads", outcome: "invalid_email" });
          return;
        }
        if (res.status === 429) {
          setMagicStatus("error");
          setMagicMessage("Too many attempts. Please wait before trying again.");
          track("account_magic_link_requested", { source: "my_downloads", outcome: "rate_limited" });
          return;
        }
        const payload = (await res.json().catch(() => null)) as { error?: string; supportEmail?: string } | null;
        if (payload?.error === "account_magic_link_not_configured") {
          const contact = payload.supportEmail || supportEmail;
          setMagicStatus("error");
          setMagicMessage(`Sign-in links are unavailable right now. Email ${contact} for manual recovery.`);
          track("account_magic_link_requested", { source: "my_downloads", outcome: "not_configured" });
          return;
        }
        throw new Error("request_failed");
      }
      setMagicStatus("sent");
      setMagicMessage("If that email matches a paid order, we sent a secure sign-in link.");
      track("account_magic_link_requested", { source: "my_downloads", outcome: "accepted" });
    } catch {
      setMagicStatus("error");
      setMagicMessage(`Could not send a sign-in link yet. Please retry or email ${supportEmail}.`);
      track("account_magic_link_requested", { source: "my_downloads", outcome: "error" });
    }
  }, [email]);

  const handleCopySessionLink = useCallback(
    async (item: AccountSessionItem) => {
      if (!item.downloadUrl) return;
      try {
        await navigator.clipboard.writeText(item.downloadUrl);
        setCopiedSessionId(item.sessionId);
        setCopyLinkError(null);
        if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = setTimeout(() => {
          setCopiedSessionId((current) => (current === item.sessionId ? null : current));
        }, 2000);
        track("my_downloads_copy_link_clicked", {
          order_type: item.orderType,
          plan: item.plan ?? undefined,
          print_variant: item.printVariant ?? undefined,
        });
      } catch {
        setCopyLinkError("Could not copy link right now. You can still open it directly.");
      }
    },
    [],
  );

  const handleLogout = useCallback(async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await fetch("/api/account/magic/logout", { method: "POST" });
    } finally {
      setLogoutLoading(false);
      setSessions([]);
      setView("auth_required");
    }
  }, [logoutLoading]);

  return (
    <EditorFontShell>
      <main className="min-h-screen bg-gradient-to-b from-[#0b1433] via-[#0b1a30] to-[#0b1433] px-4 py-10 text-amber-50 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <section className="rounded-3xl border border-amber-200/30 bg-white/10 px-6 py-8 shadow-2xl backdrop-blur sm:px-8">
            <h1 className="text-3xl font-semibold text-white font-[var(--font-playfair)]">My Downloads</h1>
            <p className="mt-2 text-sm text-amber-100/85">
              Restore access from any device. Open a secure sign-in link from your order email, then launch your
              HD download links directly.
            </p>
            {view === "claiming" && (
              <p className="mt-3 text-xs text-amber-100/80">Verifying your secure sign-in link…</p>
            )}
            {errorMessage && (
              <p className="mt-3 text-xs text-rose-200">{errorMessage}</p>
            )}
          </section>

          {(view === "auth_required" || view === "checking" || view === "error") && (
            <section className="rounded-2xl border border-white/10 bg-white/6 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-100">Email Sign-In Link</h2>
              <p className="mt-2 text-sm text-neutral-200">
                Enter the email from checkout. We&apos;ll send a secure link to open your downloads.
              </p>
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void requestMagicLink();
                }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (magicStatus !== "idle") {
                      setMagicStatus("idle");
                      setMagicMessage(null);
                    }
                  }}
                  placeholder="you@email.com"
                  autoComplete="email"
                  className="min-w-0 flex-1 rounded-full border border-white/20 bg-white px-3 py-2 text-sm text-midnight placeholder:text-neutral-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/50"
                />
                <button
                  type="submit"
                  disabled={magicStatus === "sending"}
                  className="rounded-full border border-amber-200 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {magicStatus === "sending" ? "Sending..." : "Send sign-in link"}
                </button>
              </form>
              {magicMessage && (
                <p className={`mt-3 text-xs ${magicStatus === "sent" ? "text-emerald-200" : "text-rose-200"}`}>
                  {magicMessage}
                </p>
              )}
              <p className="mt-3 text-xs text-neutral-300">
                Mobile tip: on iPhone, downloaded files are in <strong>Files → Browse → Downloads</strong> (not Photos).
              </p>
            </section>
          )}

          {view === "ready" && (
            <section className="rounded-2xl border border-white/10 bg-white/6 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-100">Recent Paid Sessions</h2>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={logoutLoading}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:border-white/40 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {logoutLoading ? "Signing out..." : "Sign out"}
                </button>
              </div>
              {sessions.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-200">
                  No active downloadable sessions found for this email. If you recently paid, wait a minute and refresh.
                </p>
              ) : (
                <div className="mt-4 grid gap-3">
                  <p className="text-xs text-amber-100/80">
                    Tip: a 3-credit pack means one HD export per map. If you want different files, create/edit the next
                    map in the editor before opening the next download.
                  </p>
                  <p className="text-xs text-amber-100/80">
                    {deviceKind === "ios"
                      ? "iPhone tip: files save to Files app → Browse → Downloads."
                      : deviceKind === "android"
                        ? "Android tip: check Files/My Files → Downloads."
                        : "Desktop tip: check your browser Downloads history if the file doesn't open immediately."}
                  </p>
                  {sessions.map((item) => (
                    <article key={item.sessionId} className="rounded-xl border border-white/12 bg-white/8 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.label}</p>
                          <p className="mt-0.5 text-xs text-amber-100/80">
                            {planLabel(item)} • {formatDate(item.createdAt)}
                          </p>
                        </div>
                        {item.downloadUrl ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <a
                              href={item.downloadUrl}
                              onClick={() => {
                                track("my_downloads_open_download_clicked", {
                                  order_type: item.orderType,
                                  plan: item.plan ?? undefined,
                                  print_variant: item.printVariant ?? undefined,
                                });
                              }}
                              className="rounded-full border border-amber-200 bg-amber-400/20 px-3 py-2 text-[11px] font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-400/30"
                            >
                              Open download
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopySessionLink(item)}
                              className="rounded-full border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-semibold text-amber-100/90 transition hover:border-white/45 hover:bg-white/15"
                            >
                              {copiedSessionId === item.sessionId ? "Link copied" : "Copy secure link"}
                            </button>
                          </div>
                        ) : (
                          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-semibold text-neutral-300">
                            Download unavailable
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] text-neutral-300">
                        {item.subscriptionActive
                          ? "Unlimited HD active."
                          : item.plan === "pack3" && typeof item.creditsRemaining === "number"
                            ? `${item.creditsRemaining} HD credit${item.creditsRemaining === 1 ? "" : "s"} remaining. Each export uses one credit for the current map.`
                            : typeof item.creditsRemaining === "number"
                              ? `${item.creditsRemaining} HD credit${item.creditsRemaining === 1 ? "" : "s"} remaining.`
                              : "Availability depends on this order state."}
                      </p>
                      {item.plan === "pack3" && (item.creditsRemaining ?? 0) > 0 && (
                        <div className="mt-3">
                          <Link
                            href="/editor?mode=quick&source=my-downloads-pack3-create-next"
                            onClick={() => {
                              track("my_downloads_create_next_map_clicked", {
                                credits_remaining: item.creditsRemaining ?? undefined,
                              });
                            }}
                            className="inline-flex rounded-full border border-amber-200/60 bg-amber-300/15 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:-translate-y-[1px] hover:bg-amber-300/25"
                          >
                            Create next map
                          </Link>
                        </div>
                      )}
                    </article>
                  ))}
                  {copyLinkError && <p className="text-xs text-rose-200">{copyLinkError}</p>}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/download"
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/15"
                >
                  Go to download page
                </Link>
                <Link
                  href="/editor"
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/15"
                >
                  Open editor
                </Link>
              </div>
            </section>
          )}
        </div>
      </main>
    </EditorFontShell>
  );
}
