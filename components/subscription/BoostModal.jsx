import { useState, useEffect } from "react";
import { X, Zap, Clock, Users, Target, ChevronRight, Check } from "lucide-react";
import api from "../../api";
import { useLegacyT } from "../../contexts/ThemeContext";

export function BoostModal({ reelId, onClose, onSuccess }) {
  const T = useLegacyT();
  const [config, setConfig] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(12);
  const [selectedGender, setSelectedGender] = useState('all');
  const [selectedAgeMin, setSelectedAgeMin] = useState('');
  const [selectedAgeMax, setSelectedAgeMax] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [calculatedCost, setCalculatedCost] = useState(null);
  const [userCoins, setUserCoins] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const formatBoostError = (err) => {
    const rawMessage = err?.message || 'Failed to create boost. Please try again.';
    const message = rawMessage.replace(/^\[HTTP\s+\d+\]\s+[^:]+:\s*/, '');
    const requiredMatch = message.match(/"required":\s*(\d+)/i);
    const availableMatch = message.match(/"available":\s*(\d+)/i);

    if (/Insufficient coins/i.test(message) && requiredMatch && availableMatch) {
      return `Insufficient coins. Required: ${requiredMatch[1]}, available: ${availableMatch[1]}.`;
    }

    return message;
  };

  useEffect(() => {
    loadConfig();
    loadUserCoins();
  }, []);

  // Lock body scroll while modal is open so the scroll-snap feed
  // behind it doesn't swipe away when the user interacts with the modal.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (config) {
      calculateCost();
    }
  }, [selectedDuration, selectedGender, selectedAgeMin, selectedAgeMax, selectedLocation, config]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await api.request('/boost/config/');
      setConfig(response);
    } catch (err) {
      console.error('Error loading boost config:', err);
      setError(formatBoostError(err));
    } finally {
      setLoading(false);
    }
  };

  const loadUserCoins = async () => {
    try {
      const response = await api.request('/wallet/');
      setUserCoins(response?.balance?.total || 0);
    } catch (err) {
      console.error('Error loading user coins:', err);
      setError(formatBoostError(err));
    }
  };

  const calculateCost = async () => {
    try {
      const response = await api.request('/boost/calculate-cost/', {
        method: 'POST',
        body: JSON.stringify({
          duration_hours: selectedDuration,
          target_gender: selectedGender,
          target_age_min: selectedAgeMin || null,
          target_age_max: selectedAgeMax || null,
          target_location: selectedLocation || null,
        }),
      });
      setCalculatedCost(response);
    } catch (err) {
      console.error('Error calculating cost:', err);
      setError(formatBoostError(err));
    }
  };

  const handleCreateBoost = async () => {
    if (!calculatedCost || calculatedCost.cost > userCoins) {
      setError(`Insufficient coins. Required: ${Math.round(calculatedCost?.cost || 0)}, available: ${userCoins}.`);
      return;
    }

    setCreating(true);
    setError('');
    try {
      const response = await api.request('/boost/campaigns/', {
        method: 'POST',
        body: JSON.stringify({
          reel_id: reelId,
          duration_hours: selectedDuration,
          target_gender: selectedGender,
          target_age_min: selectedAgeMin || null,
          target_age_max: selectedAgeMax || null,
          target_location: selectedLocation || null,
        }),
      });

      if (response.success) {
        onSuccess(response);
      } else {
        setError(response.error || 'Failed to create boost');
      }
    } catch (err) {
      console.error('Error creating boost:', err);
      setError(formatBoostError(err));
    } finally {
      setCreating(false);
    }
  };

  const durationOptions = [
    { hours: 12, label: '12 Hours', label_extra: '100 coins', icon: Clock },
    { hours: 24, label: '24 Hours', label_extra: '170 coins', icon: Clock },
    { hours: 72, label: '3 Days', label_extra: '300 coins', icon: Clock },
  ];

  if (loading) {
    return (
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <div style={{ color: '#fff', fontSize: 18 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div style={{ background: T.cardBg || '#1a1a1a', borderRadius: 20, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottom: `1px solid ${T.border || 'rgba(255,255,255,0.1)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.pri || '#8fc441'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color={T.pri || '#8fc441'} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.txt || '#fff' }}>Boost Your Post</div>
              <div style={{ fontSize: 12, color: T.sub || 'rgba(255,255,255,0.5)' }}>Reach more people with spendable coins</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: T.sub || 'rgba(255,255,255,0.5)' }}>
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {/* Duration Selection */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.txt || '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} color={T.pri || '#8fc441'} />
              Select Duration
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {durationOptions.map(option => {
                const Icon = option.icon;
                const isSelected = selectedDuration === option.hours;
                return (
                  <button
                    key={option.hours}
                    onClick={() => setSelectedDuration(option.hours)}
                    style={{
                      background: isSelected ? `${T.pri || '#8fc441'}20` : 'rgba(255,255,255,0.05)',
                      border: isSelected ? `2px solid ${T.pri || '#8fc441'}` : '2px solid transparent',
                      borderRadius: 12,
                      padding: 16,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Icon size={16} color={isSelected ? T.pri || '#8fc441' : T.sub || 'rgba(255,255,255,0.5)'} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.txt || '#fff' }}>{option.label}</span>
                    </div>
                    {option.label_extra && (
                      <span style={{ fontSize: 11, color: T.pri || '#8fc441', fontWeight: 600 }}>{option.label_extra}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cost Summary */}
          {calculatedCost && (
            <div style={{ background: `${T.pri || '#8fc441'}10`, borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${T.pri || '#8fc441'}30` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: T.txt || '#fff' }}>Boost Cost</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.pri || '#8fc441' }}>{Math.round(calculatedCost.cost)} coins</div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 12, marginBottom: 20, border: '1px solid #EF4444' }}>
              <div style={{ fontSize: 13, color: '#EF4444' }}>{error}</div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: 14,
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: 12,
                color: T.txt || '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateBoost}
              disabled={creating || !calculatedCost || calculatedCost.cost > userCoins}
              style={{
                flex: 1,
                padding: 14,
                background: creating || !calculatedCost || calculatedCost.cost > userCoins ? 'rgba(255,255,255,0.1)' : T.pri || '#8fc441',
                border: 'none',
                borderRadius: 12,
                color: creating || !calculatedCost || calculatedCost.cost > userCoins ? 'rgba(255,255,255,0.3)' : '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: creating || !calculatedCost || calculatedCost.cost > userCoins ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {creating ? 'Creating...' : <><Zap size={16} /> Boost Post</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
