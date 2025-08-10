/**
 * WebRTC-based Secret Messages
 * Ephemeral messages that never touch Firebase
 */

export class WebRTCSecrets {
    constructor(webrtc, crypto, signaling = null) {
        this.webrtc = webrtc;
        this.crypto = crypto;
        this.signaling = signaling;
        this.onSecretReceived = null;
        this.secretMessageIds = new Set();
    }

    /**
     * Initialize WebRTC secret handling
     */
    initialize() {
        console.log('🔒 WebRTC Secrets initialized');
    }

    /**
     * Send secret message via WebRTC P2P only
     */
    async sendWebRTCSecret(message) {
        if (!this.webrtc.dataChannel || this.webrtc.dataChannel.readyState !== 'open') {
            throw new Error('WebRTC connection not ready - peer must be online for secret messages');
        }

        try {
            const encrypted = await this.crypto.encryptMessage(message);
            const secretPayload = {
                type: 'webrtc_secret',
                id: this.generateSecretId(),
                data: encrypted.data,
                iv: encrypted.iv,
                timestamp: Date.now(),
                ephemeral: true,
                sender: this.crypto.getSessionId()
            };

            const success = this.webrtc.sendMessage(secretPayload);
            
            if (success) {
                console.log('🔒 Secret message sent via WebRTC P2P');
                return true;
            } else {
                throw new Error('Failed to send secret message via WebRTC');
            }
        } catch (error) {
            console.error('❌ WebRTC secret send error:', error);
            throw error;
        }
    }

    /**
     * Handle incoming WebRTC secret messages
     */
    async handleWebRTCSecret(payload) {
        try {
            // Prevent duplicate processing
            if (this.secretMessageIds.has(payload.id)) {
                console.log('⏭️ Skipping duplicate secret message');
                return;
            }

            // Skip our own messages
            if (payload.sender === this.crypto.getSessionId()) {
                console.log('⏭️ Skipping own secret message');
                return;
            }

            this.secretMessageIds.add(payload.id);

            // Decrypt message
            const decrypted = await this.crypto.decryptMessage({
                data: payload.data,
                iv: payload.iv
            });

            console.log('📨 WebRTC secret message received');

            // Get sender alias if signaling is available
            let senderAlias = 'Unknown';
            if (this.signaling) {
                try {
                    const aliases = await this.signaling.getParticipantAliases();
                    senderAlias = aliases[payload.sender] || 'Unknown';
                } catch (error) {
                    console.warn('⚠️ Could not get sender alias:', error);
                }
            }

            // Notify UI
            if (this.onSecretReceived) {
                this.onSecretReceived({
                    id: payload.id,
                    text: decrypted,
                    timestamp: payload.timestamp,
                    senderAlias: senderAlias,
                    senderId: payload.sender,
                    ephemeral: true
                });
            }

            // Auto-cleanup message ID after some time to prevent memory leak
            setTimeout(() => {
                this.secretMessageIds.delete(payload.id);
            }, 60000); // 1 minute

        } catch (error) {
            console.error('❌ Failed to handle WebRTC secret:', error);
            
            // Still notify UI about undecryptable message
            if (this.onSecretReceived) {
                this.onSecretReceived({
                    id: payload.id || 'unknown',
                    text: '🔒 [Secret message - failed to decrypt]',
                    timestamp: payload.timestamp || Date.now(),
                    ephemeral: true,
                    error: true
                });
            }
        }
    }

    /**
     * Check if WebRTC is ready for secret messages
     */
    isReady() {
        return this.webrtc.dataChannel && this.webrtc.dataChannel.readyState === 'open';
    }

    /**
     * Get connection status for UI
     */
    getConnectionStatus() {
        if (!this.webrtc.dataChannel) {
            return 'no_connection';
        }
        
        switch (this.webrtc.dataChannel.readyState) {
            case 'open':
                return 'ready';
            case 'connecting':
                return 'connecting';
            case 'closing':
            case 'closed':
                return 'disconnected';
            default:
                return 'unknown';
        }
    }

    /**
     * Generate unique secret message ID
     */
    generateSecretId() {
        return `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Clear secret message history (for privacy)
     */
    clearSecretHistory() {
        this.secretMessageIds.clear();
        console.log('🔥 Secret message history cleared');
    }
}