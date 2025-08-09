/**
 * Crypto utilities for secure messaging
 * All encryption happens client-side using Web Crypto API
 */

export class CryptoManager {
    constructor() {
        this.encryptionKey = null;
        this.currentPassword = null;
    }

    /**
     * Generate a room ID from password using SHA-256
     * @param {string} password - The password to hash
     * @returns {Promise<string>} - Short room ID (first 12 chars of hash)
     */
    async generateRoomIdFromPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = new Uint8Array(hashBuffer);
        
        // Convert to hex and take first 12 characters for room ID
        const hashHex = Array.from(hashArray)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        
        return hashHex.substring(0, 12);
    }

    /**
     * Derive encryption key from password using PBKDF2
     * @param {string} password - The password
     * @param {string} salt - Salt (room ID used as salt)
     * @returns {Promise<CryptoKey>} - AES-GCM key
     */
    async deriveKeyFromPassword(password, salt) {
        const encoder = new TextEncoder();
        
        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive AES-GCM key using PBKDF2
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        return key;
    }

    /**
     * Set the encryption key for this session
     * @param {string} password - The password
     * @param {string} roomId - Room ID (used as salt)
     */
    async setEncryptionKey(password, roomId) {
        this.encryptionKey = await this.deriveKeyFromPassword(password, roomId);
        this.currentPassword = password;
        console.log('🔐 Encryption key derived from password');
    }

    /**
     * Encrypt a message using AES-GCM
     * @param {string} message - Plain text message
     * @returns {Promise<Object>} - Encrypted object with iv and ciphertext
     */
    async encryptMessage(message) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set');
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(message);

        // Generate random IV
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt the message
        const encryptedBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            this.encryptionKey,
            data
        );

        // Convert to base64 for transmission
        const encryptedArray = new Uint8Array(encryptedBuffer);
        const ciphertext = btoa(String.fromCharCode(...encryptedArray));
        const ivBase64 = btoa(String.fromCharCode(...iv));

        return {
            iv: ivBase64,
            ciphertext: ciphertext,
            timestamp: Date.now()
        };
    }

    /**
     * Decrypt a message using AES-GCM
     * @param {Object} encryptedData - Object with iv and ciphertext
     * @returns {Promise<string>} - Decrypted plain text message
     */
    async decryptMessage(encryptedData) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set');
        }

        try {
            // Convert from base64
            const iv = new Uint8Array(atob(encryptedData.iv).split('').map(c => c.charCodeAt(0)));
            const ciphertext = new Uint8Array(atob(encryptedData.ciphertext).split('').map(c => c.charCodeAt(0)));

            // Decrypt the message
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                this.encryptionKey,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);
        } catch (error) {
            throw new Error('Failed to decrypt message - wrong password or corrupted data');
        }
    }

    /**
     * Generate a secure random session ID
     * @returns {string} - Random session ID
     */
    generateSessionId() {
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        return Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Clear encryption key from memory
     */
    clearKeys() {
        this.encryptionKey = null;
        this.currentPassword = null;
        console.log('🔒 Encryption keys cleared from memory');
    }

    /**
     * Verify if password is correct by testing decryption
     * @param {string} password - Password to verify
     * @param {string} roomId - Room ID
     * @param {Object} testData - Encrypted test data
     * @returns {Promise<boolean>} - True if password is correct
     */
    async verifyPassword(password, roomId, testData) {
        try {
            const tempKey = await this.deriveKeyFromPassword(password, roomId);
            const originalKey = this.encryptionKey;
            this.encryptionKey = tempKey;
            
            await this.decryptMessage(testData);
            this.encryptionKey = originalKey;
            return true;
        } catch (error) {
            return false;
        }
    }
}