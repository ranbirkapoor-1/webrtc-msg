import { firebaseConfig } from './config.js';

export class SignalingManager {
    constructor() {
        this.database = null;
        this.roomRef = null;
        this.currentRoomId = null;
        this.onSignalingMessage = null;
        this.isConnected = false;
        this.app = null;
        this.processedMessages = new Set();
        this.userId = Math.random().toString(36).substring(2, 15);
        this.onEncryptedMessageReceived = null;
    }


    async initialize() {
        try {
            // Dynamically import Firebase modules
            const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
            const { getDatabase, ref, set, update, push, onChildAdded, onChildChanged, off, remove, get } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js');
            
            this.app = initializeApp(firebaseConfig);
            this.database = getDatabase(this.app);
            
            // Store Firebase functions for later use
            this.firebaseRefs = { ref, set, update, push, onChildAdded, onChildChanged, off, remove, get };
            
            this.isConnected = true;
        } catch (error) {
            console.error('Failed to initialize Firebase:', error);
            throw new Error('Firebase SDK failed to load');
        }
    }

    // Room ID generation now handled by crypto manager - remove this method

    async createRoom(roomId) {
        return this.joinRoom(roomId, true);
    }

    async joinRoom(roomId, isInitiator = false) {
        if (!this.isConnected) {
            throw new Error('Signaling not initialized');
        }

        this.currentRoomId = roomId;
        this.roomRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}`);

        if (isInitiator) {
            await this.firebaseRefs.set(this.roomRef, {
                created: Date.now(),
                initiator: true,
                status: 'waiting'
            });
        } else {
            await this.firebaseRefs.update(this.roomRef, {
                status: 'joined',
                joiner: true
            });
        }

        this.firebaseRefs.onChildChanged(this.roomRef, (snapshot) => {
            const key = snapshot.key;
            const value = snapshot.val();
            
            if (key === 'offer' || key === 'answer') {
                // Skip if this is our own message
                if (value && value.senderId === this.userId) {
                    console.log(`⏩ Skipping own ${key} message`);
                    return;
                }
                
                const messageId = `${key}-${JSON.stringify(value)}`;
                if (!this.processedMessages.has(messageId)) {
                    this.processedMessages.add(messageId);
                    if (this.onSignalingMessage) {
                        this.onSignalingMessage(key, value);
                    }
                }
            }
        });

        this.firebaseRefs.onChildAdded(this.roomRef, (snapshot) => {
            const key = snapshot.key;
            const value = snapshot.val();
            
            if (key === 'offer' || key === 'answer') {
                // Skip if this is our own message
                if (value && value.senderId === this.userId) {
                    console.log(`⏩ Skipping own ${key} message`);
                    return;
                }
                
                const messageId = `${key}-${JSON.stringify(value)}`;
                if (!this.processedMessages.has(messageId)) {
                    this.processedMessages.add(messageId);
                    if (this.onSignalingMessage) {
                        this.onSignalingMessage(key, value);
                    }
                }
            }
        });

        // Listen for ICE candidates
        const candidatesRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}/candidates`);
        this.firebaseRefs.onChildAdded(candidatesRef, (snapshot) => {
            const candidateData = snapshot.val();
            console.log('📥 Received ICE candidate data:', candidateData);
            
            // Skip our own candidates
            if (candidateData && candidateData.senderId === this.userId) {
                console.log('⏩ Skipping own ICE candidate');
                return;
            }
            
            if (this.onSignalingMessage && candidateData && candidateData.candidate) {
                console.log('📬 Processing remote ICE candidate:', candidateData.candidate);
                this.onSignalingMessage('candidate', candidateData.candidate);
            } else {
                console.warn('⚠️ Invalid ICE candidate data:', candidateData);
            }
        });

        return roomId;
    }

    async sendOffer(offer) {
        if (!this.roomRef) return;
        await this.firebaseRefs.update(this.roomRef, { 
            offer: {
                sdp: offer,
                senderId: this.userId
            }
        });
    }

    async sendAnswer(answer) {
        if (!this.roomRef) return;
        await this.firebaseRefs.update(this.roomRef, { 
            answer: {
                sdp: answer,
                senderId: this.userId
            }
        });
    }

    async sendIceCandidate(candidate) {
        if (!this.roomRef) return;
        console.log('📤 Sending ICE candidate:', candidate);
        const candidatesRef = this.firebaseRefs.ref(this.database, `rooms/${this.currentRoomId}/candidates`);
        const candidateRef = this.firebaseRefs.push(candidatesRef);
        
        // Convert RTCIceCandidate to plain object for Firebase
        const candidateData = {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            foundation: candidate.foundation,
            component: candidate.component,
            priority: candidate.priority,
            address: candidate.address,
            protocol: candidate.protocol,
            port: candidate.port,
            type: candidate.type
        };
        
        await this.firebaseRefs.set(candidateRef, {
            candidate: candidateData,
            senderId: this.userId
        });
    }

    async checkRoomExists(roomId) {
        const roomRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}`);
        const snapshot = await this.firebaseRefs.get(roomRef);
        return snapshot.exists();
    }

    /**
     * Store encrypted message temporarily for offline peer
     * Message is encrypted blob, auto-deletes when retrieved
     */
    async storeEncryptedMessage(encryptedData, recipientPresenceId) {
        if (!this.currentRoomId) return;
        
        const tempMessagesRef = this.firebaseRefs.ref(this.database, `temp_messages/${this.currentRoomId}/${recipientPresenceId}`);
        const messageRef = this.firebaseRefs.push(tempMessagesRef);
        
        // Store encrypted blob with metadata
        await this.firebaseRefs.set(messageRef, {
            encryptedBlob: encryptedData,
            senderId: this.userId,
            timestamp: Date.now(),
            ttl: Date.now() + (24 * 60 * 60 * 1000) // 24 hour expiry
        });
        
        console.log('🔒 Encrypted message stored temporarily');
        return messageRef.key;
    }

    /**
     * Retrieve and delete encrypted messages for this user
     */
    async retrieveEncryptedMessages() {
        if (!this.currentRoomId) return [];
        
        const tempMessagesRef = this.firebaseRefs.ref(this.database, `temp_messages/${this.currentRoomId}/${this.userId}`);
        const snapshot = await this.firebaseRefs.get(tempMessagesRef);
        
        const messages = [];
        if (snapshot.exists()) {
            const deletePromises = [];
            
            snapshot.forEach((childSnapshot) => {
                const messageData = childSnapshot.val();
                const messageKey = childSnapshot.key;
                
                // Check if message hasn't expired
                if (messageData.ttl > Date.now()) {
                    messages.push({
                        id: messageKey,
                        ...messageData
                    });
                }
                
                // Delete message after retrieval (auto-delete)
                deletePromises.push(this.firebaseRefs.remove(childSnapshot.ref));
            });
            
            // Delete all retrieved messages
            await Promise.all(deletePromises);
            console.log('🔥 Retrieved and deleted encrypted messages from server');
        }
        
        return messages.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Listen for new encrypted messages
     */
    setupEncryptedMessageListener() {
        if (!this.currentRoomId) return;
        
        const tempMessagesRef = this.firebaseRefs.ref(this.database, `temp_messages/${this.currentRoomId}/${this.userId}`);
        
        this.firebaseRefs.onChildAdded(tempMessagesRef, async (snapshot) => {
            const messageData = snapshot.val();
            const messageKey = snapshot.key;
            
            // Skip our own messages and expired messages
            if (messageData.senderId === this.userId || messageData.ttl < Date.now()) {
                return;
            }
            
            if (this.onEncryptedMessageReceived) {
                this.onEncryptedMessageReceived({
                    id: messageKey,
                    ...messageData
                });
            }
            
            // Auto-delete after notifying
            await this.firebaseRefs.remove(snapshot.ref);
            console.log('🔥 Auto-deleted encrypted message after delivery');
        });
    }

    /**
     * Cleanup expired messages (runs periodically)
     */
    async cleanupExpiredMessages() {
        if (!this.currentRoomId) return;
        
        const tempMessagesRef = this.firebaseRefs.ref(this.database, `temp_messages/${this.currentRoomId}`);
        const snapshot = await this.firebaseRefs.get(tempMessagesRef);
        
        if (snapshot.exists()) {
            const deletePromises = [];
            
            snapshot.forEach((userSnapshot) => {
                userSnapshot.forEach((messageSnapshot) => {
                    const messageData = messageSnapshot.val();
                    
                    // Delete expired messages
                    if (messageData.ttl < Date.now()) {
                        deletePromises.push(this.firebaseRefs.remove(messageSnapshot.ref));
                    }
                });
            });
            
            await Promise.all(deletePromises);
            if (deletePromises.length > 0) {
                console.log(`🧹 Cleaned up ${deletePromises.length} expired messages`);
            }
        }
    }

    leaveRoom() {
        if (this.roomRef) {
            this.firebaseRefs.off(this.roomRef);
            if (this.currentRoomId) {
                this.firebaseRefs.remove(this.roomRef);
            }
        }
        this.currentRoomId = null;
        this.roomRef = null;
        this.processedMessages.clear();
    }

    disconnect() {
        this.leaveRoom();
        this.isConnected = false;
    }
}