import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppShell } from './AppShell';
import { LogoutDialog } from '../auth/LogoutDialog';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import webPush from '../../services/WebPushService';
import telebirrH5 from '../../services/TelebirrH5Service';
import { rediscoverUploads } from '../../services/uploadTracker';
import { UploadProgressIndicator } from '../common/UploadProgressIndicator';
import { SubscriptionModal } from '../subscription/SubscriptionModal';

export default function AppLayout() {
  const {
    authUser, requestLogout,
    showTopUpModal, setShowTopUpModal,
    showSubscriptionModal, closeSubscriptionModal,
    subscriptionStatus, subscriptionChecked, setAuthUser,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadDmCount] = useState(0);

  // Determine active tab from URL
  const pathToTab = {
    '/': 'home',
    '/reels': 'reels',
    '/messages': 'messages',
    '/explore': 'explore',
    '/create': 'create',
    '/notifications': 'notifications',
    '/settings': 'settings',
    '/wallet': 'wallet',
    '/buy-coins': 'wallet',
    '/campaigns': 'campaigns',
    '/profile': 'profile',
  };
  const basePath = '/' + (location.pathname.split('/')[1] || '');
  const activeTab = pathToTab[basePath] || 'home';

  // Poll unread notification count
  useEffect(() => {
    if (!authUser) { setUnreadNotifCount(0); return; }
    const fetchCount = async () => {
      try {
        const data = await api.getUnreadNotificationCount();
        setUnreadNotifCount(data.unread_count || 0);
      } catch (_) {}
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [authUser]);

  // Uploads still processing that this browser has no record of -- storage
  // cleared, or posted from another device -- join the corner indicator.
  // One request per sign-in; the tracker's own list covers a plain reload.
  useEffect(() => {
    if (authUser?.id) rediscoverUploads();
  }, [authUser?.id]);

  // Subscription gate disabled — allow browsing all pages (interactions
  // like/comment/post are gated individually within each page).

  // "Buy coins" used to open a modal; it now navigates to the dedicated
  // /buy-coins page. Every existing onShowCoinPurchase call site still works —
  // the auth-context flag is consumed here and turned into a route change.
  useEffect(() => {
    if (!showTopUpModal) return;
    document.querySelectorAll('video').forEach(v => { if (!v.paused) v.pause(); });
    setShowTopUpModal(false);
    if (location.pathname !== '/buy-coins') {
      navigate('/buy-coins', {
        state: { returnTo: location.pathname + location.search },
      });
    }
  }, [showTopUpModal]);

  // Pause videos when tab loses visibility
  useEffect(() => {
    const pauseAll = () => document.querySelectorAll('video').forEach(v => { if (!v.paused) v.pause(); });
    const handleVisibility = () => { if (document.hidden) pauseAll(); };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', pauseAll);
    window.addEventListener('beforeunload', pauseAll);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', pauseAll);
      window.removeEventListener('beforeunload', pauseAll);
    };
  }, []);

  // Listen for navigateToCreatePost custom event
  useEffect(() => {
    const handler = () => navigate('/create');
    window.addEventListener('navigateToCreatePost', handler);
    return () => window.removeEventListener('navigateToCreatePost', handler);
  }, [navigate]);

  // Bridge notification clicks from service worker
  useEffect(() => {
    const off = webPush.onPushClick((data) => {
      try { if (data?.reel_id) navigate(`/post/${data.reel_id}`); } catch (_) {}
    });
    return off;
  }, [navigate]);

  // Global skeleton removal
  useEffect(() => {
    const timeout = setTimeout(() => {
      const skeleton = document.getElementById('app-skeleton');
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.2s ease';
        skeleton.style.opacity = '0';
        setTimeout(() => skeleton.remove(), 220);
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, []);

  // In-session keep-alive
  useEffect(() => {
    let cancelled = false;
    const ping = () => { if (!document.hidden) api.request('/health/', { skipCache: true }).catch(() => {}); };
    const id = setInterval(() => { if (!cancelled) ping(); }, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Handle URL params for login/subscription
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('login') === 'true') {
      const phone = params.get('phone') || '';
      navigate(`/login?phone=${encodeURIComponent(phone)}`, { replace: true });
    }
    if (params.get('telebirr_otp_mode') === 'true') {
      const phone = params.get('phone') || '';
      navigate(`/login?phone=${encodeURIComponent(phone)}&telebirr_otp_mode=true`, { replace: true });
    }
    // Handle subscription_tp parameter (from SubscriptionPage redirect)
    if (params.get('subscription_tp') === 'true' || params.get('subscriptiontp') === 'true') {
      navigate('/subscription', { replace: true, state: {
        phone: params.get('phone'),
        from_telebirr: params.get('from_telebirr') === 'true',
        existing_user: params.get('existing_user') === 'true',
      }});
    }
  }, [location.search]);

  // ── Telebirr SuperApp auto-login & pending mandate reconciliation ──
  useEffect(() => {
    // Pending mandate reconciliation (iOS SuperApp reload fix)
    const pending = telebirrH5.getPendingMandate();
    if (pending) {
      navigate('/subscription', { replace: true });
      return;
    }

    // Handle show_subscription URL parameter
    const params = new URLSearchParams(location.search);
    if (params.get('show_subscription') === 'true') {
      navigate('/subscription', { replace: true });
      return;
    }

    // Telebirr SuperApp auto-login
    if (!authUser && !localStorage.getItem('authToken') && telebirrH5.isInSuperApp() && location.pathname !== '/subscription') {
      (async () => {
        try {
          const result = await telebirrH5.autoLogin();
          if (result.success) {
            api.setAuthToken(result.token);
            setAuthUser(result.user);
            localStorage.setItem('authToken', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            window.location.reload();
          } else if (result.requiresSubscription) {
            navigate('/subscription?show_subscription=true', { replace: true });
          }
        } catch (err) {
          console.log('[Telebirr Auto-Login] Error:', err);
        }
      })();
    }
  }, [authUser]);

  return (
    <>
      <AppShell
        user={authUser}
        activeTab={activeTab}
        onTabChange={(tab) => {
          const tabRoutes = { home: '/', reels: '/reels', messages: '/messages', explore: '/explore', create: '/create', notifications: '/notifications', settings: '/settings', wallet: '/wallet', campaigns: '/campaigns', profile: '/profile' };
          navigate(tabRoutes[tab] || '/');
        }}
        onLogout={requestLogout}
        onShowProfile={() => navigate(authUser ? '/profile' : '/login')}
        onShowPostPage={() => {
          if (!authUser) { navigate('/login'); return; }
          navigate('/create');
        }}
        onShowSettings={() => navigate(authUser ? '/settings' : '/')}
        onShowNotifications={() => navigate(authUser ? '/notifications' : '/')}
        onShowCampaigns={() => navigate(authUser ? '/campaigns' : '/')}
        onShowExplorer={() => navigate('/explore')}
        onRequireAuth={() => navigate('/login')}
        unreadNotifCount={unreadNotifCount}
        unreadDmCount={unreadDmCount}
      >
        <Outlet />
      </AppShell>
      {/* Uploads still being processed, on every page (TikTok-style). */}
      {authUser && <UploadProgressIndicator onOpen={(id) => navigate(`/post/${id}`)} />}
      {/* Rendered here, inside the layout the feeds live in, so opening the
          plans leaves the feed mounted: the post, the scroll position and the
          loaded pages are all still there when it closes. */}
      <SubscriptionModal
        open={showSubscriptionModal}
        onClose={closeSubscriptionModal}
        user={authUser}
        onAuthSuccess={(user, token) => {
          setAuthUser(user);
          if (token) localStorage.setItem('authToken', token);
        }}
        onLogin={() => {
          // Close first: the sheet is portalled to document.body, so leaving
          // it open would park it on top of the login form it just sent the
          // viewer to.
          closeSubscriptionModal();
          navigate('/login');
        }}
      />
      <LogoutDialog />
    </>
  );
}
