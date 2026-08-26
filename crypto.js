import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

const SERVER_PUBLIC_KEY_URL = '/crypto/public-key/';
const CLIENT_KEYPAIR_STORAGE_KEY = 'e2e_client_keypair';

let _serverPublicKey = null;
let _clientKeypair = null;
let _initialized = false;
let _initPromise = null;

function b64Encode(bytes) {
  return naclUtil.encodeBase64(bytes);
}

function b64Decode(str) {
  return naclUtil.decodeBase64(str);
}

function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = crypto.subtle.digest('SHA-256', bytes);
  return hashBuffer.then((buf) => {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
}

function generateKeypair() {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: b64Encode(keypair.publicKey),
    secretKey: b64Encode(keypair.secretKey),
  };
}

function saveKeypair(keypair) {
  try {
    localStorage.setItem(
      CLIENT_KEYPAIR_STORAGE_KEY,
      JSON.stringify(keypair)
    );
  } catch (e) {
    console.error('[E2E] Failed to save keypair:', e);
  }
}

function loadKeypair() {
  try {
    const raw = localStorage.getItem(CLIENT_KEYPAIR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.publicKey && parsed.secretKey) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function fetchServerPublicKey(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}${SERVER_PUBLIC_KEY_URL}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch server public key: ${response.status}`);
  }
  const data = await response.json();
  if (!data.publicKey) {
    throw new Error('Server public key response missing publicKey field');
  }
  return data.publicKey;
}

export async function initCrypto(apiBaseUrl) {
  if (_initialized) return;

  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      _clientKeypair = loadKeypair();
      if (!_clientKeypair) {
        _clientKeypair = generateKeypair();
        saveKeypair(_clientKeypair);
      }

      _serverPublicKey = await fetchServerPublicKey(apiBaseUrl);

      _initialized = true;
      console.log('[E2E] Crypto initialized successfully');
    } catch (e) {
      console.error('[E2E] Failed to initialize crypto:', e);
      _initPromise = null;
      throw e;
    }
  })();

  return _initPromise;
}

export function getClientPublicKey() {
  if (!_clientKeypair) return null;
  return _clientKeypair.publicKey;
}

export function isCryptoReady() {
  return _initialized && _serverPublicKey && _clientKeypair;
}

export async function waitForCrypto() {
  if (_initialized) return true;
  if (_initPromise) {
    try { await _initPromise; } catch { /* failed */ }
  }
  return _initialized;
}

export async function encryptPayload(data) {
  if (!isCryptoReady()) {
    throw new Error('Crypto not initialized');
  }

  const plaintext = JSON.stringify(data);
  const checksum = await sha256Hex(plaintext);

  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plaintextBytes = naclUtil.decodeUTF8(plaintext);
  const serverPubKeyBytes = b64Decode(_serverPublicKey);
  const clientSecretKeyBytes = b64Decode(_clientKeypair.secretKey);

  const ciphertext = nacl.box(
    plaintextBytes,
    nonce,
    serverPubKeyBytes,
    clientSecretKeyBytes
  );

  return {
    encrypted: b64Encode(ciphertext),
    nonce: b64Encode(nonce),
    checksum: checksum,
  };
}

export async function decryptPayload(envelope) {
  if (!isCryptoReady()) {
    throw new Error('Crypto not initialized');
  }

  if (!envelope || !envelope.encrypted || !envelope.nonce || !envelope.checksum) {
    throw new Error('Invalid encrypted envelope');
  }

  const ciphertextBytes = b64Decode(envelope.encrypted);
  const nonceBytes = b64Decode(envelope.nonce);
  const serverPubKeyBytes = b64Decode(_serverPublicKey);
  const clientSecretKeyBytes = b64Decode(_clientKeypair.secretKey);

  const plaintextBytes = nacl.box.open(
    ciphertextBytes,
    nonceBytes,
    serverPubKeyBytes,
    clientSecretKeyBytes
  );

  if (!plaintextBytes) {
    throw new Error('Decryption failed — box authentication failed');
  }

  const plaintext = naclUtil.encodeUTF8(plaintextBytes);

  const expectedChecksum = await sha256Hex(plaintext);
  if (expectedChecksum !== envelope.checksum) {
    throw new Error('Checksum mismatch — payload may be corrupted');
  }

  return JSON.parse(plaintext);
}

export function resetCrypto() {
  _serverPublicKey = null;
  _clientKeypair = null;
  _initialized = false;
  _initPromise = null;
  localStorage.removeItem(CLIENT_KEYPAIR_STORAGE_KEY);
}
