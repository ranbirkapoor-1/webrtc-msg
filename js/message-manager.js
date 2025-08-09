/**
 * Message Manager for Dual Delivery (Online/Offline)
 */

export class MessageManager {
    constructor(signaling, webrtc, crypto) {
        this.signaling = signaling;
        this.webrtc = webrtc;
        this.crypto = crypto;
        this.isWebRTCConnected = false;
        this.messageQueue = [];
        this.deliveredMessages = new Set();
        this.onMessageReceived = null;
    }

    /**
     * Initialize message manager
     */
    initialize() {
        // Don't override the main app's connection state callback
        // Instead, we'll check connection state when needed

        // Note: WebRTC message handling is now managed by the main app
        // to route different message types (encrypted_chat vs webrtc_secret)

        // Listen for Firebase offline messages
        this.signaling.onEncryptedMessageReceived = async (messageData) => {
            await this.handleIncomingMessage(messageData, 'firebase');
        };

        console.log('📨 Message manager initialized');
    }

    /**
     * Send message with dual delivery
     */
    async sendMessage(plaintext) {
        if (!plaintext.trim()) return false;

        const messageId = this.generateMessageId();
        let delivered = false;

        try {
            // Encrypt the message
            const encrypted = await this.crypto.encryptMessage(plaintext);
            const messagePayload = {
                id: messageId,
                type: 'encrypted_chat',
                data: encrypted.data,
                iv: encrypted.iv,
                timestamp: encrypted.timestamp,
                sender: this.crypto.getSessionId()
            };

            console.log('📤 Sending message:', messageId);
            console.log('📊 WebRTC connection status:', this.isWebRTCConnected);
            console.log('📊 Data channel state:', this.webrtc.dataChannel?.readyState);

            // Try WebRTC first (if connected and data channel is open)
            const dataChannelReady = this.webrtc.dataChannel && this.webrtc.dataChannel.readyState === 'open';
            if (this.isWebRTCConnected && dataChannelReady) {
                console.log('🔄 Attempting WebRTC message send...');
                const webrtcSent = this.webrtc.sendMessage(messagePayload);
                if (webrtcSent) {
                    console.log('✅ Message sent via WebRTC');
                    delivered = true;
                } else {
                    console.log('⚠️ WebRTC send failed, will use Firebase fallback');
                }
            } else {
                console.log('📊 WebRTC not ready for messaging');
                console.log('  - isWebRTCConnected:', this.isWebRTCConnected);
                console.log('  - dataChannelReady:', dataChannelReady);
            }

            // Always store in Firebase for reliability and offline delivery
            await this.storeOfflineMessage(messagePayload);
            console.log('📝 Message stored in Firebase');

            return true;
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            return false;
        }
    }

    /**
     * Handle incoming messages from any source
     */
    async handleIncomingMessage(messageData, source) {
        try {
            // Prevent duplicate processing
            if (this.deliveredMessages.has(messageData.id)) {
                console.log('⏭️ Skipping duplicate message:', messageData.id);
                return;
            }

            // Skip our own messages
            if (messageData.sender === this.crypto.getSessionId()) {
                console.log('⏭️ Skipping own message:', messageData.id);
                return;
            }

            // Decrypt message
            const decrypted = await this.crypto.decryptMessage({
                data: messageData.data,
                iv: messageData.iv
            });

            // Mark as delivered
            this.deliveredMessages.add(messageData.id);

            // Notify UI
            if (this.onMessageReceived) {
                this.onMessageReceived({
                    id: messageData.id,
                    text: decrypted,
                    timestamp: messageData.timestamp,
                    sender: 'remote',
                    source: source
                });
            }

            console.log(`📨 Message received via ${source}:`, messageData.id);

            // If received via Firebase, mark as delivered and delete
            if (source === 'firebase') {
                await this.markMessageAsDelivered(messageData.id);
            }

        } catch (error) {
            console.error('❌ Failed to handle incoming message:', error);
        }
    }

    /**
     * Store message in Firebase for offline delivery
     */
    async storeOfflineMessage(messagePayload) {
        const roomId = this.crypto.getRoomId();
        const messageId = messagePayload.id;

        await this.signaling.firebaseRefs.set(
            this.signaling.firebaseRefs.ref(
                this.signaling.database, 
                `encrypted_messages/${roomId}/${messageId}`
            ),
            {
                data: messagePayload.data,
                iv: messagePayload.iv,
                timestamp: messagePayload.timestamp,
                sender: messagePayload.sender,
                ttl: Date.now() + (24 * 60 * 60 * 1000), // 24 hour expiry
                delivered: false
            }
        );
    }

    /**
     * Load offline messages when joining room
     */
    async loadOfflineMessages() {
        try {
            const roomId = this.crypto.getRoomId();
            const messagesRef = this.signaling.firebaseRefs.ref(
                this.signaling.database, 
                `encrypted_messages/${roomId}`
            );

            const snapshot = await this.signaling.firebaseRefs.get(messagesRef);
            
            if (!snapshot.exists()) {
                console.log('📭 No offline messages found');
                return;
            }

            const messages = [];
            snapshot.forEach((childSnapshot) => {
                const messageData = childSnapshot.val();
                const messageId = childSnapshot.key;

                // Skip expired or delivered messages
                if (messageData.ttl < Date.now() || messageData.delivered) {
                    return;
                }

                // Skip our own messages
                if (messageData.sender === this.crypto.getSessionId()) {
                    return;
                }

                messages.push({
                    id: messageId,
                    ...messageData
                });
            });

            // Sort by timestamp
            messages.sort((a, b) => a.timestamp - b.timestamp);

            console.log(`📥 Loading ${messages.length} offline messages`);

            // Process each message
            for (const message of messages) {
                await this.handleIncomingMessage(message, 'firebase');
            }

        } catch (error) {
            console.error('❌ Failed to load offline messages:', error);
        }
    }

    /**
     * Mark message as delivered and delete from Firebase
     */
    async markMessageAsDelivered(messageId) {
        try {
            const roomId = this.crypto.getRoomId();
            const messageRef = this.signaling.firebaseRefs.ref(
                this.signaling.database, 
                `encrypted_messages/${roomId}/${messageId}`
            );

            await this.signaling.firebaseRefs.remove(messageRef);
            console.log('🗑️ Deleted delivered message:', messageId);
        } catch (error) {
            console.error('❌ Failed to delete message:', error);
        }
    }

    /**
     * Process queued messages when WebRTC connects
     */
    processMessageQueue() {
        console.log(`📋 Processing ${this.messageQueue.length} queued messages`);
        
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.webrtc.sendMessage(message);
        }
    }

    /**
     * Cleanup expired messages (called periodically)
     */
    async cleanupExpiredMessages() {
        try {
            const roomId = this.crypto.getRoomId();
            const messagesRef = this.signaling.firebaseRefs.ref(
                this.signaling.database, 
                `encrypted_messages/${roomId}`
            );

            const snapshot = await this.signaling.firebaseRefs.get(messagesRef);
            
            if (!snapshot.exists()) return;

            const deletePromises = [];
            const now = Date.now();

            snapshot.forEach((childSnapshot) => {
                const messageData = childSnapshot.val();
                
                // Delete expired messages
                if (messageData.ttl < now) {
                    deletePromises.push(
                        this.signaling.firebaseRefs.remove(childSnapshot.ref)
                    );
                }
            });

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                console.log(`🧹 Cleaned up ${deletePromises.length} expired messages`);
            }
        } catch (error) {
            console.error('❌ Failed to cleanup messages:', error);
        }
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get message statistics
     */
    getStats() {
        return {
            webrtcConnected: this.isWebRTCConnected,
            queuedMessages: this.messageQueue.length,
            deliveredMessages: this.deliveredMessages.size
        };
    }
}