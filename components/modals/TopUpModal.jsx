import React, { useState, useEffect } from 'react';
import api from '../../api';
import telebirrH5 from '../../services/TelebirrH5Service';
import { Coins, X, CheckCircle, XCircle } from 'lucide-react';

const btnPrimary = (T) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 16px', borderRadius: 12, border: 'none',
  background: T.pri, color: '#000', fontSize: 14, fontWeight: 700,
  cursor: 'pointer',
});

const modalLabel = (T) => ({
  display: 'block', fontSize: 13, fontWeight: 600, color: T.sub, marginBottom: 6,
});

const modalInput = (T) => ({
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: `1px solid ${T.border || '#444'}`, background: T.card || '#1A1A1A', color: T.txt || '#fff',
  fontSize: 15, outline: 'none', boxSizing: 'border-box',
  cursor: 'text', pointerEvents: 'auto',
});

function Modal({ children, onClose, theme: T, title }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.card || '#1A1A1A', borderRadius: 16, padding: 20,
          maxWidth: 400, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          border: `1px solid ${T.border || '#333'}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.txt || '#fff', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.sub || '#999' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function TopUpModal({ theme: T, onClose }) {
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('telebirr');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loadingAirtime, setLoadingAirtime] = useState(false);
  const [loadingTelebirr, setLoadingTelebirr] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [isInSuperApp, setIsInSuperApp] = useState(false);
  const [initialCoinBalance, setInitialCoinBalance] = useState(null);
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    const checkSuperAppAndFetchPhone = async () => {
      const inSuperApp = telebirrH5.isInSuperApp();
      setIsInSuperApp(inSuperApp);

      try {
        const profile = await api.request('/profile/me/');
        if (profile && profile.phone_number) {
          setPhoneNumber(profile.phone_number);
        }
      } catch (error) {
        console.error('[TopUpModal] Failed to fetch phone number:', error);
      }

      try {
        const config = await api.request('/wallet/config/');
        if (config && config.packages) {
          setPackages(config.packages);
        }
      } catch (error) {
        console.error('[TopUpModal] Failed to fetch packages:', error);
      }
    };
    checkSuperAppAndFetchPhone();
  }, []);

  useEffect(() => {
    if (selectedPackage) setPaymentMethod('telebirr');
  }, [selectedPackage]);

  useEffect(() => {
    if (!loadingTelebirr || !initialCoinBalance) return;

    const checkBalanceNow = async () => {
      try {
        const wallet = await api.request('/wallet/');
        const currentBalance = wallet.balance?.total || 0;
        if (currentBalance > initialCoinBalance) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          setLoadingTelebirr(false);
          setResultSuccess(true);
          setResultMessage(`Payment successful! ${currentBalance - initialCoinBalance} coins added.`);
          setShowResultModal(true);
          setTimeout(() => onClose(), 3000);
        }
      } catch (error) {
        console.error('[TopUpModal] Polling error:', error);
      }
    };

    const pollInterval = setInterval(checkBalanceNow, 3000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkBalanceNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
      if (loadingTelebirr) {
        setLoadingTelebirr(false);
        onClose();
      }
    }, 90000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
    };
  }, [loadingTelebirr, initialCoinBalance]);

  const handleAirtimePurchase = async () => {
    if (!selectedPackage) return;
    if (!phoneNumber) {
      setResultSuccess(false);
      setResultMessage('Please enter your phone number');
      setShowResultModal(true);
      return;
    }

    setLoadingAirtime(true);
    try {
      const response = await api.request('/charging/coin-purchase/', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: phoneNumber,
          coins: selectedPackage.total_coins,
        }),
      });

      if (response.success) {
        setResultSuccess(true);
        setResultMessage(`Payment successful! ${selectedPackage.total_coins} coins added.`);
        setShowResultModal(true);
        setTimeout(() => onClose(), 2000);
      } else if (response.error === 'insufficient_balance') {
        setResultSuccess(false);
        setResultMessage('Your airtime balance is insufficient to complete this purchase. Please top up your airtime and try again.');
        setShowResultModal(true);
      } else {
        setResultSuccess(false);
        setResultMessage(response.message || 'Purchase failed');
        setShowResultModal(true);
      }
    } catch (error) {
      setResultSuccess(false);
      setResultMessage('Purchase failed. Please try again.');
      setShowResultModal(true);
    } finally {
      setLoadingAirtime(false);
    }
  };

  const handleTelebirrPurchase = async () => {
    if (!selectedPackage) return;

    if (telebirrH5.isInSuperApp()) {
      setLoadingTelebirr(true);
      try {
        const result = await telebirrH5.purchasePackage(selectedPackage.id);
        if (result.success && !result.pending) {
          setResultSuccess(true);
          setResultMessage(`Payment successful! ${result.coins_added || ''} coins added.`);
          setShowResultModal(true);
          setTimeout(() => onClose(), 2000);
        } else if (result.success && result.pending) {
          setResultSuccess(true);
          setResultMessage('Payment received. Your coins will appear shortly.');
          setShowResultModal(true);
          setTimeout(() => onClose(), 2000);
        } else if (result.error === 'PAY_TIMEOUT') {
          setResultSuccess(false);
          setResultMessage('Payment was not completed. If you paid, your coins will be credited shortly.');
          setShowResultModal(true);
        } else {
          setResultSuccess(false);
          setResultMessage(result.error || 'Payment failed. Please try again.');
          setShowResultModal(true);
        }
      } catch (error) {
        setResultSuccess(false);
        setResultMessage('Payment failed. Please try again.');
        setShowResultModal(true);
      } finally {
        setLoadingTelebirr(false);
      }
      return;
    }

    setLoadingTelebirr(true);
    try {
      const wallet = await api.request('/wallet/');
      const initialBalance = wallet.balance?.total || 0;
      setInitialCoinBalance(initialBalance);

      const response = await api.request('/wallet/telebirrUssdPurchase/', {
        method: 'POST',
        body: JSON.stringify({
          package_id: selectedPackage.id,
          phone_number: phoneNumber,
        }),
      });

      if (!response.success) {
        setResultSuccess(false);
        setResultMessage(response.error || 'Payment request failed. Please try again.');
        setShowResultModal(true);
      }
    } catch (error) {
      setResultSuccess(false);
      setResultMessage('Payment request failed. Please try again.');
      setShowResultModal(true);
    }
  };

  return (
    <>
      <Modal onClose={onClose} theme={T} title="Buy Coins">
        {packages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 14, color: T.sub }}>Loading packages...</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...modalLabel(T), marginBottom: 6 }}>Select Package</label>
              <select
                value={selectedPackage?.id || ''}
                onChange={(e) => {
                  const pkg = packages.find(p => p.id === parseInt(e.target.value));
                  setSelectedPackage(pkg || null);
                }}
                style={modalInput(T)}
              >
                <option value="">Choose a package...</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} - {pkg.total_coins.toLocaleString()} coins ({Number(pkg.price_etb).toFixed(0)} ETB)
                  </option>
                ))}
              </select>
            </div>

            {selectedPackage && (
              <div style={{
                padding: 12, borderRadius: 8, background: T.pri + '10',
                marginBottom: 16, border: `1px solid ${T.pri + '30'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: T.pri + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Coins size={20} color={T.pri} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>
                      {selectedPackage.total_coins.toLocaleString()} coins
                    </div>
                    {selectedPackage.bonus_coins > 0 && (
                      <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                        +{selectedPackage.bonus_coins} bonus
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.pri }}>
                    {Number(selectedPackage.price_etb).toFixed(0)} ETB
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ ...modalLabel(T), marginBottom: 8 }}>Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+251 9xx xxx xxx"
                style={modalInput(T)}
              />
              <div style={{ fontSize: 11, color: T.sub || '#888', marginTop: 6 }}>
                Charges go to your registered phone number.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isInSuperApp ? '1fr' : (selectedPackage && selectedPackage.allows_airtime ? '1fr 1fr' : '1fr'), gap: 12 }}>
              {!isInSuperApp && selectedPackage && selectedPackage.allows_airtime && (
                <button
                  onClick={handleAirtimePurchase}
                  disabled={!selectedPackage || loadingAirtime || loadingTelebirr}
                  style={{ ...btnPrimary(T), opacity: (!selectedPackage || loadingAirtime || loadingTelebirr) ? 0.5 : 1 }}
                >
                  {loadingAirtime ? 'Processing...' : 'From Airtime'}
                </button>
              )}
              <button
                onClick={handleTelebirrPurchase}
                disabled={!selectedPackage || loadingAirtime || loadingTelebirr}
                style={{ ...btnPrimary(T), opacity: (!selectedPackage || loadingAirtime || loadingTelebirr) ? 0.5 : 1 }}
              >
                {loadingTelebirr ? 'Processing...' : selectedPackage ? 'From telebirr' : 'Select a package'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {showResultModal && (
        <Modal onClose={() => setShowResultModal(false)} theme={T} title={resultSuccess ? 'Success' : 'Error'}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: resultSuccess ? '#10B981' : '#EF4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              {resultSuccess ? <CheckCircle size={32} color="#fff" /> : <XCircle size={32} color="#fff" />}
            </div>
            <p style={{ fontSize: 16, color: T.txt, margin: 0 }}>{resultMessage}</p>
          </div>
        </Modal>
      )}

      {loadingTelebirr && (
        <Modal onClose={() => {}} theme={T} title="">
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: '#10B981',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <CheckCircle size={24} color="#fff" />
            </div>
            <p style={{ fontSize: 16, color: T.txt, margin: 0 }}>Processing...</p>
          </div>
        </Modal>
      )}
    </>
  );
}
