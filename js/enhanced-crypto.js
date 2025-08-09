/**
 * Enhanced Crypto Manager for Offline Message Support
 */

export class EnhancedCryptoManager {
    constructor() {
        this.encryptionKey = null;
        this.roomId = null;
        this.currentPassword = null;
        this.sessionId = this.generateSessionId();
    }

    /**
     * Generate deterministic room ID from password using PBKDF2
     * Uses fixed salt for deterministic results
     */
    async generateRoomIdFromPassword(password) {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);
        
        // Fixed salt for deterministic room ID generation
        const fixedSalt = encoder.encode("webrtc_room_salt_v1");
        
        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBytes,
            'PBKDF2',
            false,
            ['deriveBits']
        );

        // Derive 32 bytes using PBKDF2
        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: fixedSalt,
                iterations: 10000, // Lower iterations for room ID (speed)
                hash: 'SHA-256'
            },
            keyMaterial,
            256 // 32 bytes
        );

        // Convert to hex and take first 12 characters
        const hashArray = new Uint8Array(derivedBits);
        const hashHex = Array.from(hashArray)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        
        return hashHex.substring(0, 12);
    }

    /**
     * Derive encryption key from password using PBKDF2
     * Uses room ID as salt for unique keys per room
     */
    async deriveEncryptionKey(password, roomId) {
        const encoder = new TextEncoder();
        
        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Use room ID as salt for encryption key
        const salt = encoder.encode(`encryption_salt_${roomId}`);

        // Derive AES-GCM key
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000, // High iterations for encryption key (security)
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
     * Initialize crypto manager with password
     */
    async initialize(password) {
        // Reset any previous state
        this.destroy();
        
        this.currentPassword = password;
        this.roomId = await this.generateRoomIdFromPassword(password);
        this.encryptionKey = await this.deriveEncryptionKey(password, this.roomId);
        
        console.log('🔐 Crypto initialized - Room ID:', this.roomId);
        return this.roomId;
    }

    /**
     * Encrypt message for storage/transmission
     */
    async encryptMessage(plaintext) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not initialized');
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);

        // Generate random IV
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            this.encryptionKey,
            data
        );

        // Return as base64 for Firebase storage
        return {
            data: this.arrayBufferToBase64(ciphertext),
            iv: this.arrayBufferToBase64(iv),
            timestamp: Date.now()
        };
    }

    /**
     * Decrypt message from storage/transmission
     */
    async decryptMessage(encryptedObj) {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not initialized');
        }

        try {
            const ciphertext = this.base64ToArrayBuffer(encryptedObj.data);
            const iv = this.base64ToArrayBuffer(encryptedObj.iv);

            // Decrypt
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                this.encryptionKey,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            throw new Error('Decryption failed - wrong password or corrupted data');
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        return Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Utility functions
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Clean up sensitive data
     */
    destroy() {
        this.encryptionKey = null;
        this.currentPassword = null;
        console.log('🔒 Crypto manager destroyed');
    }

    // Getters
    getRoomId() { return this.roomId; }
    getSessionId() { return this.sessionId; }
}