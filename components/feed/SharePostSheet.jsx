import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, Send, Loader2, AlertCircle, Users } from 'lucide-react';
import api from '../../api';

/**
 * Send a post to other users, as a bottom sheet.
 *
 * Why this component exists
 * -------------------------
 * Three screens offered Share and three did different things. HomePage and
 * ReelLayout each carried their own copy of a share modal -- near-identical,
 * separately maintained -- while VideoDetailPage (`/post/:id`) and the desktop
 * reel viewer only copied a link to the clipboard. On a phone served over
 * plain HTTP that last one silently did nothing at all: `navigator.clipboard`
 * is undefined outside a secure context, so the `.then()` threw and the button
 * appeared dead.
 *
 * What changed underneath
 * -----------------------
 * The old flow sent a text message ending in a literal "[POST_ID:35]" marker
 * that the recipient's client regexed back out, and it called the share
 * endpoint once per recipient -- so one Send to five people counted as five
 * shares. This talks to `/reels/<id>/share-with/`, which takes every recipient
 * at once, stores the post as a real foreign key, and moves the count once.
 *
 * Selection, not immediate send
 * -----------------------------
 * The previous modals sent the moment an avatar was tapped, which made a
 * mis-tap unrecoverable and multiple recipients a sequence of separate sends.
 * Here tapping selects, and nothing leaves until Send.
 */

const MAX_RECIPIENTS = 20;

export function SharePostSheet({
  post,
  currentUser,
  open,
  onClose,
  onShared,
  T = {},
}) {
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // {kind:'error'|'success', text}

  const searchTimer = useRef(null);
  const followedCache = useRef([]);
  // Guards against a second submit while the first is in flight. State alone
  // is not enough: two taps in the same frame both read the pre-update value.
  const inFlight = useRef(false);

  const accent = T.pri || '#8fc441';
  const surface = T.cardBg || '#fff';
  const text = T.txt || '#111';
  const muted = T.sub || '#666';

  const excludedIds = useMemo(
    () => new Set([currentUser?.id, post?.user?.id].filter((v) => v != null)),
    [currentUser?.id, post?.user?.id],
  );

  const loadFollowing = useCallback(async () => {
    setLoadingPeople(true);
    try {
      const res = await api.getFollowing(currentUser?.id);
      const rows = Array.isArray(res) ? res : res?.results || [];
      // FollowSerializer returns {follower, following, ...}; unwrap when present
      // so this accepts both that shape and a plain user list.
      const seen = new Map();
      rows.forEach((row) => {
        const u = row?.following || row;
        if (u?.id != null && !excludedIds.has(u.id)) seen.set(u.id, u);
      });
      const list = Array.from(seen.values());
      followedCache.current = list;
      setPeople(list);
    } catch {
      // An empty list renders the "no one to share with" state, which is
      // honest here -- the alternative is a spinner that never resolves.
      setPeople([]);
    } finally {
      setLoadingPeople(false);
    }
  }, [currentUser?.id, excludedIds]);

  // Reset per opening. Without this, a previous sheet's selection and success
  // banner reappear the next time Share is tapped on a different post.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(new Set());
    setStatus(null);
    setSending(false);
    inFlight.current = false;
    if (followedCache.current.length) {
      setPeople(followedCache.current);
    } else {
      loadFollowing();
    }
  }, [open, post?.id, loadFollowing]);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const runSearch = (value) => {
    setQuery(value);
    clearTimeout(searchTimer.current);

    if (!value.trim()) {
      setSearching(false);
      setPeople(followedCache.current);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.request(
          `/search/?q=${encodeURIComponent(value.trim())}&type=users`,
        );
        const rows = Array.isArray(res?.users)
          ? res.users
          : Array.isArray(res)
            ? res
            : res?.results || [];
        setPeople(rows.filter((u) => u?.id != null && !excludedIds.has(u.id)));
      } catch {
        setPeople([]);
        setStatus({ kind: 'error', text: 'Search failed. Check your connection.' });
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const toggle = (id) => {
    setStatus(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_RECIPIENTS) {
          setStatus({
            kind: 'error',
            text: `You can send to at most ${MAX_RECIPIENTS} people at once.`,
          });
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const send = async () => {
    if (inFlight.current || selected.size === 0 || !post?.id) return;
    inFlight.current = true;
    setSending(true);
    setStatus(null);

    try {
      const res = await api.request(`/reels/${post.id}/share-with/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: Array.from(selected) }),
      });

      const count = res?.recipient_ids?.length ?? selected.size;
      setStatus({
        kind: 'success',
        text: count === 1 ? 'Sent' : `Sent to ${count} people`,
      });

      // The server is the authority on the new count -- it increments once per
      // action, not once per recipient, so the client must not add its own.
      onShared?.({ shares: res?.shares, recipientIds: res?.recipient_ids || [] });

      setTimeout(() => onClose?.(), 900);
    } catch (err) {
      setStatus({ kind: 'error', text: describeError(err) });
      // Released so the user can correct and retry; the success path keeps it
      // held until the sheet closes, which is what stops a double send.
      inFlight.current = false;
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const emptyMessage = query.trim()
    ? `No users matching "${query.trim()}"`
    : 'No one to share with yet. Follow someone first.';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share post"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          background: surface,
          color: text,
          borderRadius: '18px 18px 0 0',
          /* Caps the sheet below the viewport so the Send button is always
             reachable, and dvh so a mobile URL bar appearing does not push it
             off-screen. */
          maxHeight: 'min(78dvh, 640px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.28)',
          /* Keeps the footer clear of the home indicator on iOS. */
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: muted, opacity: 0.35 }} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 16px 10px',
          }}
        >
          <strong style={{ fontSize: 16 }}>Share</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share sheet"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 16px 10px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              color={muted}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 34px 10px 34px',
                borderRadius: 10,
                border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
                background: T.inputBg || 'rgba(0,0,0,0.04)',
                color: text,
                /* 16px keeps iOS Safari from zooming the page on focus. */
                fontSize: 16,
                outline: 'none',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => runSearch('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: muted,
                  padding: 4,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px', minHeight: 120 }}>
          {loadingPeople || searching ? (
            <Centered>
              <Loader2 size={20} className="fs-spin" color={muted} />
              <span style={{ color: muted, fontSize: 13 }}>
                {searching ? 'Searching…' : 'Loading people…'}
              </span>
            </Centered>
          ) : people.length === 0 ? (
            <Centered>
              <Users size={22} color={muted} />
              <span style={{ color: muted, fontSize: 13, textAlign: 'center', padding: '0 24px' }}>
                {emptyMessage}
              </span>
            </Centered>
          ) : (
            people.map((u) => {
              const isSelected = selected.has(u.id);
              const name = u.username || u.first_name || `User ${u.id}`;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  aria-pressed={isSelected}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    borderRadius: 12,
                    background: isSelected ? `${accent}1f` : 'transparent',
                    color: text,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Avatar user={u} accent={accent} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      fontWeight: isSelected ? 700 : 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      flexShrink: 0,
                      border: `2px solid ${isSelected ? accent : 'rgba(128,128,128,0.45)'}`,
                      background: isSelected ? accent : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isSelected && <Check size={13} color="#fff" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {status && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: '8px 16px 0',
              padding: '9px 12px',
              borderRadius: 10,
              fontSize: 13,
              background: status.kind === 'error' ? 'rgba(220,38,38,0.10)' : `${accent}1f`,
              color: status.kind === 'error' ? '#dc2626' : accent,
            }}
          >
            {status.kind === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
            <span>{status.text}</span>
          </div>
        )}

        <div style={{ padding: '12px 16px 16px' }}>
          <button
            type="button"
            onClick={send}
            disabled={sending || selected.size === 0}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: 12,
              border: 'none',
              background: selected.size === 0 ? 'rgba(128,128,128,0.25)' : accent,
              color: selected.size === 0 ? muted : '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: sending || selected.size === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: sending ? 0.8 : 1,
            }}
          >
            {sending ? (
              <>
                <Loader2 size={17} className="fs-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send size={17} />
                {selected.size === 0
                  ? 'Select people to share with'
                  : `Send${selected.size > 1 ? ` to ${selected.size}` : ''}`}
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fs-spin-kf { to { transform: rotate(360deg); } }
        .fs-spin { animation: fs-spin-kf 0.9s linear infinite; }
      `}</style>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '38px 0',
      }}
    >
      {children}
    </div>
  );
}

function Avatar({ user, accent }) {
  const src = user?.profile_photo || user?.profile?.profile_photo || null;
  const letter = (user?.username || user?.first_name || '?').charAt(0).toUpperCase();
  const base = {
    width: 38,
    height: 38,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
  };
  if (src) return <img src={src} alt="" style={base} />;
  return (
    <span
      style={{
        ...base,
        background: accent,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 15,
      }}
    >
      {letter}
    </span>
  );
}

/**
 * Turn a failed request into something worth reading.
 *
 * The requirement is that every failure says something. A silent catch here
 * would reproduce the original bug -- a Share button that appears to do
 * nothing -- just one step further along.
 */
function describeError(err) {
  const raw = typeof err?.message === 'string' ? err.message : '';

  let payload = err?.response?.data || err?.data || null;
  if (!payload && raw.trim().startsWith('{')) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }
  const serverText = payload?.error || payload?.detail || payload?.message;

  const status = err?.status ?? err?.response?.status ?? statusFromMessage(raw);

  if (status === 401 || status === 403) return 'Please sign in again to share this post.';
  if (status === 404) return 'This post is no longer available.';
  if (status === 429) return 'Too many attempts. Please wait a moment.';
  if (status >= 500) return 'Something went wrong on our end. Please try again.';

  if (serverText) return serverText;

  if (/timeout|timed out|abort/i.test(raw)) return 'The request timed out. Please try again.';
  if (/network|failed to fetch|offline/i.test(raw)) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not share this post. Please try again.';
}

function statusFromMessage(message) {
  const match = /\[HTTP\s+(\d{3})\]/.exec(message || '');
  return match ? Number(match[1]) : undefined;
}

export default SharePostSheet;
