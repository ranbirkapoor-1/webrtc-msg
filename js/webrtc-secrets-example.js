/**
 * Example: WebRTC-based Secret Messages
 * These disappear immediately and never touch Firebase
 */

class WebRTCSecretMessages {
    constructor(webrtc, crypto) {
        this.webrtc = webrtc;
        this.crypto = crypto;
        this.secretMessages = new Map(); // In-memory only
    }

    /**
     * Send secret message via WebRTC only
     * Falls back to "not delivered" if peer offline
     */
    async sendWebRTCSecret(message) {
        if (!this.webrtc.isConnected) {
            throw new Error('Cannot send secret - peer not connected');
        }

        const encrypted = await this.crypto.encryptMessage(message);
        const secretPayload = {
            type: 'webrtc_secret',
            id: `secret_${Date.now()}`,
            data: encrypted.data,
            iv: encrypted.iv,
            timestamp: Date.now(),
            ephemeral: true // Flag for auto-delete
        };

        const success = this.webrtc.sendMessage(secretPayload);
        
        if (success) {
            console.log('🔒 Secret sent via WebRTC P2P');
            return true;
        } else {
            throw new Error('Failed to send secret message');
        }
    }

    /**
     * Handle incoming WebRTC secret messages
     */
    async handleWebRTCSecret(payload) {
        try {
            const decrypted = await this.crypto.decryptMessage({
                data: payload.data,
                iv: payload.iv
            });

            // Display with auto-delete timer
            this.displayEphemeralSecret(decrypted, payload.timestamp);
            
            // Auto-delete from memory after display
            setTimeout(() => {
                this.secretMessages.delete(payload.id);
            }, 10000); // 10 seconds

        } catch (error) {
            console.error('Failed to decrypt WebRTC secret:', error);
        }
    }

    /**
     * Display secret that auto-deletes from UI
     */
    displayEphemeralSecret(message, timestamp) {
        const messageElement = document.createElement('div');
        messageElement.className = 'ephemeral-secret';
        messageElement.innerHTML = `
            <div class="secret-content">🔥 ${message}</div>
            <div class="secret-timer">Auto-deleting in <span id="countdown">10</span>s</div>
        `;

        document.getElementById('secretMessagesList').appendChild(messageElement);

        // Countdown timer
        let countdown = 10;
        const timer = setInterval(() => {
            countdown--;
            const countdownEl = messageElement.querySelector('#countdown');
            if (countdownEl) {
                countdownEl.textContent = countdown;
            }

            if (countdown <= 0) {
                clearInterval(timer);
                messageElement.remove(); // Auto-delete from UI
                console.log('🔥 Secret message auto-deleted');
            }
        }, 1000);
    }
}

// Usage in main app:
class EnhancedApp {
    setupSecretHandling() {
        this.webrtcSecrets = new WebRTCSecretMessages(this.webrtc, this.crypto);

        // Handle incoming WebRTC messages
        this.webrtc.onMessageReceived = async (data) => {
            if (data.type === 'webrtc_secret') {
                await this.webrtcSecrets.handleWebRTCSecret(data);
            } else if (data.type === 'encrypted_chat') {
                // Handle normal messages
                await this.handleNormalMessage(data);
            }
        };
    }

    async sendWebRTCOnlySecret() {
        const message = this.elements.secretMessageInput.value.trim();
        if (!message) return;

        try {
            await this.webrtcSecrets.sendWebRTCSecret(message);
            this.elements.secretMessageInput.value = '';
            
            // Show confirmation
            this.showSecretSentConfirmation();
        } catch (error) {
            alert('Cannot send secret: ' + error.message);
        }
    }
}