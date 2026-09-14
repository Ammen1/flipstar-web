import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Send, X, Wallet, AlertCircle, Info } from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { AlertModal } from '../../components/common/AlertModal';

const CATEGORY_ICONS = {
  flowers: '🌹',
  hearts: '❤️',
  gems: '💎',
  special: '⭐',
  animals: '🐻',
  vehicles: '🚗',
};

const RARITY_COLORS = {
  common: '#A0A0A0',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

/**
 * Coins that can actually pay for a gift.
 *
 * Not the same as the wallet total, and not `purchased` either. Exactly one
 * bucket is giftable -- coins bought with money via Telebirr. Reward coins,
 * airtime top-ups and subscription bonus coins all spend fine elsewhere in the
 * app and are all refused here, so showing any of them next to the Send button
 * promises a gift the backend will decline.
 *
 * `giftable` is sent by the wallet endpoint for exactly this purpose; the
 * fallbacks cover a response from before that field existed.
 */
function giftableFrom(balance) {
  if (!balance) return 0;
  return balance.giftable ?? balance.telebirr_purchased ?? 0;
}

/** Subscription bonus coins, which are shown but never counted as spendable here. */
function bonusFrom(balance) {
  return balance?.bonus ?? 0;
}

export default function GiftPage({ username, reelId, onClose, onShowWallet, onShowCoinPurchase }) {
  const { colors: T } = useTheme();
  const { openTopUpModal } = useAuth();
  const [gifts, setGifts] = useState([
    { id: 1, name: 'Rose', description: 'A beautiful red rose', coin_value: 10, rarity: 'common', category: 'flowers' },
    { id: 2, name: 'Heart', description: 'A heart symbol', coin_value: 20, rarity: 'common', category: 'hearts' },
    { id: 3, name: 'Medal', description: 'A gold medal', coin_value: 50, rarity: 'rare', category: 'special' },
    { id: 4, name: 'Diamond', description: 'A sparkling diamond', coin_value: 100, rarity: 'epic', category: 'gems' },
    { id: 5, name: 'Teddy Bear', description: 'A cute teddy bear', coin_value: 30, rarity: 'common', category: 'animals' },
  ]);
  const [selectedGift, setSelectedGift] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [balanceData, setBalanceData] = useState(null);
  const [showRechargeDialog, setShowRechargeDialog] = useState(false);
  const [rechargeError, setRechargeError] = useState(null);
  const [walletConfig, setWalletConfig] = useState(null);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);

  useEffect(() => {
    loadGifts();
    loadCoinBalance();
    loadWalletConfig();
  }, []);

  const loadGifts = async () => {
    try {
      const response = await api.request('/gifts/');
      const giftsData = response?.results || response;
      // Only a list replaces the defaults. Anything else -- an error body,
      // an envelope, {} -- used to go straight into `gifts`, and the first
      // gifts.map() took the whole page down with it (on Reels: the video
      // stopped and the feed vanished the moment Gift was tapped).
      if (Array.isArray(giftsData) && giftsData.length) setGifts(giftsData);
    } catch (error) {
      console.error('Error loading gifts:', error);
      // Keep using default gifts if API fails
    }
  };

  const loadCoinBalance = async () => {
    try {
      const response = await api.request('/wallet/');
      setCoinBalance(giftableFrom(response.balance));
      setBalanceData(response.balance);
    } catch (error) {
      console.error('Error loading coin balance:', error);
    }
  };

  const loadWalletConfig = async () => {
    try {
      const response = await api.request('/wallet/config/');
      setWalletConfig(response);
    } catch (error) {
      console.error('Error loading wallet config:', error);
    }
  };

  const categories = ['all', ...new Set(gifts.map(g => g.category))];
  
  const filteredGifts = selectedCategory === 'all' 
    ? gifts 
    : gifts.filter(g => g.category === selectedCategory);

  const totalCost = selectedGift ? selectedGift.coin_value * quantity : 0;

  const handleSendGift = async () => {
    if (!username || !selectedGift) return;

    // Log gift send initiation
    try {
      await api.request('/client-log/', {
        method: 'POST',
        body: JSON.stringify({
          level: 'info',
          message: '[GiftPage] Gift send initiated',
          context: { username, gift: selectedGift.name, quantity, totalCost, currentBalance: coinBalance }
        }),
      });
    } catch (e) {}

    // Refresh coin balance before sending to avoid stale data (especially in H5 SuperApp)
    try {
      const freshBalance = await api.request('/wallet/');
      setCoinBalance(giftableFrom(freshBalance.balance));
      setBalanceData(freshBalance.balance);
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[GiftPage] Balance refreshed before send',
            context: { oldBalance: coinBalance, newBalance: giftableFrom(freshBalance.balance) }
          }),
        });
      } catch (e) {}
    } catch (error) {
      console.error('Error refreshing coin balance:', error);
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'error',
            message: '[GiftPage] Failed to refresh balance before send',
            context: { error: error.message }
          }),
        });
      } catch (e) {}
      // Continue with existing balance if refresh fails
    }

    // Validate against wallet config limits
    if (walletConfig?.gifting) {
      const pointsCost = Math.floor(totalCost / (walletConfig.coins_to_points_conversion || 1));

      // Check minimum points per transaction
      if (pointsCost < walletConfig.gifting.min_points_per_transaction) {
        alert(`Minimum ${walletConfig.gifting.min_points_per_transaction} points required per transaction`);
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'warning',
              message: '[GiftPage] Minimum points check failed',
              context: { pointsCost, minRequired: walletConfig.gifting.min_points_per_transaction }
            }),
          });
        } catch (e) {}
        return;
      }

      // Check maximum points per transaction
      if (pointsCost > walletConfig.gifting.max_points_per_transaction) {
        alert(`Maximum ${walletConfig.gifting.max_points_per_transaction} points allowed per transaction`);
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'warning',
              message: '[GiftPage] Maximum points check failed',
              context: { pointsCost, maxAllowed: walletConfig.gifting.max_points_per_transaction }
            }),
          });
        } catch (e) {}
        return;
      }
    }

    if (totalCost > (balanceData?.telebirr_purchased || 0)) {
      // Show insufficient balance modal
      setShowInsufficientModal(true);
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'warning',
            message: '[GiftPage] Insufficient Telebirr coins for gifting',
            context: { totalCost, telebirrBalance: balanceData?.telebirr_purchased || 0, totalBalance: coinBalance }
          }),
        });
      } catch (e) {}
      return;
    }

    setLoading(true);
    try {
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[GiftPage] Calling /gifts/send/ API',
            context: { gift_id: selectedGift.id, recipient_username: username, quantity, message, reel_id }
          }),
        });
      } catch (e) {}

      await api.request('/gifts/send/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gift_id: selectedGift.id,
          recipient_username: username,
          quantity: quantity,
          message: message,
          reel_id: reelId,
        }),
      });

      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[GiftPage] Gift send API success',
            context: { gift_id: selectedGift.id, recipient_username: username }
          }),
        });
      } catch (e) {}

      // Refresh coin balance after successful send to reflect the deduction
      try {
        const freshBalance = await api.request('/wallet/');
        setCoinBalance(giftableFrom(freshBalance.balance));
        setBalanceData(freshBalance.balance);
        // Emit global event so other components (header, wallet page) can refresh
        window.dispatchEvent(new CustomEvent('walletBalanceChanged', { detail: freshBalance }));
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'info',
              message: '[GiftPage] Balance refreshed after send',
              context: { newBalance: giftableFrom(freshBalance.balance) }
            }),
          });
        } catch (e) {}
      } catch (error) {
        console.error('Error refreshing coin balance after send:', error);
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'error',
              message: '[GiftPage] Failed to refresh balance after send',
              context: { error: error.message }
            }),
          });
        } catch (e) {}
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose?.();
      }, 2000);
    } catch (err) {
      console.error('Gift send error:', err);
      const errorData = err.response?.data || err;

      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'error',
            message: '[GiftPage] Gift send failed',
            context: { error: err.message, errorData }
          }),
        });
      } catch (e) {}

      if (errorData.needs_recharge) {
        setShowInsufficientModal(true);
        setRechargeError(errorData);
        setShowRechargeDialog(true);
      } else {
        alert(errorData.error || 'Failed to send gift');
      }
    } finally {
      setLoading(false);
    }
  };

  // surface = one step above the modal card so inset elements are always visible
  const card = T?.cardBg || '#1A1A1A';
  const surface = T?.border || '#333';
  const txt = T?.txt || '#fff';
  const sub = T?.sub || '#999';
  const pri = T?.pri || '#8fc441';
  const border = T?.border || '#333';

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: `1.5px solid ${border}`,
    background: surface,
    color: txt,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const secondaryBtn = {
    flex: 1,
    padding: '12px',
    borderRadius: 10,
    border: `1.5px solid ${border}`,
    background: surface,
    color: txt,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  };

  // Rendered into document.body rather than in place.
  //
  // This sheet is opened from inside the feed (ReelLayout, HomePage, the
  // comment section). A position:fixed element resolves against its nearest
  // transformed or filtered ancestor, not the viewport, so mounted there it
  // was trapped in the feed's stacking context and the app's bottom nav --
  // z-index 1000 against this sheet's 10000 -- still painted over its footer.
  // That is why the Send button was unreachable on the Super App H5.
  //
  // dvh, not vh: iOS Safari's vh includes the area behind the browser chrome,
  // so 85vh is taller than what the user can actually see. The vh line stays
  // first as a fallback for browsers without dvh.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 0, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto', overscrollBehavior: 'contain', boxShadow: '0 -8px 32px rgba(0,0,0,0.6)', border: `1px solid ${border}`, ...(CSS.supports?.('height', '1dvh') ? { maxHeight: '85dvh' } : {}) }}>
        {/* Compact Header: Title + Recipient + Balance */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <Gift size={18} color={pri} />
            <div style={{ fontSize: 15, fontWeight: 700, color: txt, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Gift to <span style={{ color: pri }}>@{username}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: pri, whiteSpace: 'nowrap' }}>🪙 {coinBalance}</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: sub, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎁</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: txt, marginBottom: 4 }}>Gift Sent!</div>
            <div style={{ fontSize: 13, color: sub }}>Your gift has been sent successfully</div>
          </div>
        ) : (
          <>
            {/* Category Filter - compact horizontal scroll */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, paddingBottom: 2, scrollbarWidth: 'none' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 14,
                    border: `1px solid ${selectedCategory === cat ? pri : border}`,
                    background: selectedCategory === cat ? `${pri}22` : surface,
                    color: selectedCategory === cat ? pri : txt,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {cat !== 'all' && CATEGORY_ICONS[cat]} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {/* Gift Selection - compact 4-col grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
              {filteredGifts.map(gift => (
                <button
                  key={gift.id}
                  onClick={() => { setSelectedGift(gift); setQuantity(1); }}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 10,
                    border: `1.5px solid ${selectedGift?.id === gift.id ? pri : border}`,
                    background: selectedGift?.id === gift.id ? `${pri}22` : surface,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 24, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {gift.image_url ? (
                      <img src={gift.image_url} alt={gift.name} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    ) : (
                      CATEGORY_ICONS[gift.category] || '🎁'
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: pri }}>{gift.coin_value}🪙</div>
                </button>
              ))}
            </div>

            {/* Quantity + Message inline row when gift selected */}
            {selectedGift && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, padding: '8px 12px', background: surface, borderRadius: 10, border: `1px solid ${border}` }}>
                <div style={{ fontSize: 13, color: txt, fontWeight: 600 }}>{selectedGift.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${border}`, background: card, color: txt, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>−</button>
                  <div style={{ minWidth: 20, textAlign: 'center', fontSize: 14, fontWeight: 700, color: txt }}>{quantity}</div>
                  <button 
                    onClick={() => {
                      const newQuantity = quantity + 1;
                      const totalCost = selectedGift.coin_value * newQuantity;
                      const pointsCost = Math.floor(totalCost / (walletConfig?.coins_to_points_conversion || 1));
                      const maxPoints = walletConfig?.gifting?.max_points_per_transaction || 5000;
                      if (pointsCost <= maxPoints) {
                        setQuantity(newQuantity);
                      } else {
                        alert(`Maximum ${maxPoints} points allowed per transaction`);
                      }
                    }}
                    style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${border}`, background: card, color: txt, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
                  >+</button>
                </div>
              </div>
            )}

            {/*
              Message + Send, pinned to the bottom of the sheet.

              These used to sit at the end of the scrolling content, so on a
              short viewport the primary action was simply below the fold with
              nothing indicating it was there. Sticky keeps it on screen at
              every scroll position, and the safe-area padding clears the iOS
              home indicator. The negative margins cancel the sheet's own
              horizontal padding so the bar spans the full width.
            */}
            <div
              style={{
                position: 'sticky',
                bottom: 0,
                marginLeft: -16,
                marginRight: -16,
                marginTop: 4,
                padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))',
                background: card,
                borderTop: `1px solid ${border}`,
                boxShadow: '0 -8px 22px rgba(0,0,0,0.45)',
              }}
            >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)..."
              style={{ ...inputStyle, padding: '10px 12px', fontSize: 13, marginBottom: 10 }}
            />

            {/* Send Button */}
            <button
              onClick={handleSendGift}
              disabled={loading || !selectedGift}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                background: loading || !selectedGift ? border : pri,
                color: loading || !selectedGift ? sub : '#000',
                fontSize: 14,
                fontWeight: 700,
                cursor: loading || !selectedGift ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                boxShadow: loading || !selectedGift ? 'none' : `0 4px 16px ${pri}40`,
              }}
            >
              {loading ? 'Sending...' : (
                <>
                  <Send size={16} />
                  Send {selectedGift ? `· 🪙 ${selectedGift.coin_value * quantity}` : 'Gift'}
                </>
              )}
            </button>
            </div>
          </>
        )}

        {/* Recharge Dialog */}
        {showRechargeDialog && rechargeError && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: card, borderRadius: 16, padding: 18, maxWidth: 380, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', border: `1px solid ${border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 28 }}>💰</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: txt }}>Insufficient Coins</div>
                  <div style={{ fontSize: 12, color: sub }}>Need 🪙 {rechargeError.required_coins} · Have 🪙 {rechargeError.current_purchased_coins}</div>
                </div>
              </div>

              {/*
                Top-up hands off to the real Buy Coins page.

                What was here did three things wrong at once: it checked
                `response.payment_url`, which /wallet/telebirr/initiate/ has
                never returned -- it returns `raw_request` for the SuperApp
                bridge -- so the branch never fired and the user got "Payment
                initiation failed" AFTER the backend had already created the
                order and written a pending CoinTransaction. It hardcoded
                package ids 1 and 2, which seed_coin_packages reassigns. And it
                hardcoded prices that could disagree with the database.

                TelebirrH5Service.purchasePackage() already does this properly:
                create order, startPay(raw_request) through the bridge, then
                confirm server-side rather than trusting the client. Rather
                than reimplement it here, this routes to the same top-up entry
                point BoostModal uses.
              */}
              <button
                onClick={() => { onClose?.(); openTopUpModal?.(); }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  background: pri,
                  color: '#000',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: 12,
                }}
              >
                Buy coins
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowRechargeDialog(false)} style={{ ...secondaryBtn, padding: '10px', fontSize: 13 }}>
                  Cancel
                </button>
                <button
                  onClick={() => { setShowRechargeDialog(false); onShowWallet?.(); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: pri, color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Open Wallet
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Insufficient Balance Modal - Custom Decorative */}
        {showInsufficientModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px',
            }}
            onClick={() => setShowInsufficientModal(false)}
          >
            <div
              style={{
                background: `linear-gradient(135deg, ${T.cardBg || '#1A1A1A'} 0%, ${T.cardBg || '#111'} 100%)`,
                borderRadius: 20,
                padding: '32px',
                maxWidth: 420,
                width: '100%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(143,196,65,0.2)',
                animation: 'modalSlideIn 0.3s ease-out',
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative gradient overlay */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                background: 'linear-gradient(90deg, #8fc441, #3B82F6, #8fc441)',
              }} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
                {/* Decorative icon container */}
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, rgba(143,196,65,0.2), rgba(143,196,65,0.1))',
                  border: '2px solid rgba(143,196,65,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Wallet size={32} color="#8fc441" />
                </div>
                
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: 20, 
                    fontWeight: 800, 
                    color: T.txt,
                    letterSpacing: 0.3,
                  }}>
                    Insufficient Balance
                  </h3>
                  <div style={{
                    fontSize: 13,
                    color: T.sub,
                    marginTop: 4,
                    fontWeight: 500,
                  }}>
                    You need more coins to send this gift
                  </div>
                </div>
                
                <button
                  onClick={() => setShowInsufficientModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    color: T.sub,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Balance info card */}
              <div style={{
                background: 'rgba(143,196,65,0.1)',
                border: '1px solid rgba(143,196,65,0.2)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 24,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: T.sub, fontWeight: 500 }}>Giftable Balance</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#8fc441' }}>🪙 {coinBalance}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: T.sub }}>Telebirr (Giftable)</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#3B82F6' }}>🪙 {balanceData?.telebirr_purchased || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: T.sub }}>Airtime (Not Giftable)</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#F59E0B' }}>🪙 {balanceData?.airtime_purchased || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: T.sub }}>Earned (Not Giftable)</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#10B981' }}>🪙 {balanceData?.earned || 0}</span>
                </div>
                {/* Subscription bonus coins. Listed with the other buckets the
                    backend will not accept for a gift, rather than folded into
                    the headline figure -- a user shown 500 spendable coins and
                    then refused would reasonably think the wallet was broken. */}
                {bonusFrom(balanceData) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: T.sub }}>Subscription Bonus (Not Giftable)</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#A855F7' }}>🪙 {bonusFrom(balanceData)}</span>
                  </div>
                )}
                <div style={{
                  height: 1,
                  background: 'rgba(143,196,65,0.2)',
                  margin: '12px 0',
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: T.sub, fontWeight: 500 }}>Required</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: T.txt }}>🪙 {totalCost}</span>
                </div>
              </div>

              {/* Info message */}
              <div style={{
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 24,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <Info size={20} color="#3B82F6" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.txt, marginBottom: 4 }}>
                      Only Telebirr-purchased coins can be used for gifting
                    </div>
                    <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.5 }}>
                      Airtime-purchased and earned coins cannot be gifted. Please top up via Telebirr to send gifts.
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowInsufficientModal(false)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: '14px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: T.txt,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = T.bg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowInsufficientModal(false);
                    if (onShowCoinPurchase) {
                      onShowCoinPurchase();
                    }
                  }}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #8fc441, #7ab336)',
                    border: 'none',
                    borderRadius: 12,
                    padding: '14px 20px',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#000',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(143,196,65,0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(143,196,65,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(143,196,65,0.3)';
                  }}
                >
                  Buy Coins
                </button>
              </div>
            </div>

            <style>{`
              @keyframes modalSlideIn {
                from {
                  opacity: 0;
                  transform: translateY(-20px) scale(0.95);
                }
                to {
                  opacity: 1;
                  transform: translateY(0) scale(1);
                }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
