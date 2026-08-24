// Telebirr H5 (InApp) payment helper.
//
// Flow (must run inside the Telebirr SuperApp webview):
//   1. POST /wallet/telebirr/auth/ with access_token -> { user, token }
//   2. POST /wallet/telebirr/initiate/  -> { raw_request, merch_order_id }
//   3. window.consumerapp.evaluate(js_fun_start_pay) with raw_request
//   4. SuperApp invokes our handleinitDataCallback after pay/cancel
//   5. fallback: GET /wallet/telebirr/query/?merch_order_id=... to confirm
//
// Usage:
//   import telebirrH5 from './services/TelebirrH5Service';
//   const r = await telebirrH5.purchasePackage(packageId);
//   if (r.success) { ... coins credited / pending ... }

import api from '../api';

// Client logger - sends logs to server for production visibility
function logToServer(level, message, context = {}) {
  try {
    api.request('/client-log/', {
      method: 'POST',
      body: JSON.stringify({ level, message, context }),
    }).catch(() => {
      // Silently fail if logging fails
    });
  } catch (e) {
    // Silently fail
  }
}

// True only when the page is opened inside the Telebirr SuperApp webview.
export function isInSuperApp() {
  return typeof window !== 'undefined' &&
    window.consumerapp !== undefined &&
    window.consumerapp !== null &&
    typeof window.consumerapp.evaluate === 'function';
}

// Get the access_token from the SuperApp.
// The SuperApp provides this via a function call - we need to call it.
export function getAccessToken() {
  logToServer('info', '[TelebirrH5Service] getAccessToken() called');
  console.log('[TelebirrH5Service] getAccessToken() called');
  return new Promise((resolve, reject) => {
    if (!isInSuperApp()) {
      const msg = 'Not in SuperApp, cannot get access token';
      logToServer('error', `[TelebirrH5Service] ${msg}`);
      console.error('[TelebirrH5Service]', msg);
      reject(new Error('NOT_IN_SUPERAPP'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      const msg = 'Access token request timed out';
      logToServer('error', `[TelebirrH5Service] ${msg}`);
      console.error('[TelebirrH5Service]', msg);
      reject(new Error('ACCESS_TOKEN_TIMEOUT'));
    }, 30000); // 30 second timeout

    const previous = window.handleAccessTokenCallback;
    function cleanup() {
      clearTimeout(timer);
      window.handleAccessTokenCallback = previous;
    }

    // The SuperApp calls this with the access_token directly
    window.handleAccessTokenCallback = function (accessToken) {
      logToServer('info', `[TelebirrH5Service] Access token callback received. Token: ${accessToken ? accessToken.substring(0, 20) + '...' : 'None'}`);
      console.log('[TelebirrH5Service] Access token callback received:', accessToken);

      if (settled) return;
      settled = true;
      cleanup();

      if (!accessToken) {
        const msg = 'No access token returned from SuperApp';
        logToServer('error', `[TelebirrH5Service] ${msg}`);
        console.error('[TelebirrH5Service]', msg);
        reject(new Error('NO_ACCESS_TOKEN'));
        return;
      }

      const tokenPreview = accessToken ? `${accessToken.substring(0, 20)}...` : 'None';
      logToServer('info', `[TelebirrH5Service] Extracted access token: ${tokenPreview}`);
      console.log('[TelebirrH5Service] Extracted access token:', tokenPreview);
      resolve(accessToken);
    };

    const payload = JSON.stringify({
      functionName: 'js_fun_h5GetAccessToken',
      params: {
        appid: '1639183101465603',
        functionCallBackName: 'handleAccessTokenCallback',
      },
    });

    logToServer('info', `[TelebirrH5Service] Calling SuperApp js_fun_h5GetAccessToken. Payload: ${payload}`);
    console.log('[TelebirrH5Service] Calling SuperApp js_fun_h5GetAccessToken. Payload:', payload);
    try {
      window.consumerapp.evaluate(payload);
    } catch (err) {
      logToServer('error', '[TelebirrH5Service] Error calling SuperApp evaluate', { error: err.message });
      console.error('[TelebirrH5Service] Error calling SuperApp evaluate:', err);
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
  });
}

// Auto-login using Telebirr SuperApp access token.
// Returns { success, user, token, error }
export async function autoLogin() {
  logToServer('info', '[TelebirrH5Service] autoLogin() called');
  console.log('[TelebirrH5Service] autoLogin() called');
  if (!isInSuperApp()) {
    const msg = 'Not in SuperApp, aborting auto-login';
    logToServer('info', `[TelebirrH5Service] ${msg}`);
    console.log('[TelebirrH5Service]', msg);
    return { success: false, error: 'NOT_IN_SUPERAPP' };
  }

  try {
    logToServer('info', '[TelebirrH5Service] Getting access token from SuperApp...');
    console.log('[TelebirrH5Service] Getting access token from SuperApp...');
    const accessToken = await getAccessToken();
    const tokenPreview = accessToken ? `${accessToken.substring(0, 20)}...` : 'None';
    logToServer('info', `[TelebirrH5Service] Access token received: ${tokenPreview}`);
    console.log('[TelebirrH5Service] Access token received:', tokenPreview);

    if (!accessToken) {
      const msg = 'No access token returned from SuperApp';
      logToServer('error', `[TelebirrH5Service] ${msg}`);
      console.error('[TelebirrH5Service]', msg);
      return { success: false, error: 'No access token returned from SuperApp' };
    }

    logToServer('info', '[TelebirrH5Service] Calling backend /wallet/telebirr/auth/...');
    console.log('[TelebirrH5Service] Calling backend /wallet/telebirr/auth/...');
    const response = await api.request('/wallet/telebirr/auth/', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken }),
    });
    logToServer('info', '[TelebirrH5Service] Backend response', { response });
    console.log('[TelebirrH5Service] Backend response:', response);

    return {
      success: true,
      user: response.user,
      token: response.token,
      telebirr_info: response.telebirr_info,
    };
  } catch (err) {
    logToServer('info', '[TelebirrH5Service] NEW CODE RUNNING - Auto-login error catch block');
    logToServer('info', '[TelebirrH5Service] err.message', { message: err.message });
    logToServer('info', '[TelebirrH5Service] err.response exists', { hasResponse: !!err.response });
    logToServer('info', '[TelebirrH5Service] err.response.data exists', { hasData: !!(err.response && err.response.data) });
    
    // Check if the error response contains requires_subscription flag
    let requiresSubscription = false;
    let phoneNumber = null;
    
    // Try to extract from err.response.data first
    if (err.response && err.response.data) {
      requiresSubscription = err.response.data.requires_subscription || false;
      phoneNumber = err.response.data.phone_number || null;
      logToServer('info', '[TelebirrH5Service] Extracted from err.response.data', { requiresSubscription, phoneNumber });
    } 
    // If not in response.data, try parsing from err.message (it might be a JSON string)
    else if (err.message) {
      try {
        const parsed = JSON.parse(err.message);
        requiresSubscription = parsed.requires_subscription || false;
        phoneNumber = parsed.phone_number || null;
        logToServer('info', '[TelebirrH5Service] Extracted from err.message JSON', { requiresSubscription, phoneNumber });
      } catch (e) {
        logToServer('info', '[TelebirrH5Service] err.message is not JSON', { error: e.message });
      }
    }
    
    logToServer('error', '[TelebirrH5Service] Auto-login error', { error: err.message });
    logToServer('info', '[TelebirrH5Service] Final extracted values', { requiresSubscription, phoneNumber });
    
    return { 
      success: false, 
      error: err?.message || 'Auto-login failed',
      requiresSubscription: requiresSubscription,
      phoneNumber: phoneNumber
    };
  }
}

// Calls the SuperApp's js_fun_start_pay and resolves when the SuperApp fires
// the handleinitDataCallback. Times out if the callback never arrives.
function startPay(rawRequest, { timeoutMs = 5 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!rawRequest) {
      reject(new Error('Missing raw_request'));
      return;
    }
    if (!isInSuperApp()) {
      reject(new Error('NOT_IN_SUPERAPP'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('PAY_TIMEOUT'));
    }, timeoutMs);

    const previous = window.handleinitDataCallback;
    function cleanup() {
      clearTimeout(timer);
      window.handleinitDataCallback = previous;
    }

    // The SuperApp calls this after the user completes or cancels payment.
    window.handleinitDataCallback = function (result) {
      logToServer('info', '[TelebirrH5Service] <<< js_fun_start_pay callback (handleinitDataCallback)', { result });
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const payload = JSON.stringify({
      functionName: 'js_fun_start_pay',
      params: {
        rawRequest: String(rawRequest).trim(),
        functionCallBackName: 'handleinitDataCallback',
      },
    });

    try {
      logToServer('info', '[TelebirrH5Service] >>> Calling SuperApp js_fun_start_pay', { payload });
      window.consumerapp.evaluate(payload);
    } catch (err) {
      logToServer('error', '[TelebirrH5Service] js_fun_start_pay evaluate error', { error: err?.message });
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
  });
}

// Confirm an order's final status with the backend (queryOrder fallback).
async function confirmOrder(merchOrderId) {
  return api.request(
    `/wallet/telebirr/query/?merch_order_id=${encodeURIComponent(merchOrderId)}`
  );
}

// End-to-end purchase for a coin package.
// Returns { success, pending, coins_added, merch_order_id, error }.
async function purchasePackage(packageId) {
  if (!isInSuperApp()) {
    return { success: false, error: 'NOT_IN_SUPERAPP' };
  }

  let order;
  try {
    order = await api.request('/wallet/telebirr/initiate/', {
      method: 'POST',
      body: JSON.stringify({ package_id: packageId }),
    });
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to create order' };
  }

  if (!order || !order.success || !order.raw_request) {
    return { success: false, error: order?.error || 'Failed to create order' };
  }

  const merchOrderId = order.merch_order_id;

  try {
    await startPay(order.raw_request);
  } catch (err) {
    return { success: false, merch_order_id: merchOrderId, error: err?.message };
  }

  // Payment counter closed - confirm the real status with the backend.
  try {
    const confirmed = await confirmOrder(merchOrderId);
    if (confirmed?.is_paid) {
      return {
        success: true,
        pending: false,
        coins_added: confirmed.coins_added || 0,
        merch_order_id: merchOrderId,
      };
    }
    // Not yet marked paid - async notify may still arrive shortly.
    return { success: true, pending: true, merch_order_id: merchOrderId };
  } catch (err) {
    return { success: true, pending: true, merch_order_id: merchOrderId };
  }
}

// End-to-end purchase for a one-time subscription (mimics coin purchase flow).
// Returns { success, pending, subscription_id, end_date, merch_order_id, error }.
export async function purchaseSubscription(planType, phoneNumber = null) {
  logToServer('info', '[TelebirrH5Service] ========== ONE-TIME SUBSCRIPTION START ==========');
  logToServer('info', '[TelebirrH5Service] purchaseSubscription() called', { planType, phoneNumber });

  if (!isInSuperApp()) {
    const msg = 'Not in SuperApp, cannot purchase subscription';
    logToServer('error', `[TelebirrH5Service] ${msg}`);
    return { success: false, error: 'NOT_IN_SUPERAPP' };
  }

  // Check auth token - for new users, we'll pass phone number instead
  const currentToken = api.getToken();
  logToServer('info', '[TelebirrH5Service] Current auth token check', { hasToken: !!currentToken, tokenPreview: currentToken ? currentToken.substring(0, 10) + '...' : 'None', phoneNumber });

  let order;
  try {
    const requestBody = { plan_type: planType };
    // For unauthenticated users (new users), pass phone number
    if (!currentToken && phoneNumber) {
      requestBody.phone_number = phoneNumber;
      logToServer('info', '[TelebirrH5Service] Adding phone_number to request for unauthenticated user', { phoneNumber });
    }

    logToServer('info', '[TelebirrH5Service] >>> REQUEST POST /subscription/telebirr/one-time/initiate/', { planType, hasPhone: !!phoneNumber });
    order = await api.request('/subscription/telebirr/one-time/initiate/', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    logToServer('info', '[TelebirrH5Service] <<< RESPONSE /subscription/telebirr/one-time/initiate/', { order });
  } catch (err) {
    logToServer('error', '[TelebirrH5Service] Subscription initiate request failed', { error: err?.message, errorResponse: err?.response?.data });
    return { success: false, error: err?.response?.data?.error || err?.message || 'Failed to create subscription order' };
  }

  if (!order || !order.success || !order.raw_request) {
    logToServer('error', '[TelebirrH5Service] Subscription initiate returned no raw_request', { order });
    return { success: false, error: order?.error || 'Failed to create subscription order' };
  }

  const merchOrderId = order.merch_order_id;
  logToServer('info', '[TelebirrH5Service] Starting payment with SuperApp', { merchOrderId });

  try {
    await startPay(order.raw_request);
  } catch (err) {
    logToServer('error', '[TelebirrH5Service] Payment failed', { error: err?.message });
    return { success: false, merch_order_id: merchOrderId, error: err?.message };
  }

  logToServer('info', '[TelebirrH5Service] Payment completed, querying subscription status');

  // Payment counter closed - confirm the real status with the backend.
  try {
    const confirmed = await api.request(
      `/subscription/telebirr/one-time/query/?merch_order_id=${encodeURIComponent(merchOrderId)}`
    );
    logToServer('info', '[TelebirrH5Service] Subscription query response', { confirmed });

    if (confirmed?.status === 'active') {
      return {
        success: true,
        pending: false,
        subscription_id: confirmed.subscription_id,
        end_date: confirmed.end_date,
        plan_type: confirmed.plan_type,
        merch_order_id: merchOrderId,
      };
    }
    // Not yet marked active - async notify may still arrive shortly.
    return { success: true, pending: true, merch_order_id: merchOrderId };
  } catch (err) {
    logToServer('error', '[TelebirrH5Service] Subscription query failed', { error: err?.message });
    return { success: true, pending: true, merch_order_id: merchOrderId };
  }
}

// COMMENTED OUT: Sign mandate contract for Telebirr subscription payment (replaced by one-time flow)
// Uses js_fun_execute for T&C acceptance, then preorder + js_fun_start_pay for payment.
// Returns { success, mct_contract_no, plan_type, error }
// export async function signContract(planType, amount, phoneNumber) {
//   logToServer('info', '[TelebirrH5Service] ========== SIGN CONTRACT START (JS_FUN_EXECUTE + PREORDER FLOW) ==========');
//   logToServer('info', '[TelebirrH5Service] signContract() called', { planType, phoneNumber });
//
//   if (!isInSuperApp()) {
//     const msg = 'Not in SuperApp, cannot sign mandate';
//     logToServer('error', `[TelebirrH5Service] ${msg}`);
//     return { success: false, error: 'NOT_IN_SUPERAPP' };
//   }
//
//   logToServer('info', '[TelebirrH5Service] SuperApp detected, calling preorder first to get raw_request');
//
//   // Step 1: Call preorder first to get raw_request
//   const mctShortCode = '53599';
//   const appId = '1639183101465603';
//   const mandateTemplateId = planType === 'daily' ? '208003' : planType === 'weekly' ? '208001' : '207001';
//   const mctContractNo = generateRandomContractNo();
//
//   logToServer('info', '[TelebirrH5Service] ========== MCT CONTRACT NUMBER GENERATED ==========', { 
//     mctContractNo, 
//     planType, 
//     phoneNumber,
//     timestamp: new Date().toISOString()
//   });
//
//   // Clear any existing pending mandate before creating a new one to prevent stale mandates
//   try {
//     const existing = localStorage.getItem(PENDING_MANDATE_KEY);
//     if (existing) {
//       localStorage.removeItem(PENDING_MANDATE_KEY);
//       logToServer('info', '[TelebirrH5Service] Cleared existing pending mandate before creating new one');
//     }
//   } catch (e) {
//     logToServer('warning', '[TelebirrH5Service] Failed to clear existing pending mandate', { error: e?.message });
//   }
//
//   // Persist pending mandate to localStorage BEFORE calling preorder.
//   // The SuperApp reloads the H5 page when returning from the native mandate page,
//   // which destroys the in-memory callback. This allows reconciliation on page reload.
//   const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
//   const platformInfo = /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : 'Android/Other';
//   logToServer('info', '[TelebirrH5Service] Platform detected', { platform: platformInfo, ua: ua.substring(0, 100) });
//
//   try {
//     const pendingMandate = {
//       mct_contract_no: mctContractNo,
//       plan_type: planType,
//       phone_number: phoneNumber,
//       ts: Date.now(),
//     };
//     localStorage.setItem(PENDING_MANDATE_KEY, JSON.stringify(pendingMandate));
//     // Verify it was actually saved
//     const verify = localStorage.getItem(PENDING_MANDATE_KEY);
//     logToServer('info', '[TelebirrH5Service] Persisted pending mandate to localStorage', { pendingMandate, verified: !!verify });
//   } catch (e) {
//     logToServer('error', '[TelebirrH5Service] Failed to persist pending mandate to localStorage', { error: e?.message });
//   }
//
//   // Call preorder to get raw_request
//   let order;
//   try {
//     const preorderReqBody = { plan_type: planType, mct_contract_no: mctContractNo, phone_number: phoneNumber };
//     logToServer('info', '[TelebirrH5Service] >>> REQUEST POST /subscription/telebirr/mandate/preorder/', { body: preorderReqBody });
//     order = await api.request('/subscription/telebirr/mandate/preorder/', {
//       method: 'POST',
//       body: JSON.stringify(preorderReqBody),
//     });
//     logToServer('info', '[TelebirrH5Service] <<< RESPONSE /subscription/telebirr/mandate/preorder/', { order });
//   } catch (err) {
//     logToServer('error', '[TelebirrH5Service] Mandate preorder request failed', { error: err?.message, data: err?.data });
//     return { success: false, error: err?.message || 'Failed to create mandate preorder' };
//   }
//
//   logToServer('info', '[TelebirrH5Service] Checking preorder response', { hasOrder: !!order, hasSuccess: order?.success, hasRawRequest: !!order?.raw_request });
//
//   if (!order || !order.success || !order.raw_request) {
//     logToServer('error', '[TelebirrH5Service] Mandate preorder returned no raw_request', { order });
//     return { success: false, error: order?.error || 'Failed to create mandate preorder' };
//   }
//
//   const backendMctContractNo = order.mct_contract_no;
//   const rawRequest = order.raw_request;
//   logToServer('info', '[TelebirrH5Service] ========== BACKEND PREORDER RESPONSE ==========', {
//     mct_contract_no: backendMctContractNo,
//     prepay_id: order.prepay_id,
//     merch_order_id: order.merch_order_id,
//     raw_request_length: rawRequest?.length,
//     timestamp: new Date().toISOString()
//   });
//
//   // Update localStorage with the backend's returned mct_contract_no
//   // Telebirr may return a different contract number than what we generated
//   try {
//     const pendingMandate = {
//       mct_contract_no: backendMctContractNo,
//       plan_type: planType,
//       phone_number: phoneNumber,
//       ts: Date.now(),
//     };
//     localStorage.setItem(PENDING_MANDATE_KEY, JSON.stringify(pendingMandate));
//     logToServer('info', '[TelebirrH5Service] Updated localStorage with backend mct_contract_no', { backendMctContractNo });
//   } catch (e) {
//     logToServer('error', '[TelebirrH5Service] Failed to update localStorage with backend mct_contract_no', { error: e?.message });
//   }
//
//   // Step 2: Call js_fun_execute with raw_request in executeUrl
//   logToServer('info', '[TelebirrH5Service] About to call js_fun_execute with raw_request', { rawRequestLength: rawRequest?.length });
//
//   const executeResult = await new Promise((resolve) => {
//     let settled = false;
//     const timer = setTimeout(() => {
//       if (settled) return;
//       settled = true;
//       const previous = window.handleinitDataCallback;
//       window.handleinitDataCallback = previous;
//       logToServer('error', '[TelebirrH5Service] js_fun_execute timed out');
//       resolve({ success: false, error: 'MANDATE_TIMEOUT' });
//     }, 5 * 60 * 1000);
//
//     const previous = window.handleinitDataCallback;
//     window.handleinitDataCallback = function (mandateResponse) {
//       logToServer('info', '[TelebirrH5Service] js_fun_execute callback received', { mandateResponse });
//       
//       if (settled) return;
//       settled = true;
//       clearTimeout(timer);
//       window.handleinitDataCallback = previous;
//
//       let parsed = mandateResponse;
//       if (typeof mandateResponse === 'string') {
//         try { parsed = JSON.parse(mandateResponse); } catch (e) { parsed = { result: mandateResponse }; }
//       }
//       parsed = parsed || {};
//
//       const resultStr = String(parsed.result || parsed.status || '').toLowerCase();
//       const errMsg = String(parsed.msg || parsed.message || parsed.error || '').toLowerCase();
//       const errCode = String(parsed.errorCode || parsed.error_code || '').trim();
//       const isCancelled = resultStr.includes('cancel') || errMsg.includes('cancel');
//       const isExplicitFail = resultStr === 'fail' || resultStr === 'failed' || resultStr === 'error';
//       const isAlreadyExists = errCode === '4' || errMsg.includes('already exist');
//
//       if (isCancelled) {
//         logToServer('info', '[TelebirrH5Service] Mandate signing cancelled by user', { parsed });
//         resolve({ success: false, error: 'PAYMENT_CANCELLED' });
//         return;
//       }
//       if (isAlreadyExists) {
//         logToServer('info', '[TelebirrH5Service] Mandate already exists for payer - treating as success (backend will find it)', { parsed });
//         resolve({ success: true, response: parsed, alreadyExists: true });
//         return;
//       }
//       if (isExplicitFail) {
//         logToServer('error', '[TelebirrH5Service] Mandate signing failed', { parsed });
//         resolve({ success: false, error: 'PAYMENT_FAILED', response: parsed });
//         return;
//       }
//
//       logToServer('info', '[TelebirrH5Service] js_fun_execute completed successfully');
//       resolve({ success: true, response: parsed });
//     };
//
//     const executeUrl = `merchant://10000000016?mctContractNo=${encodeURIComponent(backendMctContractNo)}&tradeType=InApp&mctShortCode=${encodeURIComponent(mctShortCode)}&mandateTemplateId=${mandateTemplateId}&thirdAppId=${encodeURIComponent(appId)}&rawRequest=${encodeURIComponent(rawRequest)}`;
//     
//     const obj = JSON.stringify({
//       functionName: 'js_fun_execute',
//       params: {
//         businessType: 'Mandate',
//         execute: executeUrl,
//         functionCallBackName: 'handleinitDataCallback',
//       },
//     });
//
//     logToServer('info', '[TelebirrH5Service] Calling SuperApp js_fun_execute', { obj, executeUrl });
//
//     try {
//       logToServer('info', '[TelebirrH5Service] window.consumerapp.evaluate called');
//       window.consumerapp.evaluate(obj);
//       logToServer('info', '[TelebirrH5Service] window.consumerapp.evaluate returned (waiting for callback)');
//     } catch (err) {
//       logToServer('error', '[TelebirrH5Service] Error calling SuperApp evaluate', { error: err.message });
//       if (settled) return;
//       settled = true;
//       clearTimeout(timer);
//       window.handleinitDataCallback = previous;
//       resolve({ success: false, error: err?.message || 'EXECUTE_FAILED' });
//     }
//   });
//
//   logToServer('info', '[TelebirrH5Service] js_fun_execute Promise resolved', { success: executeResult.success, error: executeResult.error });
//
//   if (!executeResult.success) {
//     logToServer('error', '[TelebirrH5Service] js_fun_execute failed, returning error', { error: executeResult.error });
//     return executeResult;
//   }
//
//   logToServer('info', '[TelebirrH5Service] js_fun_execute completed successfully, payment handled in executeUrl');
//
//   // Payment is now handled by js_fun_execute with rawRequest in executeUrl
//   // Skip startPay to avoid double payment
//   logToServer('info', '[TelebirrH5Service] Skipping startPay - payment handled in js_fun_execute');
//
//   // Payment flow completed. The backend (mandate/save/) will query Telebirr
//   // for the mandate_contract_id using mct_contract_no.
//   logToServer('info', '[TelebirrH5Service] ========== MANDATE PAYMENT COMPLETED ==========');
//   return {
//     success: true,
//     mct_contract_no: backendMctContractNo,
//     plan_type: planType,
//   };
// }

// Generate 32-digit random contract number
function generateRandomContractNo() {
  let randomNum = '';
  for (let i = 0; i < 32; i++) {
    randomNum += Math.floor(Math.random() * 10);
  }
  return randomNum;
}

// Get mandate template ID based on plan type
// Mandate template IDs from Telebirr (production)
function getMandateTemplateId(planType) {
  const templates = {
    'daily': '208003',
    'weekly': '208001',
    'monthly': '207001',
  };
  return templates[planType];
}

// Storage key for the pending mandate. The SuperApp reloads the H5 page when
// returning from the native mandate page, which destroys any in-memory JS
// callback. We persist the pending mandate here BEFORE calling js_fun_execute
// so the page can reconcile it (call /mandate/save/) after the reload.
export const PENDING_MANDATE_KEY = 'telebirr_pending_mandate';

// Read the persisted pending mandate (if any). Returns null when absent or stale.
export function getPendingMandate(maxAgeMs = 15 * 60 * 1000) {
  try {
    const raw = localStorage.getItem(PENDING_MANDATE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.mct_contract_no) return null;
    if (data.ts && Date.now() - data.ts > maxAgeMs) {
      localStorage.removeItem(PENDING_MANDATE_KEY);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

// Clear the persisted pending mandate.
export function clearPendingMandate() {
  try { localStorage.removeItem(PENDING_MANDATE_KEY); } catch (e) {}
}

const telebirrH5 = {
  isInSuperApp, getAccessToken, autoLogin, startPay, confirmOrder, purchasePackage,
  purchaseSubscription, getPendingMandate, clearPendingMandate, PENDING_MANDATE_KEY,
  // COMMENTED OUT: signContract (replaced by one-time flow)
};
export default telebirrH5;
