import config from './config.js';

const API_BASE_URL = config.API_BASE_URL;

let authToken =
  localStorage.getItem('authToken') || localStorage.getItem('adminToken');

// Clear potentially stale tokens on startup
const storedToken = localStorage.getItem('authToken');
if (storedToken) {
  console.log('🔍 Found stored token, will validate on first authenticated request');
}

// --- Lightweight GET cache & request deduplication ---
const _cache = new Map();
const _inflight = new Map();
const CACHE_TTL = 60_000; // 60s default TTL for better performance
const MAX_RETRIES = 2; // Max retries for network errors
const RETRY_DELAY = 1000; // Delay between retries in ms

function getCached(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < entry.ttl) return entry.data;
  _cache.delete(key);
  return null;
}
function setCache(key, data, ttl = CACHE_TTL) {
  _cache.set(key, { data, ts: Date.now(), ttl });
}

// Retry function for network errors
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      // Only retry on network errors, not on 4xx/5xx HTTP errors
      if (error.name === 'TypeError' || error.message.includes('fetch') || error.message.includes('network')) {
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
          continue;
        }
      }
      throw error;
    }
  }
  return fn();
}
function invalidateCache(pattern) {
  for (const key of _cache.keys()) {
    if (key.includes(pattern)) _cache.delete(key);
  }
}

const api = {
  setAuthToken: (token) => {
    authToken = token;
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
    _cache.clear(); // Clear cache on auth change
  },

  setAdminToken: (token) => {
    authToken = token;
    if (token) {
      localStorage.setItem('adminToken', token);
    } else {
      localStorage.removeItem('adminToken');
    }
    _cache.clear();
  },

  getToken: () => {
    return authToken || localStorage.getItem('authToken');
  },

  hasToken: () => {
    return !!(authToken || localStorage.getItem('authToken'));
  },

  clearAuth: () => {
    console.log('🧹 Clearing all auth data');
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('user');
    _cache.clear();
  },

  clearToken: () => {
    authToken = null;
    localStorage.removeItem('authToken');
    _cache.clear();
  },

  async request(endpoint, options = {}) {
    // Cache logic
    const isGet = !options.method || options.method.toUpperCase() === 'GET';
    // Real-time endpoints must NEVER be cached — polling would otherwise be dead.
    const isRealtime = (
      endpoint.startsWith('/messages/') ||
      endpoint.includes('/notifications/unread') ||
      endpoint.includes('unread-count')
    );
    const cacheable = isGet && !options.skipCache && !isRealtime;
    const cacheKey = cacheable ? endpoint : null;

    // Return cached data for GET requests
    if (cacheable && cacheKey) {
      const cached = getCached(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Deduplicate in-flight identical GET requests (huge perf win).
    // If the same GET is already in flight, reuse that promise instead of
    // firing a duplicate request. This collapses React-StrictMode double
    // mounts, rapid tab switches, and parallel component fetches into a
    // single network call.
    const inflightKey = isGet ? `GET:${endpoint}` : null;
    if (inflightKey && _inflight.has(inflightKey)) {
      return _inflight.get(inflightKey);
    }

    const doRequest = async () => {
      const headers = { ...options.headers };
      // Never force a JSON Content-Type on multipart/FormData bodies — the
      // browser must set `multipart/form-data; boundary=...` itself, otherwise
      // the server cannot parse uploaded files (images, voice notes, etc.).
      const bodyIsFormData =
        typeof FormData !== 'undefined' && options.body instanceof FormData;
      if (!options.isFormData && !bodyIsFormData && !isGet) {
        headers['Content-Type'] = 'application/json';
      }

      // Only add token if it exists AND it's not a public endpoint.
      // Auth endpoints that REQUIRE a token (change-password, delete-account, download-data) must
      // be excluded from the "public" classification so the Authorization header is attached.
      const currentToken = authToken || localStorage.getItem('authToken') || localStorage.getItem('adminToken');
      const AUTHED_AUTH_ENDPOINTS = ['/auth/change-password/', '/auth/delete-account/', '/auth/download-data/'];
      const isAuthedAuthEndpoint = AUTHED_AUTH_ENDPOINTS.some((p) => endpoint.startsWith(p));
      const isPublicEndpoint = (endpoint.includes('/auth/') && !isAuthedAuthEndpoint) || endpoint.includes('/settings/public');
      if (currentToken && !isPublicEndpoint) {
        headers['Authorization'] = `Token ${currentToken}`;
      }

      const response = await retryWithBackoff(async () => {
        return await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers,
        });
      });

      let data;
      // 204 No Content has no body (common for DELETE responses)
      if (response.status === 204) {
        data = { success: true };
      } else {
        // Read body once as text to avoid "body stream already read" error
        const responseText = await response.text();
        if (responseText) {
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            data = response.ok ? { success: true } : { error: responseText || 'Failed to parse response' };
          }
        } else {
          data = response.ok ? { success: true } : { error: 'Failed to parse response' };
        }
      }

      if (!response.ok) {
        // If 401 error on a GET request with token, retry without auth (for public endpoints like /reels/)
        // DON'T clear token for POST/PUT/DELETE requests - those require auth
        if (response.status === 401 && headers['Authorization'] && isGet) {
          console.warn('⚠️ 401 on GET with token — retrying without auth (public endpoint)');
          const retryHeaders = { ...headers };
          delete retryHeaders['Authorization'];
          const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: retryHeaders,
          });
          let retryData;
          try { retryData = await retryResponse.json(); } catch (e) { retryData = {}; }
          if (retryResponse.ok) {
            if (cacheable && cacheKey) setCache(cacheKey, retryData);
            return retryData;
          }
          console.warn('⚠️ Retry also failed — clearing credentials');
          // Only clear the regular user token; preserve adminToken so admin
          // panel sessions survive a stale-user-token 401 on a public GET.
          authToken = localStorage.getItem('adminToken') || null;
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          console.error('API Error after retry:', retryResponse.status, retryData);
          const retryErr = new Error(JSON.stringify(retryData) || `API Error: ${retryResponse.status}`);
          retryErr.status = retryResponse.status;
          retryErr.data = retryData;
          throw retryErr;
        }
        if (response.status === 401) {
          console.error('🔒 401 Unauthorized - authentication required');
        }
        // Global 403 handler for admin endpoints — surfaces the styled
        // "Access Denied" popup so read-only / edit-only admins get a
        // consistent UX instead of silent failures or raw alerts.
        if (response.status === 403 && endpoint.includes('/admin/') && typeof window !== 'undefined') {
          const detail = (data && (data.detail || data.error || data.message)) ||
            'You do not have permission to perform this action. Contact a super admin if you need access.';
          try {
            window.dispatchEvent(new CustomEvent('admin:permission-denied', { detail: { message: detail, endpoint } }));
          } catch (_) { /* no-op */ }
        }
        // Global 403 handler for grace period — surfaces the styled
        // "Top up your balance" modal when a user in grace period tries
        // to perform a blocked write action.
        if (response.status === 403 && data && data.grace_period && typeof window !== 'undefined') {
          const message = (data && (data.message || data.error || data.detail)) ||
            'Your subscription is in a grace period. Top up your balance to restore full access.';
          try {
            window.dispatchEvent(new CustomEvent('grace:action-blocked', { detail: { message, grace_expires_at: data.grace_expires_at } }));
          } catch (_) { /* no-op */ }
        }
        console.error('API Error:', response.status, data);
        // Attach status/data/retryAfter so callers can render proper UX
        // (e.g. 429 throttling lockout message).
        const err = new Error(JSON.stringify(data) || `API Error: ${response.status}`);
        err.status = response.status;
        err.data = data;
        if (response.status === 429) {
          const headerRetry = parseInt(response.headers.get('Retry-After') || '0', 10);
          // Fallback: parse seconds from DRF "Expected available in N seconds." message
          const detail = (data && (data.detail || data.error)) || '';
          const m = /(\d+)\s*seconds?/i.exec(detail);
          err.retryAfter = headerRetry > 0
            ? headerRetry
            : (m ? parseInt(m[1], 10) : 0);
        }
        throw err;
      }

      // Cache successful GET responses
      if (cacheable && cacheKey) setCache(cacheKey, data);
      return data;
    };

    // Wrap in a promise we can store in _inflight so parallel callers reuse
    // the same parsed result (important: a Response body can only be read once).
    const resultPromise = doRequest();
    if (inflightKey) {
      _inflight.set(inflightKey, resultPromise);
      // Always clean up the inflight entry once settled (success OR error)
      resultPromise.finally(() => {
        if (_inflight.get(inflightKey) === resultPromise) {
          _inflight.delete(inflightKey);
        }
      });
    }
    return resultPromise;
  },

  // Invalidate cache for specific patterns (call after mutations)
  invalidateCache,

  // Generic HTTP methods for admin panel
  get: (endpoint) =>
    api.request(endpoint, { method: 'GET' }).then((data) => ({ data })),
  post: (endpoint, body) =>
    api
      .request(endpoint, { method: 'POST', body: JSON.stringify(body) })
      .then((data) => ({ data })),
  patch: (endpoint, body) =>
    api
      .request(endpoint, { method: 'PATCH', body: JSON.stringify(body) })
      .then((data) => ({ data })),
  delete: (endpoint) =>
    api.request(endpoint, { method: 'DELETE' }).then((data) => ({ data })),

  // Auth
  // Phone/PIN login method
  loginWithPhone: (phone, pin) =>
    api.request('/auth/login-phone/', {
      method: 'POST',
      body: JSON.stringify({ phone, pin }),
    }),

  login: (username, password) =>
    api.request('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  // Phone OTP Registration
  sendPhoneOtp: (phone) =>
    api.request('/auth/send-phone-otp/', { method: 'POST', body: JSON.stringify({ phone }) }),

  verifyPhoneOtp: (phone, code) =>
    api.request('/auth/verify-phone-otp/', { method: 'POST', body: JSON.stringify({ phone, code }) }),

  // Forgot Password (Phone-based with SMS OTP)
  forgotPasswordPhoneRequest: (phone) =>
    api.request('/auth/forgot-password-phone/', { method: 'POST', body: JSON.stringify({ phone }) }),

  forgotPasswordPhoneVerify: (phone, code, new_password) =>
    api.request('/auth/forgot-password-phone/verify/', {
      method: 'POST',
      body: JSON.stringify({ phone, code, new_password }),
    }),

  resendSubscriptionOtp: (phone) =>
    api.request('/auth/resend-subscription-otp/', { method: 'POST', body: JSON.stringify({ phone }) }),

  // Profile
  getProfile: () => api.request('/profile/me/'),

  updateProfile: (data) =>
    api.request('/profile/1/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  dailyCheckIn: () =>
    api.request('/profile/daily_checkin/', {
      method: 'POST',
    }),

  // Reels
  getReels: () => api.request('/reels/'),

  createReel: (formData) =>
    fetch(`${API_BASE_URL}/reels/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${authToken}`,
      },
      body: formData,
    }).then((r) => r.json()),

  // Upload a new post.  Uses XMLHttpRequest instead of fetch so we can
  // surface REAL upload progress to the UI — a video upload over a slow
  // connection otherwise looks frozen for 10-30s.
  // Pass `onProgress(pct)` (0-100) to receive upload progress updates.
  // On very slow links, the browser often reports only two progress events
  // (start / end).  The UI should still animate defensively between them.
  createPost: (formData, { onProgress } = {}) => {
    const currentToken = authToken || localStorage.getItem('authToken');
    if (!currentToken) {
      return Promise.reject({ error: 'Not authenticated' });
    }
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/posts/create/`);
      xhr.setRequestHeader('Authorization', `Token ${currentToken}`);
      // Generous timeout so Render cold starts don't abort large uploads.
      xhr.timeout = 5 * 60 * 1000; // 5 minutes
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
      }
      xhr.onload = () => {
        let body;
        try { body = JSON.parse(xhr.responseText || '{}'); } catch { body = {}; }
        if (xhr.status >= 200 && xhr.status < 300) {
          invalidateCache('/reels');
          resolve(body);
        } else {
          reject(body && Object.keys(body).length ? body : { error: `HTTP ${xhr.status}` });
        }
      };
      xhr.onerror   = () => reject({ error: 'Network error' });
      xhr.ontimeout = () => reject({ error: 'Upload timed out' });
      xhr.onabort   = () => reject({ error: 'Upload aborted' });
      xhr.send(formData);
    });
  },

  // Competitions
  getCompetitions: () => api.request('/competitions/'),

  getActiveCompetitions: () => api.request('/competitions/?is_active=true'),

  // Winners
  getWinners: () => api.request('/winners/'),

  getLatestWinners: () => api.request('/winners/latest/'),

  voteReel: (reelId) =>
    api.request(`/reels/${reelId}/vote/`, {
      method: 'POST',
    }).then(r => { invalidateCache('/reels'); return r; }),

  postComment: (reelId, text) =>
    api.request(`/reels/${reelId}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }).then(r => { invalidateCache(`/reels/${reelId}/comments`); return r; }),

  getComments: (reelId) => api.request(`/reels/${reelId}/comments/`),

  followUser: (userId) =>
    api.request('/follows/toggle/', {
      method: 'POST',
      body: JSON.stringify({ following_id: userId }),
    }).then(r => { invalidateCache('/follows'); return r; }),

  unfollowUser: (userId) =>
    api.request('/follows/toggle/', {
      method: 'POST',
      body: JSON.stringify({ following_id: userId }),
    }).then(r => { invalidateCache('/follows'); return r; }),

  deletePost: (reelId) =>
    api.request(`/reels/${reelId}/`, {
      method: 'DELETE',
    }).then(r => { invalidateCache('/reels'); return r; }),

  updatePost: (reelId, data) =>
    api.request(`/reels/${reelId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(r => { invalidateCache('/reels'); return r; }),

  getNotificationSettings: () =>
    api.request('/notifications/me/'),

  updateNotificationSettings: (settings) =>
    api.request('/notifications/me/', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  getPrivacySettings: () =>
    api.request('/profile/privacy/'),

  updatePrivacySettings: (settings) =>
    api.request('/profile/privacy/update/', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  getUserNotifications: () =>
    api.request('/notifications/', { method: 'GET' }),

  getUnreadNotificationCount: () =>
    api.request('/notifications/unread-count/', { method: 'GET' }),

  markNotificationRead: (notificationId) =>
    api.request(`/notifications/${notificationId}/read/`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    api.request('/notifications/read/', { method: 'POST', body: JSON.stringify({}) }),

  // Reports
  createReport: (reportData) =>
    api.request('/reports/create/', {
      method: 'POST',
      body: JSON.stringify(reportData),
    }),

  getAdminReports: (status = null, type = null) => {
    let url = '/admin/reports/';
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (params.toString()) url += '?' + params.toString();
    return api.request(url, { method: 'GET' });
  },

  getAdminReportDetail: (reportId) =>
    api.request(`/admin/reports/${reportId}/`, {
      method: 'GET',
    }),

  updateAdminReport: (reportId, data) =>
    api.request(`/admin/reports/${reportId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getAdminReportsStats: () =>
    api.request('/admin/reports/stats/', {
      method: 'GET',
    }),

  // Quests
  getQuests: () => api.request('/quests/'),

  completeQuest: (questId) =>
    api.request(`/quests/${questId}/complete/`, {
      method: 'POST',
    }),

  // Subscription
  getSubscription: () => api.request('/subscription/'),

  // Notifications
  getNotificationPrefs: () => api.request('/notifications/me/'),

  updateNotificationPrefs: (prefs) =>
    api.request('/notifications/me/', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),

  // Search by hashtag
  searchByHashtag: (hashtag) =>
    api.request(`/reels/?hashtags__icontains=${encodeURIComponent(hashtag)}`),

  // Trending hashtags
  getTrendingHashtags: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.request(`/explorer/trending-hashtags/${qs ? '?' + qs : ''}`);
  },

  // Follow/Unfollow
  toggleFollow: (userId) =>
    api.request('/follows/toggle/', {
      method: 'POST',
      body: JSON.stringify({ following_id: userId }),
    }),

  getFollowers: (userId) => {
    if (!api.getToken()) return Promise.resolve([]);
    return api.request(`/follows/?following=${userId}`, { noCache: true });
  },

  getFollowing: (userId) => {
    if (!api.getToken()) return Promise.resolve([]);
    return api.request(`/follows/?follower=${userId}`, { noCache: true });
  },

  getUserSuggestions: () => api.request('/follows/suggestions/'),

  // Search
  search: (query) => api.request(`/search/?q=${encodeURIComponent(query)}`),

  // Get user by ID or username
  getUser: (userId) => api.request(`/profile/${userId}/`),

  // Comments with likes and replies
  getComments: (reelId) => api.request(`/reels/${reelId}/comments/`),

  likeComment: (commentId) =>
    api.request(`/comments/${commentId}/like/`, {
      method: 'POST',
    }),

  likeReply: (replyId) =>
    api.request(`/comment-replies/${replyId}/like/`, {
      method: 'POST',
    }),

  replyToComment: (commentId, text, parentReplyId = null) =>
    api.request(`/comments/${commentId}/reply/`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }).then(r => { invalidateCache('/comments'); return r; }),

  editComment: (commentId, text) =>
    api.request(`/comments/${commentId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }).then(r => { invalidateCache('/comments'); return r; }),

  deleteComment: (commentId) =>
    api.request(`/comments/${commentId}/`, {
      method: 'DELETE',
    }).then(r => { invalidateCache('/comments'); return r; }),

  editReply: (replyId, text) =>
    api.request(`/comment-replies/${replyId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }).then(r => { invalidateCache('/comments'); return r; }),

  deleteReply: (replyId) =>
    api.request(`/comment-replies/${replyId}/`, {
      method: 'DELETE',
    }).then(r => { invalidateCache('/comments'); return r; }),

  // Saved posts
  getSavedPosts: () => api.request('/saved/'),

  toggleSavePost: (reelId) =>
    api.request('/saved/toggle/', {
      method: 'POST',
      body: JSON.stringify({ reel_id: reelId }),
    }),

  // Profile photo upload
  uploadProfilePhoto: (photoFile) => {
    const formData = new FormData();
    formData.append('photo', photoFile);

    return fetch(`${API_BASE_URL}/profile-photo/upload/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${authToken}`,
      },
      body: formData,
    }).then((r) => r.json());
  },

  // Update profile with bio and name
  updateUserProfile: (data) => {
    const formData = new FormData();
    if (data.first_name) formData.append('first_name', data.first_name);
    if (data.last_name) formData.append('last_name', data.last_name);
    if (data.bio) formData.append('bio', data.bio);
    if (data.profile_photo)
      formData.append('profile_photo', data.profile_photo);

    return api.request('/profile/update_profile/', {
      method: 'PATCH',
      body: formData,
      isFormData: true,
    });
  },

  // Get user's posts
  getUserPosts: (userId) => api.request(`/reels/?user=${userId}`),

  // Get saved posts
  getSavedPosts: () => api.request('/reels/?saved=true'),
  getUserSavedPosts: () => api.request('/reels/?saved=true'),

  // Subscription status check
  checkSubscriptionStatus: () => {
    if (!api.hasToken()) return Promise.resolve({ has_subscription: false });
    return api.request('/subscription/status/', { skipCache: true }).then(data => {
      console.log('[SUBSCRIPTION STATUS] Raw response:', data);
      
      // Check if backend wants us to clear pending mandate
      if (data.clear_pending_mandate) {
        console.log('[SUBSCRIPTION STATUS] Clearing pending mandate from localStorage');
        try {
          localStorage.removeItem('telebirr_pending_mandate');
          console.log('[SUBSCRIPTION STATUS] ✅ Pending mandate cleared');
        } catch (e) {
          console.error('[SUBSCRIPTION STATUS] Failed to clear pending mandate:', e);
        }
      }
      
      return data;
    }).catch(err => {
      console.error('Subscription status check failed:', err);
      // Return false on any error to be safe
      return { has_subscription: false };
    });
  },

  // Settings
  changePassword: (currentPassword, newPassword) =>
    api.request('/auth/change-password/', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),

  deleteAccount: () =>
    api.request('/auth/delete-account/', {
      method: 'POST',
    }),

  downloadUserData: () =>
    api.request('/auth/download-data/', {
      method: 'GET',
    }),

  // Support requests (user side)
  getMySupportRequests: () => api.request('/support/requests/'),
  createSupportRequest: ({ category, subject, message }) =>
    api.request('/support/requests/', {
      method: 'POST',
      body: JSON.stringify({ category, subject, message }),
    }),

  // Support requests (admin)
  adminListSupportRequests: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.request(`/admin/support/requests/${qs ? `?${qs}` : ''}`);
  },
  adminUpdateSupportRequest: (id, payload) =>
    api.request(`/admin/support/requests/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

// Export config for use in other components
api.config = { baseURL: API_BASE_URL };

export default api;




