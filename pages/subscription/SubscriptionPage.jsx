import { useState, useEffect, useRef } from 'react';
import {
  Crown, Zap, Calendar, Coins, Check, X, ChevronLeft,
  Star, Trophy, Gem, MessageCircle, Info, Video, Ban, AlertCircle,
} from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import telebirrH5 from '../../services/TelebirrH5Service';

const getFallbackTiers = () => [
  {
    id: 'd9701042-090a-49f9-bd43-39fa1b68d1d6',
    name: 'Daily',
    duration_type: 'daily',
    price_etb: 3,
    price_coins: null,
    description: 'Access for 24 hours'
  },
  {
    id: 'a5a1f1f0-f315-4f7f-9093-221f8b3f04d0',
    name: 'Weekly',
    duration_type: 'weekly',
    price_etb: 20,
    price_coins: null,
    description: 'Access for 7 days'
  },
  {
    id: 'monthly-tier-id-placeholder',
    name: 'Monthly',
    duration_type: 'monthly',
    price_etb: 70,
    price_coins: null,
    description: 'Access for 30 days'
  },
];

export function SubscriptionPage({ user, onBack, onAuthSuccess }) {
  const { colors: T } = useTheme();
  const { t } = useLanguage();
  
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 480);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const [tiers, setTiers] = useState(getFallbackTiers());
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingTierId, setProcessingTierId] = useState(null);
  const [smsSent, setSmsSent] = useState(false);
  const [pendingTier, setPendingTier] = useState(null);
  const [telebirrModalOpen, setTelebirrModalOpen] = useState(false);
  const [telebirrPhoneInputOpen, setTelebirrPhoneInputOpen] = useState(false);
  const [telebirrPhone, setTelebirrPhone] = useState('');
  const [selectedTierForTelebirr, setSelectedTierForTelebirr] = useState(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedTierForSuperApp, setSelectedTierForSuperApp] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelSuccessModalOpen, setCancelSuccessModalOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileAttempt, setReconcileAttempt] = useState(0);
  const [activeSubscriptionModalOpen, setActiveSubscriptionModalOpen] = useState(false);
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [selectedTierForMethod, setSelectedTierForMethod] = useState(null);
  // Inline toast state — replaces native alert() popups for the on-demand flow
  // so users don't get a system "message box" interrupting them.
  const [toast, setToast] = useState(null); // { type: 'success'|'error'|'info', text: string }
  const toastTimer = useRef(null);
  const showToast = (type, text, ms = 2800) => {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };
  const pollRef = useRef(null);
  const POLL_INTERVAL = 5000;
  const MAX_POLLS = 36; // 3 minutes
  const reconcilingRef = useRef(false);

  useEffect(() => {
    // ========================================================================
    // SUPERAPP RE-AUTH ON RELOAD FIX
    // ========================================================================
    // The SuperApp natively reloads the H5 webview after a payment completes,
    // which destroys the in-memory JS context BEFORE our purchase-flow code
    // can run auto-login/redirect. This means the page can come back to
    // /subscription with NO auth token, causing it to show plan cards instead
    // of the now-active subscription. Detect this and silently re-authenticate.
    const reAuthIfSessionLost = async () => {
      const hasToken = !!localStorage.getItem('authToken');
      if (telebirrH5.isInSuperApp() && !hasToken) {
        setLoading(true);
        try {
          const autoLoginResult = await telebirrH5.autoLogin();
          if (autoLoginResult.success && autoLoginResult.token) {
            api.setAuthToken(autoLoginResult.token);
            localStorage.setItem('authToken', autoLoginResult.token);
            if (autoLoginResult.user) localStorage.setItem('user', JSON.stringify(autoLoginResult.user));
            if (onAuthSuccess) onAuthSuccess(autoLoginResult.user, autoLoginResult.token);
          }
        } catch (e) {
          console.error('[SubscriptionPage] Re-auth on reload failed:', e);
        } finally {
          setLoading(false);
        }
      }
      // Load tiers and subscription (force skip cache after re-auth attempt)
      loadSubscriptionData(true);
    };

    reAuthIfSessionLost();
  }, []);

  // COMMENTED OUT: Reconcile pending Telebirr mandate on mount (replaced by one-time flow)
  // The SuperApp reloads the H5 page when returning from the native mandate page,
  // which destroys the in-memory callback. This logic completed the subscription
  // by calling /mandate/save/ with the persisted mandate data.
  // NEW ONE-TIME FLOW: No mandate reconciliation needed - payment is completed synchronously
  // useEffect(() => {
  //   const reconcile = async () => {
  //     const ua = navigator.userAgent || '';
  //     const isIOS = /iPhone|iPad|iPod/i.test(ua);
  //     const rawPending = localStorage.getItem('telebirr_pending_mandate');
  //     try {
  //       await api.request('/client-log/', {
  //         method: 'POST',
  //         body: JSON.stringify({
  //           level: 'info',
  //           message: '[SubscriptionPage] PAGE LOADED - Reconciliation flow START',
  //           context: {
  //             platform: isIOS ? 'iOS' : 'Android/Other',
  //             userAgent: ua.substring(0, 100),
  //             isInSuperApp: telebirrH5.isInSuperApp(),
  //             rawPendingMandate: rawPending,
  //             currentUrl: window.location.href,
  //             timestamp: new Date().toISOString(),
  //           },
  //         }),
  //       });
  //     } catch (e) {}

  //     if (reconcilingRef.current) {
  //       try {
  //         await api.request('/client-log/', {
  //           method: 'POST',
  //           body: JSON.stringify({
  //             level: 'info',
  //             message: '[SubscriptionPage] Reconciliation flow - ALREADY RUNNING, skipping',
  //           }),
  //         });
  //       } catch (e) {}
  //       return;
  //     }

  //     const pending = telebirrH5.getPendingMandate();
  //     if (!pending) {
  //       try {
  //         await api.request('/client-log/', {
  //           method: 'POST',
  //           body: JSON.stringify({
  //             level: 'info',
  //             message: '[SubscriptionPage] Reconciliation flow - NO PENDING MANDATE, skipping',
  //           }),
  //         });
  //       } catch (e) {}
  //       return;
  //     }

  //     reconcilingRef.current = true;
  //     setReconciling(true);
  //     setReconcileAttempt(0);
  //     try {
  //       await api.request('/client-log/', {
  //         method: 'POST',
  //         body: JSON.stringify({
  //           level: 'info',
  //           message: '[SubscriptionPage] Reconciling pending mandate with polling',
  //           context: { pending },
  //         }),
  //       });
  //     } catch (e) {}

  //     // Poll up to 60 times (every 5s = 5 minutes total) because Telebirr
  //     // takes ~3 minutes to register the mandate after preorder. This affects
  //     // both iOS (SuperApp reloads page) and Android (callback fires but mandate not ready).
  //     const MAX_RECONCILE_ATTEMPTS = 60;
  //     const RECONCILE_INTERVAL = 5000;
  //     let reconcileSuccess = false;

  //     for (let attempt = 1; attempt <= MAX_RECONCILE_ATTEMPTS; attempt++) {
  //       setReconcileAttempt(attempt);
  //       try {
  //         await api.request('/client-log/', {
  //           method: 'POST',
  //           body: JSON.stringify({
  //             level: 'info',
  //             message: `[SubscriptionPage] Reconciliation attempt ${attempt}/${MAX_RECONCILE_ATTEMPTS}`,
  //           }),
  //         });
  //       } catch (e) {}

  //       try {
  //         const saveResponse = await api.request('/subscription/telebirr/mandate/save/', {
  //           method: 'POST',
  //           body: JSON.stringify({
  //             mct_contract_no: pending.mct_contract_no,
  //             plan_type: pending.plan_type,
  //             phone_number: pending.phone_number,
  //           }),
  //         });

  //         if (saveResponse.success) {
  //           reconcileSuccess = true;
  //           try {
  //             await api.request('/client-log/', {
  //               method: 'POST',
  //               body: JSON.stringify({
  //                 level: 'info',
  //                 message: '[SubscriptionPage] Reconciliation SAVE SUCCESS - showing congratulations',
  //               }),
  //             });
  //           } catch (e) {}

  //           telebirrH5.clearPendingMandate();
  //           loadSubscriptionData();
  //           setSuccessModalOpen(true);
  //           setTermsModalOpen(false);

  //           setTimeout(() => {
  //             setSuccessModalOpen(false);
  //             window.location.href = '/';
  //           }, 3000);
  //           break;
  //         } else {
  //           // Check if user already has active subscription - redirect to home page
  //           if (saveResponse.error && saveResponse.error.includes('already has an active subscription')) {
  //             try {
  //               await api.request('/client-log/', {
  //                 method: 'POST',
  //                 body: JSON.stringify({
  //                   level: 'info',
  //                   message: '[SubscriptionPage] User already has active subscription - redirecting to home',
  //                   context: { saveResponse },
  //                 }),
  //               });
  //             } catch (e) {}
  //             telebirrH5.clearPendingMandate();
  //             loadSubscriptionData();
  //             setSuccessModalOpen(true);
  //             setTermsModalOpen(false);
  //             setTimeout(() => {
  //               setSuccessModalOpen(false);
  //               window.location.href = '/';
  //             }, 3000);
  //             break;
  //           }
  //           // If backend says mandate was never created, stop immediately
  //           if (saveResponse.retry_later === false) {
  //             try {
  //               await api.request('/client-log/', {
  //                 method: 'POST',
  //                 body: JSON.stringify({
  //                   level: 'info',
  //                   message: '[SubscriptionPage] Reconciliation STOPPED - mandate never created (retry_later=false from response)',
  //                 }),
  //               });
  //             } catch (e) {}
  //             telebirrH5.clearPendingMandate();
  //             break;
  //           }
  //           try {
  //             await api.request('/client-log/', {
  //               method: 'POST',
  //               body: JSON.stringify({
  //                 level: 'info',
  //                 message: `[SubscriptionPage] Reconciliation attempt ${attempt} - save returned non-success, retrying...`,
  //                 context: { saveResponse },
  //               }),
  //             });
  //           } catch (e) {}
  //         }
  //       } catch (err) {
  //         try {
  //           await api.request('/client-log/', {
  //             method: 'POST',
  //             body: JSON.stringify({
  //               level: 'error',
  //               message: `[SubscriptionPage] Reconciliation attempt ${attempt} failed`,
  //               context: { error: err?.message, data: err?.data },
  //             }),
  //           });
  //         } catch (e) {}

  //         // If backend says mandate was never created, stop immediately
  //         if (err?.data?.retry_later === false) {
  //           try {
  //             await api.request('/client-log/', {
  //               method: 'POST',
  //               body: JSON.stringify({
  //                 level: 'info',
  //                 message: '[SubscriptionPage] Reconciliation STOPPED - mandate never created (retry_later=false)',
  //               }),
  //             });
  //           } catch (e) {}
  //           telebirrH5.clearPendingMandate();
  //           break;
  //         }
  //       }

  //       // Wait before next attempt (unless last attempt)
  //       if (attempt < MAX_RECONCILE_ATTEMPTS) {
  //         await new Promise(r => setTimeout(r, RECONCILE_INTERVAL));
  //       }
  //     }

  //     if (!reconcileSuccess) {
  //       try {
  //         await api.request('/client-log/', {
  //           method: 'POST',
  //           body: JSON.stringify({
  //             level: 'error',
  //             message: '[SubscriptionPage] Reconciliation ended without success - clearing pending mandate',
  //           }),
  //         });
  //       } catch (e) {}
  //       telebirrH5.clearPendingMandate();
  //       showToast('error', 'Mandate was not created. Please try subscribing again.');
  //     }

  //     reconcilingRef.current = false;
  //     setReconciling(false);
  //   };

  //   reconcile();
  // }, []);

  // COMMENTED OUT: Visibility change handler for mandate reconciliation (replaced by one-time flow)
  // useEffect(() => {
  //   const handleVisibilityChange = () => {
  //     if (document.visibilityState === 'visible') {
  //       // Don't reload if success modal is showing (user is being redirected to home)
  //       if (successModalOpen) {
  //         return;
  //       }
  //       const pending = telebirrH5.getPendingMandate();
  //       try {
  //         api.request('/client-log/', {
  //           method: 'POST',
  //           body: JSON.stringify({
  //             level: 'info',
  //             message: '[SubscriptionPage] VISIBILITY CHANGE - page became visible',
  //             context: { hasPending: !!pending, pendingData: pending },
  //           }),
  //         });
  //       } catch (e) {}
  //       if (pending) {
  //         // Trigger reconciliation when webview returns to foreground
  //         window.location.reload();
  //       }
  //     }
  //   };
  //   document.addEventListener('visibilitychange', handleVisibilityChange);
  //   return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  // }, [successModalOpen]);

  // Load subscription data when component mounts or when user changes
  // This ensures Telebirr OTP users see their active subscription status after login
  useEffect(() => {
    if (user) {
      loadSubscriptionData(true);
    }
  }, [user]);

  const loadSubscriptionData = async (skipCache = true) => {
    try {
      // Fetch both in parallel but don't block UI
      const [tiersData, subscriptionData] = await Promise.all([
        api.request('/subscriptions/tiers/active/').catch(() => []),
        api.request('/subscriptions/', { skipCache }).catch(() => null),
      ]);
      
      const inSuperApp = telebirrH5.isInSuperApp();
      console.log('[SubscriptionPage] isInSuperApp:', inSuperApp);
      console.log('[SubscriptionPage] Raw tiers from API:', tiersData);
      
      // Only update tiers if API returns valid data
      if (Array.isArray(tiersData) && tiersData.length > 0) {
        // Filter out OnDemand tier
        let filteredTiers = tiersData.filter(tier => tier.name !== 'OnDemand');
        console.log('[SubscriptionPage] After filtering OnDemand:', filteredTiers);
        
        // Don't filter out daily tier in SuperApp - show it with mandate details
        setTiers(filteredTiers);
      }
      setCurrentSubscription(subscriptionData);

      // Don't redirect - show cancel card for all active subscriptions
      if (subscriptionData && subscriptionData.status === 'active') {
        console.log('[SubscriptionPage] User has active subscription, showing cancel card');
      }
    } catch (error) {
      console.error('Error loading subscription data:', error);
      // Keep using fallback tiers without OnDemand
      let fallbackTiers = getFallbackTiers().filter(tier => tier.name !== 'OnDemand');
      // Don't filter out daily tier in SuperApp - show it with mandate details
      setTiers(fallbackTiers);
    }
  };

  const startPolling = (tier) => {
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      try {
        const sub = await api.request('/subscriptions/', { skipCache: true });
        if (sub && sub.status === 'active') {
          clearInterval(pollRef.current);
          setCurrentSubscription(sub);
          setConfirmed(true);
        }
      } catch {}
      if (count >= MAX_POLLS) {
        clearInterval(pollRef.current);
      }
    }, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setSmsSent(false);
    setPendingTier(null);
    setPollCount(0);
    setConfirmed(false);
  };

  const handleSubscribe = async (tier) => {
    // For regular subscriptions, use SMS
    const tierCode = tier.duration_type === 'daily' ? '1' :
                     tier.duration_type === 'weekly' ? '2' :
                     tier.duration_type === 'monthly' ? '3' : '4';
    const shortCode = tier.short_code || '9286';
    const smsUrl = `sms:${shortCode}?body=${encodeURIComponent(tierCode)}`;
    window.location.href = smsUrl;
  };

  const handleTelebirrSubscribe = async (tier) => {
    console.log('[SubscriptionPage] handleTelebirrSubscribe called with tier:', tier);
    console.log('[SubscriptionPage] processing:', processing);
    console.log('[SubscriptionPage] currentSubscription:', currentSubscription);
    console.log('[SubscriptionPage] isInSuperApp:', telebirrH5.isInSuperApp());

    if (processing) return;

    // Check if user already has active subscription (cross-platform ban)
    if (currentSubscription && currentSubscription.status === 'active') {
      console.log('[SubscriptionPage] User has active subscription, showing modal');
      setActiveSubscriptionModalOpen(true);
      return;
    }

    setSelectedTierForTelebirr(tier);
    console.log('[SubscriptionPage] Selected tier for Telebirr:', tier);

    // Directly proceed based on platform - no confirmation popup
    if (telebirrH5.isInSuperApp()) {
      console.log('[SubscriptionPage] In SuperApp, calling handleSuperAppProceed');
      handleSuperAppProceed(tier);
    } else {
      console.log('[SubscriptionPage] Not in SuperApp, opening phone input modal');
      setTelebirrPhone('');
      setTelebirrPhoneInputOpen(true);
    }
  };

  const handleTelebirrPhoneSubmit = () => {
    if (!telebirrPhone || telebirrPhone.length < 10) {
      showToast('error', 'Please enter a valid phone number');
      return;
    }
    setTelebirrPhoneInputOpen(false);
    setTelebirrModalOpen(true);
  };

  const handleSuperAppProceed = async (tier) => {
    // Check if user already has active subscription (cross-platform ban)
    if (currentSubscription && currentSubscription.status === 'active') {
      setActiveSubscriptionModalOpen(true);
      return;
    }

    // Log to server for production visibility
    try {
      await api.request('/client-log/', {
        method: 'POST',
        body: JSON.stringify({
          level: 'info',
          message: '[SubscriptionPage] ========== SUPERAPP ONE-TIME SUBSCRIPTION START ==========',
          context: { selectedTier: tier }
        }),
      });
    } catch (e) {}

    setProcessing(true);
    setProcessingTierId(tier.id);

    try {
      // Get phone number from SuperApp (auto-login)
      let phoneNumber = '';
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[SubscriptionPage] SuperApp one-time flow - Getting phone number',
          }),
        });
      } catch (e) {}
      
      const autoLoginResult = await telebirrH5.autoLogin();

      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[SubscriptionPage] SuperApp one-time flow - Auto-login result',
            context: { success: autoLoginResult.success, hasUser: !!autoLoginResult.user, requiresSubscription: autoLoginResult.requiresSubscription }
          }),
        });
      } catch (e) {}

      if (autoLoginResult.success && autoLoginResult.user) {
        phoneNumber = autoLoginResult.telebirr_info?.identifier || autoLoginResult.user.phone_number || autoLoginResult.user.phoneNumber || '';
        // Apply auth token so the authenticated initiate call succeeds and
        // re-check for an existing active subscription (ban multiple subs on SuperApp).
        if (autoLoginResult.token) {
          api.setAuthToken(autoLoginResult.token);
          try {
            const freshSub = await api.request('/subscriptions/', { skipCache: true });
            if (freshSub && freshSub.status === 'active') {
              setCurrentSubscription(freshSub);
              setActiveSubscriptionModalOpen(true);
              setProcessing(false);
              setProcessingTierId(null);
              return;
            }
          } catch (e) {}
        }
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'info',
              message: '[SubscriptionPage] SuperApp one-time flow - Got phone from logged in user',
              context: { phoneNumber }
            }),
          });
        } catch (e) {}
      } else if (autoLoginResult.requiresSubscription && autoLoginResult.phoneNumber) {
        // User doesn't exist yet, but we got phone number from error response
        phoneNumber = autoLoginResult.phoneNumber;
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'info',
              message: '[SubscriptionPage] SuperApp one-time flow - Got phone from new user',
              context: { phoneNumber }
            }),
          });
        } catch (e) {}
      } else {
        // Fallback to profile if auto-login fails
        try {
          const profile = await api.request('/profile/me/');
          phoneNumber = profile?.phone_number || user?.profile?.phone_number || '';
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'info',
              message: '[SubscriptionPage] SuperApp one-time flow - Got phone from profile fallback',
              context: { phoneNumber }
            }),
          });
        } catch (e) {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'error',
              message: '[SubscriptionPage] SuperApp one-time flow - Failed to get phone from profile',
              context: { error: e.message }
            }),
          });
        }
      }

      if (!phoneNumber) {
        showToast('error', 'Could not get phone number. Please try again.');
        setProcessing(false);
        setProcessingTierId(null);
        return;
      }

      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[SubscriptionPage] SuperApp one-time flow - Step 1: Purchasing one-time subscription',
            context: { planType: tier.duration_type }
          }),
        });
      } catch (e) {}

      // Purchase one-time subscription (mimics coin purchase flow)
      // For new users, pass phone number instead of requiring auth token
      const currentToken = api.getToken();
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[SubscriptionPage] SuperApp one-time flow - Token check before purchase',
            context: { hasToken: !!currentToken, tokenPreview: currentToken ? currentToken.substring(0, 10) + '...' : 'None', phoneNumber }
          }),
        });
      } catch (e) {}

      const purchaseResult = await telebirrH5.purchaseSubscription(tier.duration_type, phoneNumber);

      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[SubscriptionPage] SuperApp one-time flow - Purchase result',
            context: { success: purchaseResult.success, pending: purchaseResult.pending, error: purchaseResult.error }
          }),
        });
      } catch (e) {}
      
      if (!purchaseResult.success) {
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'error',
              message: '[SubscriptionPage] SuperApp one-time flow - Purchase failed',
              context: { error: purchaseResult.error }
            }),
          });
        } catch (e) {}
        showToast('error', purchaseResult.error || 'Failed to purchase subscription');
        setProcessing(false);
        setProcessingTierId(null);
        return;
      }

      // Payment succeeded (or is pending async webhook confirmation) - in
      // both cases the backend either has already created/activated the
      // subscription/account, or will shortly via the webhook. Either way,
      // we need a valid auth token for this user before we can redirect
      // them home. The `autoLoginResult` captured BEFORE payment is stale
      // for brand-new users (their account didn't exist yet), so we must
      // retry auto-login now that the SuperApp account should exist.
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'info',
            message: '[SubscriptionPage] SuperApp one-time flow - Payment result, resolving auth token',
            context: { pending: purchaseResult.pending, hadPriorToken: !!autoLoginResult.token }
          }),
        });
      } catch (e) {}

      setTermsModalOpen(false);

      let finalAuthResult = autoLoginResult;
      if (!finalAuthResult.success || !finalAuthResult.token) {
        // New user - retry auto-login a few times since the account is
        // created by the webhook, which may lag slightly behind the
        // synchronous payment/query flow.
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            await api.request('/client-log/', {
              method: 'POST',
              body: JSON.stringify({
                level: 'info',
                message: `[SubscriptionPage] SuperApp one-time flow - Retry auto-login attempt ${attempt}`,
              }),
            });
          } catch (e) {}

          const retryResult = await telebirrH5.autoLogin();
          if (retryResult.success && retryResult.token) {
            finalAuthResult = retryResult;
            break;
          }
          if (attempt < 5) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }

      if (finalAuthResult.success && finalAuthResult.token) {
        api.setAuthToken(finalAuthResult.token);
        localStorage.setItem('authToken', finalAuthResult.token);
        if (finalAuthResult.user) localStorage.setItem('user', JSON.stringify(finalAuthResult.user));
        if (onAuthSuccess) onAuthSuccess(finalAuthResult.user, finalAuthResult.token);
        setSuccessModalOpen(true);
        setTimeout(() => {
          setSuccessModalOpen(false);
          onBack?.();
        }, 2500);
      } else {
        try {
          await api.request('/client-log/', {
            method: 'POST',
            body: JSON.stringify({
              level: 'error',
              message: '[SubscriptionPage] SuperApp one-time flow - Auto-login retries exhausted after successful payment',
              context: { phoneNumber }
            }),
          });
        } catch (e) {}
        // Payment succeeded but we still couldn't get a token. Show success
        // (the account/subscription is confirmed server-side) and let the
        // user reload from home, where auto-login will run again.
        setSuccessModalOpen(true);
        setTimeout(() => {
          setSuccessModalOpen(false);
          onBack?.();
        }, 2500);
      }
    } catch (error) {
      try {
        await api.request('/client-log/', {
          method: 'POST',
          body: JSON.stringify({
            level: 'error',
            message: '[SubscriptionPage] SuperApp one-time flow - Exception',
            context: { error: error.message, stack: error.stack }
          }),
        });
      } catch (e) {}
      showToast('error', 'Failed to process subscription');
    } finally {
      setProcessing(false);
      setProcessingTierId(null);
    }
  };

  // ============================================================================
  // NEW: USSD Push Telebirr subscription flow (web app only).
  // The user pays ONCE for the selected period via USSD Push. When it expires
  // they must click the Telebirr button again to renew.
  // ============================================================================
  const handleTelebirrProceed = async () => {
    const clog = (level, message, data) => {
      console[level === 'error' ? 'error' : 'log'](`[SubscriptionPage][USSD] ${message}`, data || '');
      api.request('/client-log/', {
        method: 'POST',
        body: JSON.stringify({ level, message: `[SubscriptionPage][USSD] ${message}`, data }),
      }).catch(() => {});
    };

    setProcessing(true);
    setProcessingTierId(selectedTierForTelebirr.id);
    setTelebirrModalOpen(false);

    const isAuthed = api.hasToken();
    clog('info', 'USSD proceed clicked', { tierId: selectedTierForTelebirr.id, isAuthed, telebirrPhone });

    try {
      const requestBody = {
        tier_id: selectedTierForTelebirr.id,
      };
      
      // Add phone number if user is not authenticated
      if (!isAuthed) {
        if (!telebirrPhone || telebirrPhone.length < 10) {
          clog('error', 'Invalid phone number entered', { telebirrPhone });
          showToast('error', 'Please enter a valid phone number');
          setProcessing(false);
          setProcessingTierId(null);
          return;
        }
        requestBody.phone_number = telebirrPhone;
      }
      
      clog('info', 'Calling /subscription/telebirr/ussd/initiate/', requestBody);
      const response = await api.request('/subscription/telebirr/ussd/initiate/', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      clog('info', 'Initiate response received', response);

      if (response.success && response.originator_conversation_id) {
        const originatorId = response.originator_conversation_id;
        clog('info', 'USSD push accepted, starting status poll', { originatorId, isAuthed, POLL_INTERVAL, MAX_POLLS });

        // Poll payment/subscription status until the webhook activates it.
        // NOTE: For anonymous (phone-only) users we CANNOT poll the
        // authenticated /subscriptions/ endpoint (it 401s). Use the public
        // /subscription/telebirr/ussd/status/ endpoint instead, keyed by the
        // originator_conversation_id returned above.
        let count = 0;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          count++;
          setPollCount(count);
          try {
            let payment;
            if (isAuthed) {
              payment = await api.request('/subscriptions/', { skipCache: true });
              clog('info', `Poll #${count} (authenticated /subscriptions/)`, payment);
              if (payment && payment.status === 'active') {
                clearInterval(pollRef.current);
                setProcessing(false);
                setProcessingTierId(null);
                setCurrentSubscription(payment);
                clog('info', 'Subscription active, user already logged in - showing success');
                setSuccessModalOpen(true);
                setTimeout(() => {
                  setSuccessModalOpen(false);
                  onBack?.();
                }, 3000);
              }
            } else {
              payment = await api.request(
                `/subscription/telebirr/ussd/status/?originator_conversation_id=${encodeURIComponent(originatorId)}`,
                { skipCache: true }
              );
              clog('info', `Poll #${count} (public ussd/status)`, payment);

              if (payment && payment.status === 'failed') {
                clearInterval(pollRef.current);
                setProcessing(false);
                setProcessingTierId(null);
                clog('error', 'Payment failed per webhook', payment);
                showToast('error', 'Payment failed. Please try again.');
                return;
              }

              if (payment && payment.status === 'completed' && payment.subscription_status === 'active') {
                clearInterval(pollRef.current);
                setProcessing(false);
                setProcessingTierId(null);
                clog('info', 'Payment completed + subscription active - redirecting to login/register', payment);

                const phone = payment.phone_number || telebirrPhone;
                if (phone) {
                  const is_new_user = payment.is_new_user;
                  clog('info', 'Redirecting based on is_new_user from status endpoint', { phone, is_new_user });
                  if (is_new_user) {
                    window.location.href = `/?subscription_tp=true&phone=${phone}&from_telebirr=true`;
                  } else {
                    window.location.href = `/?login=true&phone=${phone}&telebirr_otp_mode=true`;
                  }
                } else {
                  clog('error', 'No phone number available for redirect, falling back to login');
                  window.location.href = '/?login=true';
                }
              }
            }
          } catch (e) {
            clog('error', `Poll #${count} threw an exception`, { error: e.message });
          }
          if (count >= MAX_POLLS) {
            clearInterval(pollRef.current);
            setProcessing(false);
            setProcessingTierId(null);
            clog('error', 'Polling exhausted MAX_POLLS without activation', { count });
            showToast('info', 'Payment is taking longer than expected. Please check your subscription status.');
          }
        }, POLL_INTERVAL);
      } else {
        clog('error', 'Initiate failed', response);
        setProcessing(false);
        setProcessingTierId(null);
        showToast('error', response.error || 'Failed to initiate USSD payment');
      }
    } catch (error) {
      clog('error', 'Exception during USSD initiate', { error: error.message, stack: error.stack });
      setProcessing(false);
      setProcessingTierId(null);
      showToast('error', 'Failed to process telebirr subscription');
    }
  };

  // ============================================================================
  // OLD: RECURRING Telebirr subscription flow (mandate stays active and Telebirr
  // auto-charges). Kept for reference; replaced by the one-off flow above.
  // ============================================================================
  // const handleTelebirrProceed = async () => {
  //   if (!telebirrPhone || telebirrPhone.length < 10) {
  //     showToast('error', 'Please enter a valid phone number');
  //     return;
  //   }
  //
  //   setProcessing(true);
  //   setProcessingTierId(selectedTierForTelebirr.id);
  //   setTelebirrModalOpen(false);
  //
  //   try {
  //     const frequency = selectedTierForTelebirr.duration_type === 'daily' ? '02' :
  //                      selectedTierForTelebirr.duration_type === 'weekly' ? '03' :
  //                      selectedTierForTelebirr.duration_type === 'monthly' ? '05' : '05';
  //
  //     const response = await api.request('/direct-debit/create/', {
  //       method: 'POST',
  //       body: JSON.stringify({
  //         tier_id: selectedTierForTelebirr.id,
  //         payer_msisdn: telebirrPhone,
  //         frequency: frequency,
  //       }),
  //     });
  //
  //     if (response.success) {
  //       setSuccessModalOpen(true);
  //       setTimeout(() => setSuccessModalOpen(false), 3000);
  //       startPolling(selectedTierForTelebirr);
  //     } else {
  //       showToast('error', response.error || 'Failed to create mandate');
  //     }
  //   } catch (error) {
  //     console.error('telebirr subscription error:', error);
  //     showToast('error', 'Failed to process telebirr subscription');
  //   } finally {
  //     setProcessing(false);
  //     setProcessingTierId(null);
  //   }
  // };


  const handlePayment = async () => {
    if (!selectedTier) return;

    setProcessing(true);
    try {
      const response = await api.request('/subscriptions/subscribe/', {
        method: 'POST',
        body: JSON.stringify({
          tier_id: selectedTier.id,
          payment_method: paymentMethod,
        }),
      });

      if (response.status === 'success' || response.status === 'pending') {
        if (response.payment_url) {
          // Redirect to payment URL for telebirr
          window.open(response.payment_url, '_blank');
        }
        alert(response.message || 'Subscription initiated successfully');
        setShowPaymentModal(false);
        loadSubscriptionData();
      } else {
        alert(response.error || 'Failed to subscribe');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to process subscription');
    } finally {
      setProcessing(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (confirm('Are you sure you want to cancel your subscription?')) {
      try {
        await api.request('/subscriptions/unsubscribe/', {
          method: 'POST',
        });
        alert('Subscription cancelled successfully');
        loadSubscriptionData();
      } catch (error) {
        alert('Failed to cancel subscription');
      }
    }
  };

  const handleCancelTelebirrSubscription = async () => {
    if (!currentSubscription?.mandate_id) {
      showToast('error', 'No telebirr mandate found');
      return;
    }

    if (confirm('Are you sure you want to cancel your telebirr subscription?')) {
      setProcessing(true);
      try {
        const response = await api.request('/direct-debit/cancel/', {
          method: 'POST',
          body: JSON.stringify({
            mandate_id: currentSubscription.mandate_id,
          }),
        });

        if (response.success) {
          showToast('success', 'telebirr subscription cancelled successfully');
          loadSubscriptionData();
        } else {
          showToast('error', response.error || 'Failed to cancel telebirr subscription');
        }
      } catch (error) {
        console.error('Cancel telebirr subscription error:', error);
        showToast('error', 'Failed to cancel telebirr subscription');
      } finally {
        setProcessing(false);
      }
    }
  };


  // ── Mobile-app design tokens (mirrors mobile-app/src/screens/SubscriptionScreen.js) ──
  const M_BG     = '#0B0B0C';
  const M_CARD   = '#161616';
  const M_BORDER = '#242424';
  const BRAND_GREEN = '#8fc441';
  const PLAN_COLORS = { daily: BRAND_GREEN, weekly: BRAND_GREEN, monthly: BRAND_GREEN };
  const PLAN_ICON   = { daily: Zap,       weekly: Star,      monthly: Trophy };
  const BENEFITS = [
    { icon: Video,  text: 'HD Videos' },
    { icon: Ban,    text: 'No Ads' },
    { icon: Star,   text: 'Exclusive Content' },
    { icon: Trophy, text: 'Campaign Priority' },
  ];

  const getTierColor = (durationType) => PLAN_COLORS[durationType] || BRAND_GREEN;
  const getTierIcon  = (durationType) => PLAN_ICON[durationType] || Crown;

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#666', background: M_BG, minHeight: '100vh' }}>
        Loading subscription data…
      </div>
    );
  }

  const isActive = currentSubscription?.status === 'active';
  const hasAnySubscription = isActive;

  return (
    <div style={{ ...(isMobile ? { height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : { minHeight: '100vh' }), background: M_BG, color: '#fff' }}>
      {/* Reconciliation Progress Overlay */}
      {reconciling && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
        }}>
          <div style={{
            width: 48, height: 48,
            border: '3px solid #10B981',
            borderTop: '3px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 20,
          }} />
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#fff' }}>
            processing
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: isMobile ? '4px 12px' : '12px 16px',
        display: 'flex',
        alignItems: 'center',
        position: isMobile ? 'relative' : 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, borderRadius: 18,
            background: '#1a1a1a',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}
          aria-label="Back"
        >
          <ChevronLeft size={isMobile ? 16 : 22} />
        </button>
      </div>

      <div style={{ maxWidth: '100%', margin: '0 auto', paddingBottom: isMobile ? 4 : 32, ...(isMobile ? { flex: 1 } : {}) }}>
        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? '6px 16px' : '32px 24px' }}>
          <div style={{ fontSize: isMobile ? 17 : 32, fontWeight: 900, marginBottom: isMobile ? 2 : 8, color: '#fff' }}>FlipStar Premium</div>
          <div style={{ fontSize: isMobile ? 11 : 16, color: BRAND_GREEN, textAlign: 'center', fontWeight: 600 }}>Unlock the full experience</div>
          {isActive && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#0D2D1A', padding: '7px 14px', borderRadius: 20,
                border: '1px solid #10B98140',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: '#10B981' }} />
                <span style={{ color: '#10B981', fontSize: 13, fontWeight: 600 }}>
                  Active · {currentSubscription?.tier?.name || 'Premium'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12, color: '#aaa' }}>
                <div>
                  <span style={{ color: '#888' }}>Start:</span> {currentSubscription?.start_date ? new Date(currentSubscription.start_date).toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                  }) : 'N/A'}
                </div>
                <div>
                  <span style={{ color: '#888' }}>End:</span> {currentSubscription?.end_date ? new Date(currentSubscription.end_date).toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                  }) : 'N/A'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section label */}
        <div style={{
          fontSize: isMobile ? 10 : 13, fontWeight: 700, color: '#555',
          padding: '0 16px', marginBottom: isMobile ? 4 : 12,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          {isActive && telebirrH5.isInSuperApp() && currentSubscription?.payment_method === 'telebirr' ? 'Current Subscription' :
           isActive ? 'Add On-Demand Access' : 'Choose a plan'}
        </div>

        {/* Plan cards - horizontal on desktop, stack on mobile.
            When the user has an ACTIVE subscription, blur and disable
            the entire card grid so they can't pick another plan. As
            soon as the subscription is cancelled / expired / fails to
            renew (insufficient balance), `currentSubscription.status`
            stops being 'active', the wrapper unblurs, and the cards
            become interactive again — the polling in App.jsx and
            loadSubscriptionData() after cancel keep this in sync.
            Hide plan cards for ANY active subscription (cross-platform ban). */}
        {!isActive && (
          <div style={{ position: 'relative', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: isMobile ? 6 : 20,
              padding: '0 16px',
            }}>
          {tiers.map((tier) => {
              const TierIcon = getTierIcon(tier.duration_type);
              const color = BRAND_GREEN;
              const isCurrent = isActive && currentSubscription?.tier?.id === tier.id;
              const isProcessingThis = processing && processingTierId === tier.id;
              const hasSubscription = isActive;

              return (
                <div
                  key={tier.id}
                  onClick={() => {
                    if (hasSubscription && !isCurrent) {
                      setActiveSubscriptionModalOpen(true);
                    } else if (!isCurrent && !hasSubscription && !isProcessingThis) {
                      setSelectedTierForMethod(tier);
                      setMethodModalOpen(true);
                    }
                  }}
                  style={{
                    background: isCurrent ? BRAND_GREEN + '10' : M_CARD,
                    borderRadius: isMobile ? 14 : 24,
                    padding: isMobile ? 10 : 24,
                    border: `2px solid ${isCurrent ? BRAND_GREEN : M_BORDER}`,
                    position: 'relative',
                    transition: 'all 0.3s ease',
                    cursor: isCurrent || hasSubscription || isProcessingThis ? 'default' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (isCurrent || hasSubscription || isProcessingThis) return;
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(143,196,65,0.3)';
                  }}
                  onMouseOut={(e) => {
                    if (isCurrent || hasSubscription || isProcessingThis) return;
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                {isCurrent && (
                  <div style={{
                    position: 'absolute', top: -10, right: 14,
                    background: BRAND_GREEN,
                    padding: isMobile ? '3px 8px' : '6px 16px', borderRadius: 20,
                    color: '#000', fontSize: isMobile ? 9 : 12, fontWeight: 800,
                    boxShadow: '0 4px 12px rgba(143,196,65,0.3)',
                  }}>
                    Current Plan
                  </div>
                )}

                {/* Top: icon + name/desc + price */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: isMobile ? 8 : 20 }}>
                  <div style={{
                    width: isMobile ? 34 : 60, height: isMobile ? 34 : 60, borderRadius: isMobile ? 10 : 20,
                    background: BRAND_GREEN,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 8px 24px rgba(143,196,65,0.2)',
                  }}>
                    <TierIcon size={isMobile ? 16 : 28} color="#fff" />
                  </div>
                  <div style={{ flex: 1, marginLeft: isMobile ? 10 : 16, minWidth: 0 }}>
                    <div style={{ fontSize: isMobile ? 12 : 18, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                      {tier.name}
                    </div>
                    <div style={{ fontSize: isMobile ? 9 : 13, color: '#666', fontWeight: 500 }}>
                      {tier.description}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <div style={{ fontSize: isMobile ? 20 : 32, fontWeight: 900, color: BRAND_GREEN, lineHeight: isMobile ? '22px' : '34px' }}>
                      {tier.price_etb}
                    </div>
                    <div style={{ fontSize: isMobile ? 9 : 13, color: BRAND_GREEN, fontWeight: 600 }}>ETB</div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
        )}

        {/* Payment info */}
        <div style={{
          display: 'flex', gap: isMobile ? 6 : 12, alignItems: 'flex-start',
          margin: isMobile ? '2px 16px 0' : '4px 16px 0',
          background: BRAND_GREEN + '10', borderRadius: isMobile ? 10 : 16, padding: isMobile ? 8 : 16,
          border: `1px solid ${BRAND_GREEN}30`,
        }}>
          <Info size={isMobile ? 14 : 20} color={BRAND_GREEN} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, fontSize: isMobile ? 9 : 13, color: '#ccc', lineHeight: isMobile ? 1.3 : 1.6 }}>
            <div style={{ marginBottom: 8 }}>
              <strong style={{ color: BRAND_GREEN, fontWeight: 700 }}>telebirr:</strong> One-tap subscription via telebirr app. One-time payment.
            </div>
            <div>
              <strong style={{ color: BRAND_GREEN, fontWeight: 700 }}>SMS:</strong> Send SMS to <span style={{ color: BRAND_GREEN, fontWeight: 800 }}>9286</span> with code{' '}
              <span style={{ color: '#fff', fontWeight: 700 }}>1</span> (Daily),{' '}
              <span style={{ color: '#fff' }}>2</span> (Weekly),{' '}
              <span style={{ color: '#fff' }}>3</span> (Monthly) via ethio telecom.
            </div>
          </div>
        </div>


        {/* telebirr Receipt Modal — shown when user clicks "Subscribe via telebirr" */}
        {telebirrModalOpen && selectedTierForTelebirr && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
            padding: isMobile ? 16 : 24,
            overflow: 'auto',
          }}>
            <div style={{
              background: '#F5F5F5',
              borderRadius: 24,
              padding: isMobile ? 20 : 24,
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}>
              {/* Close button */}
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 4 }}>
                <button
                  onClick={() => setTelebirrModalOpen(false)}
                  aria-label="Close"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    color: '#000',
                    fontSize: 22,
                    lineHeight: 1,
                  }}
                >
                  <X size={22} color="#000" />
                </button>
              </div>

              {/* Title */}
              <div style={{
                textAlign: 'center',
                fontSize: 14,
                color: '#333',
                marginBottom: 4,
              }}>
                Subscribe to FlipStar {selectedTierForTelebirr.name}
              </div>

              {/* Total amount big */}
              <div style={{
                textAlign: 'center',
                fontSize: 36,
                fontWeight: 900,
                color: '#000',
                marginBottom: 20,
              }}>
                {selectedTierForTelebirr.price_etb}.00
                <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 4 }}>ETB</span>
              </div>

              {/* Receipt details card */}
              <div style={{
                background: '#fff',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 14, color: '#333' }}>Plan</span>
                  <span style={{ fontSize: 14, color: '#000', fontWeight: 700 }}>
                    {selectedTierForTelebirr.name}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 14, color: '#333' }}>
                    {selectedTierForTelebirr.duration_type === 'daily' ? 'Daily Amount' :
                     selectedTierForTelebirr.duration_type === 'weekly' ? 'Weekly Amount' :
                     selectedTierForTelebirr.duration_type === 'monthly' ? 'Monthly Amount' : 'Amount'}
                  </span>
                  <span style={{ fontSize: 14, color: '#000', fontWeight: 700 }}>
                    {selectedTierForTelebirr.price_etb}.00 ETB
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 14, color: '#333' }}>Date</span>
                  <span style={{ fontSize: 14, color: '#000', fontWeight: 700 }}>
                    {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#333' }}>Phone Number</span>
                  <span style={{ fontSize: 14, color: '#000', fontWeight: 700 }}>
                    {telebirrPhone || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Proceed button */}
              <button
                onClick={handleTelebirrProceed}
                disabled={processing}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: processing ? '#9CB870' : '#8fc441',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: processing ? 'wait' : 'pointer',
                  boxShadow: '0 4px 16px rgba(143,196,65,0.3)',
                }}
              >
                {processing ? 'Processing…' : 'Proceed'}
              </button>
            </div>
          </div>
        )}

        {/* Terms and Conditions Modal */}
        {termsModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1002,
          }}>
            <div style={{
              background: '#1A1A1A',
              borderRadius: 24,
              padding: 32,
              width: '90%',
              maxWidth: 500,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  Terms and Conditions
                </div>
                <button
                  onClick={() => setTermsModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <X size={24} color="#999" />
                </button>
              </div>

              {/* Content */}
              <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6, marginBottom: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#fff' }}>1. Subscription Terms</strong>
                  <p style={{ marginTop: 8 }}>
                    By subscribing to FlipStar, you agree to be charged the subscription fee according to your selected plan (Daily, Weekly, or Monthly).
                  </p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#fff' }}>2. Auto-Renewal</strong>
                  <p style={{ marginTop: 8 }}>
                    Your subscription will automatically renew at the end of each billing cycle unless you cancel it. You can cancel at any time through the app settings or by sending "STOP" to the FlipStar shortcode.
                  </p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#fff' }}>3. Refund Policy</strong>
                  <p style={{ marginTop: 8 }}>
                    Subscription fees are non-refundable. Once charged, the fee applies to the current billing cycle and cannot be refunded.
                  </p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#fff' }}>4. Service Availability</strong>
                  <p style={{ marginTop: 8 }}>
                    FlipStar service requires an active Ethio Telecom mobile subscription. Service may be suspended if your mobile account becomes inactive or has insufficient balance.
                  </p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#fff' }}>5. User Responsibilities</strong>
                  <p style={{ marginTop: 8 }}>
                    You agree to use FlipStar in accordance with our community guidelines and Ethiopian laws. Prohibited content includes hate speech, violence, harassment, and illegal activities.
                  </p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#fff' }}>6. Privacy</strong>
                  <p style={{ marginTop: 8 }}>
                    Your personal information, including phone number, will be used for subscription management and service delivery. We do not share your data with third parties without your consent.
                  </p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <strong style={{ color: '#fff' }}>7. Modifications</strong>
                  <p style={{ marginTop: 8 }}>
                    Ethio Telecom reserves the right to modify these terms, subscription plans, and pricing. Changes will be communicated through the app and SMS notifications.
                  </p>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={() => setTermsModalOpen(false)}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: BRAND_GREEN,
                  border: 'none',
                  borderRadius: 12,
                  color: '#000',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(143,196,65,0.3)',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Active Subscription Modal */}
        {activeSubscriptionModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <div
              style={{
                background: '#1A1A1A',
                borderRadius: 16,
                padding: 32,
                maxWidth: 400,
                width: '90%',
                textAlign: 'center',
                border: '1px solid #333',
                boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                animation: 'scaleIn 0.3s ease',
              }}
            >
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <AlertCircle size={32} color="#000" />
              </div>
              <h3 style={{
                color: '#fff',
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 12,
              }}>
                Active Subscription
              </h3>
              <p style={{
                color: '#999',
                fontSize: 15,
                lineHeight: 1.6,
                marginBottom: 24,
              }}>
                You have an active subscription. Please wait for it to expire before subscribing again.
              </p>
              <button
                onClick={() => setActiveSubscriptionModalOpen(false)}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: '#8fc441',
                  border: 'none',
                  borderRadius: 12,
                  color: '#000',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(143,196,65,0.3)',
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}


        {/* Success Modal */}
        {successModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <div
              style={{
                background: '#1A1A1A',
                borderRadius: 16,
                padding: 32,
                maxWidth: 320,
                width: '90%',
                textAlign: 'center',
                border: '1px solid #333',
                boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
                animation: 'scaleIn 0.3s ease',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                Successfully Subscribed!
              </div>
              <div style={{ fontSize: isMobile ? 13 : 14, color: '#999', lineHeight: 1.5 }}>
                Your subscription is now active.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inline toast — replaces native alert() popups for the on-demand
          (airtime) flow. Stays out of the way and auto-dismisses. */}
      {/* Telebirr Phone Input Modal — rendered at top level to avoid clipping */}
      {telebirrPhoneInputOpen && selectedTierForTelebirr && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1100,
          padding: isMobile ? 16 : 24,
        }}>
          <div style={{
            background: '#F5F5F5',
            borderRadius: 24,
            padding: isMobile ? 24 : 28,
            width: '100%',
            maxWidth: 400,
            boxSizing: 'border-box',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 4 }}>
              <button
                onClick={() => setTelebirrPhoneInputOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#000' }}
              >
                <X size={22} color="#000" />
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: isMobile ? 16 : 14, color: '#333', marginBottom: 4 }}>
              Enter Phone Number
            </div>
            <div style={{ textAlign: 'center', fontSize: isMobile ? 13 : 12, color: '#888', marginBottom: isMobile ? 24 : 20 }}>
              Enter your Telebirr phone number to subscribe
            </div>
            <div style={{ marginBottom: isMobile ? 24 : 20 }}>
              <input
                type="tel"
                placeholder="0911 234 567"
                value={telebirrPhone}
                onChange={(e) => setTelebirrPhone(e.target.value)}
                style={{
                  width: '100%',
                  padding: isMobile ? '18px' : '16px',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: 12,
                  fontSize: isMobile ? 18 : 16,
                  color: '#000',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={handleTelebirrPhoneSubmit}
              disabled={!telebirrPhone || telebirrPhone.length < 10}
              style={{
                width: '100%',
                padding: isMobile ? '18px' : '16px',
                background: (!telebirrPhone || telebirrPhone.length < 10) ? '#9CB870' : '#8fc441',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: isMobile ? 18 : 16,
                fontWeight: 700,
                cursor: (!telebirrPhone || telebirrPhone.length < 10) ? 'wait' : 'pointer',
                boxShadow: '0 4px 16px rgba(143,196,65,0.3)',
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Subscription Method Selection Modal — rendered at top level to avoid clipping */}
      {methodModalOpen && selectedTierForMethod && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
          padding: isMobile ? 16 : 24,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: isMobile ? 16 : 24,
            padding: isMobile ? 24 : 32,
            width: '100%',
            maxWidth: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, color: '#000' }}>
                Choose Payment Method
              </div>
              <button
                onClick={() => setMethodModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #eee' }}>
              <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: '#000', marginBottom: 4 }}>
                {selectedTierForMethod.name} Plan
              </div>
              <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 900, color: '#8fc441' }}>
                {selectedTierForMethod.price_etb} ETB
              </div>
              <div style={{ fontSize: isMobile ? 12 : 13, color: '#666', marginTop: 4 }}>
                {selectedTierForMethod.description}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={() => {
                  setMethodModalOpen(false);
                  handleTelebirrSubscribe(selectedTierForMethod);
                }}
                style={{
                  width: '100%',
                  padding: isMobile ? 14 : 16,
                  background: '#8fc441',
                  border: 'none',
                  borderRadius: 12,
                  color: '#000',
                  fontSize: isMobile ? 14 : 15,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 16px rgba(143,196,65,0.3)',
                }}
              >
                <Trophy size={18} color="#000" />
                Subscribe via telebirr
              </button>

              {!telebirrH5.isInSuperApp() && (
                <button
                  onClick={() => {
                    setMethodModalOpen(false);
                    handleSubscribe(selectedTierForMethod);
                  }}
                  style={{
                    width: '100%',
                    padding: isMobile ? 14 : 16,
                    background: 'transparent',
                    border: '2px solid #8fc441',
                    borderRadius: 12,
                    color: '#8fc441',
                    fontSize: isMobile ? 14 : 15,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <MessageCircle size={18} color="#8fc441" />
                  Subscribe via SMS
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 32,
            transform: 'translateX(-50%)',
            background: toast.type === 'success'
              ? '#10B981'
              : toast.type === 'error'
              ? '#EF4444'
              : 'rgba(20,20,20,0.92)',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            zIndex: 10001,
            maxWidth: '90vw',
            textAlign: 'center',
          }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}


