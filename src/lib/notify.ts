"use client";

// Ask the server to send waiting emails now. The database already knows what to send,
// so this carries no data. "keepalive" lets the request finish after the page changes.
// If it fails, the daily job sends the email later.
export function pingNotify() {
  try {
    fetch("/api/notify", { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    // ignore
  }
}
