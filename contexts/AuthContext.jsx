import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import webPush from '../services/WebPushService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(() => {
    try {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  });
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  const openLoginModal = useCallback(() => setShowLoginModal(true), []);
  const openTopUpModal = useCallback(() => setShowTopUpModal(true), []);

  const setAndPersistUser = useCallback((user) => {
    setAuthUser(user);
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, []);

  const logout = useCallback(() => {
    try { webPush.unsubscribe(); } catch (_) {}
    api.setAuthToken(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    setAuthUser(null);
  }, []);

  // Restore auth token synchronously
  useEffect(() => {
    try {
      const t = localStorage.getItem('authToken');
      if (t) api.setAuthToken(t);
    } catch {}
  }, []);

  // Subscribe to web push when logged in
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await webPush.ensureSubscribed();
        if (!cancelled && res && !res.ok) {
          console.debug('[WebPush] not subscribed:', res.reason);
        }
      } catch (err) {
        console.warn('[WebPush] subscribe error', err);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  // Refresh user profile from backend on startup
  useEffect(() => {
    if (!authUser || !api.hasToken()) return;
    const refreshUserProfile = async () => {
      try {
        const profileData = await api.request('/profile/me/');
        if (profileData) {
          const userData = profileData.user || {};
          const updatedUser = {
            id: userData.id || authUser.id,
            username: userData.username || authUser.username,
            email: userData.email || authUser.email,
            first_name: userData.first_name || authUser.first_name || "",
            last_name: userData.last_name || authUser.last_name || "",
            name: userData.first_name || userData.username || authUser.name,
            profile_photo: profileData.profile_photo || userData.profile_photo || null,
            bio: profileData.bio || userData.bio || "",
            followers_count: userData.followers_count || authUser.followers_count || 0,
            following_count: userData.following_count || authUser.following_count || 0,
            is_staff: userData.is_staff || authUser.is_staff || false,
          };
          if (JSON.stringify(updatedUser) !== JSON.stringify(authUser)) {
            setAndPersistUser(updatedUser);
          }
        }
      } catch (e) {
        console.log('Could not refresh profile:', e.message);
      }
    };
    const timer = setTimeout(refreshUserProfile, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Check subscription status
  useEffect(() => {
    const checkSubscription = async () => {
      if (!authUser || !api.hasToken()) {
        setSubscriptionStatus(null);
        setSubscriptionChecked(false);
        return;
      }
      try {
        const status = await api.checkSubscriptionStatus();
        setSubscriptionStatus(status);
        setSubscriptionChecked(true);
      } catch (e) {
        console.log('Could not check subscription status:', e.message);
        setSubscriptionChecked(true);
      }
    };
    checkSubscription();
  }, [authUser]);

  // Poll subscription status every 30s
  useEffect(() => {
    if (!authUser || !api.hasToken()) return;
    const interval = setInterval(async () => {
      try {
        const status = await api.checkSubscriptionStatus();
        setSubscriptionStatus(status);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [authUser]);

  // Check subscription on window focus
  useEffect(() => {
    if (!authUser || !api.hasToken()) return;
    const handleFocus = async () => {
      try {
        const status = await api.checkSubscriptionStatus();
        setSubscriptionStatus(status);
      } catch {}
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [authUser]);

  const value = {
    authUser,
    setAuthUser: setAndPersistUser,
    subscriptionStatus,
    subscriptionChecked,
    logout,
    showLoginModal,
    setShowLoginModal,
    openLoginModal,
    showTopUpModal,
    setShowTopUpModal,
    openTopUpModal,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
