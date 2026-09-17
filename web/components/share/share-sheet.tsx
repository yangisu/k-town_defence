"use client";

import { useState } from "react";
import type { ShareCard } from "@/features/share/build-share-card";
import { Check, Share2 } from "@/components/ui/icons";

/**
 * Prefers the OS share sheet (`navigator.share`), which already lists
 * KakaoTalk/X/etc. as targets on mobile with zero provider SDKs or
 * keys. Desktop browsers without `navigator.share` fall back to copying the
 * link.
 */
export function ShareSheet({ card, label = "결과 공유하기" }: { card: ShareCard; label?: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: card.title, text: card.description, url: card.shareUrl });
        return;
      } catch {
        // User cancelled the OS share sheet, or the platform rejected it — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(card.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the button simply does nothing then.
    }
  };

  return (
    <button type="button" className="primary-button compact share-sheet-trigger" onClick={() => void share()}>
      {copied ? <Check size={16} /> : <Share2 size={16} />}
      {copied ? "링크 복사됨" : label}
    </button>
  );
}
