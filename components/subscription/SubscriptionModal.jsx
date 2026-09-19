import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { SubscriptionPage } from "../../pages/subscription/SubscriptionPage";

/**
 * The plans, over whatever the viewer was doing.
 *
 * Tapping Like or Comment without a subscription used to navigate to
 * /subscription, which unmounted the feed: the video stopped, the scroll
 * position went, and Back brought people to the top of a freshly loaded feed
 * rather than the post they were looking at. Asking somebody to subscribe is
 * an interruption, so it is presented as one -- the feed stays mounted
 * underneath and is still there when the sheet closes.
 *
 * /subscription is still a real route (deep links, Settings, the telebirr
 * SuperApp entry), and renders the same component in its page form. Only the
 * shell differs.
 *
 * ## Why the backdrop is a sibling, not a parent
 *
 * The page renders its own `position: fixed` dialogs inside itself -- the
 * payment-method chooser, the phone step, the terms sheet. A `filter`,
 * `backdrop-filter` or `transform` on any ancestor of those would make it
 * their containing block, and they would position themselves against this
 * card instead of the viewport: a full-screen dialog rendering as a small box
 * somewhere inside the sheet. The blurred backdrop is therefore a sibling of
 * the card, and nothing on the path down to the page carries a filter or a
 * transform.
 */
export function SubscriptionModal({ open, onClose, user, onAuthSuccess, onLogin }) {
  // Escape closes, and the page behind must not scroll while this is over it.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  // Whatever is playing behind should not keep playing over the sheet.
  useEffect(() => {
    if (!open) return;
    document.querySelectorAll("video").forEach((v) => {
      if (!v.paused) v.pause();
    });
  }, [open]);

  if (!open) return null;

  const ui = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a plan"
      data-flipstar-sub-sheet
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 4000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      {/* Sibling of the card. See the note above before adding a filter to
          anything that contains the card itself. */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.62)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          animation: "flipstarSubFade 180ms ease-out",
        }}
      />

      <div
        data-flipstar-sub-card
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 480,
          maxHeight: "92dvh",
          display: "flex",
          flexDirection: "column",
          background: "#0B0B0C",
          color: "#fff",
          borderRadius: "22px 22px 0 0",
          border: "1px solid #242424",
          borderBottom: "none",
          boxShadow: "0 -18px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
          animation: "flipstarSubRise 260ms cubic-bezier(0.22, 1, 0.36, 1)",
          // Clears the phone's home indicator without padding the sides,
          // which would cut into the sheet's own layout.
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Grab handle: says "this dismisses downward" without a label. */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: "#333",
            }}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 2,
            width: 32,
            height: 32,
            borderRadius: 16,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid #242424",
            color: "#bbb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <SubscriptionPage
            variant="modal"
            user={user}
            onBack={onClose}
            onAuthSuccess={onAuthSuccess}
            onLogin={onLogin}
          />
        </div>
      </div>

      {/* The animation runs on the card, so it carries a transform for its
          duration. That is fine -- the page's own fixed dialogs are not open
          while the sheet is still arriving -- but it is why the blur lives on
          the backdrop and never on an ancestor of the card. */}
      <style>{`
        @keyframes flipstarSubFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes flipstarSubRise {
          from { transform: translateY(18px); opacity: 0 }
          to   { transform: translateY(0);    opacity: 1 }
        }
        @media (min-width: 640px) {
          [data-flipstar-sub-sheet] { align-items: center !important; }
          [data-flipstar-sub-card] {
            border-radius: 22px !important;
            border-bottom: 1px solid #242424 !important;
            max-height: 88dvh !important;
            box-shadow: 0 24px 70px rgba(0,0,0,0.65) !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-flipstar-sub-card] { animation: none !important; }
        }
      `}</style>
    </div>
  );

  return createPortal(ui, document.body);
}

export default SubscriptionModal;
