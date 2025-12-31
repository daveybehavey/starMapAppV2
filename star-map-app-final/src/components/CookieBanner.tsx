"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookiesAccepted";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (accepted !== "true") {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <div className="cookie-text">
        We use cookies to analyze traffic and improve your experience on StarMapCo. By continuing, you accept our use of
        cookies. Read our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </div>
      <div className="cookie-actions">
        <button type="button" className="cookie-btn cookie-btn-primary" onClick={handleAccept}>
          Accept
        </button>
        <button type="button" className="cookie-btn cookie-btn-secondary" onClick={handleAccept}>
          Manage Preferences
        </button>
      </div>
    </div>
  );
}
