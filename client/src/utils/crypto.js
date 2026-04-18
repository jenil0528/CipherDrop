/**
 * Encryption utilities using Web Crypto API
 * Supports AES-256-GCM encryption and SHA-256 hashing
 */

/**
 * Generate a random AES-256 key
 */
export async function generateAESKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return key;
}

/**
 * Export CryptoKey to base64 string for sharing
 */
export async function exportKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(raw);
}

/**
 * Import base64 string back to CryptoKey
 */
export async function importKey(base64Key) {
  const raw = base64ToArrayBuffer(base64Key);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt file data using AES-256-GCM
 * @param {ArrayBuffer} data - File data to encrypt
 * @param {CryptoKey} key - AES key
 * @returns {{ encrypted: ArrayBuffer, iv: string }}
 */
export async function encryptAES(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return {
    encrypted,
    iv: arrayBufferToBase64(iv.buffer)
  };
}

/**
 * Decrypt file data using AES-256-GCM
 * @param {ArrayBuffer} encryptedData - Encrypted data
 * @param {CryptoKey} key - AES key
 * @param {string} ivBase64 - IV as base64 string
 * @returns {ArrayBuffer} Decrypted data
 */
export async function decryptAES(encryptedData, key, ivBase64) {
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedData
  );
  return decrypted;
}

/**
 * Compute SHA-256 hash of data
 * @param {ArrayBuffer} data
 * @returns {string} Hex hash string
 */
export async function computeSHA256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify SHA-256 hash
 */
export async function verifySHA256(data, expectedHash) {
  const actualHash = await computeSHA256(data);
  return actualHash === expectedHash;
}

/**
 * Full encryption flow for a file
 * @param {File} file
 * @param {'AES'|'SHA'} encryptionType
 */
export async function encryptFile(file, encryptionType) {
  const data = await file.arrayBuffer();
  const key = await generateAESKey();
  const keyBase64 = await exportKey(key);

  const { encrypted, iv } = await encryptAES(data, key);
  
  let sha256Hash = null;
  if (encryptionType === 'SHA') {
    sha256Hash = await computeSHA256(data);
  }

  return {
    encryptedBlob: new Blob([encrypted]),
    keyBase64,
    iv,
    sha256Hash,
    originalName: file.name,
    mimeType: file.type,
    originalSize: file.size
  };
}

/**
 * Full decryption flow
 */
export async function decryptFile(encryptedData, keyBase64, iv, sha256Hash = null) {
  const key = await importKey(keyBase64);
  const decrypted = await decryptAES(encryptedData, key, iv);

  if (sha256Hash) {
    const isValid = await verifySHA256(decrypted, sha256Hash);
    if (!isValid) {
      throw new Error('SHA-256 integrity check failed! File may have been tampered with.');
    }
  }

  return decrypted;
}

// ---- Utility functions ----

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Format bytes to human readable
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
