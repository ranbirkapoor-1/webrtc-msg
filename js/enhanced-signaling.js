/**
 * Enhanced Signaling Manager with Offline Message Support
 */

import { firebaseConfig } from './config.js';

export class EnhancedSignalingManager {
    constructor() {
        this.database = null;
        this.roomRef = null;
        this.currentRoomId = null;
        this.sessionId = null;
        this.onSignalingMessage = null;
        this.onEncryptedMessageReceived = null;
        this.isConnected = false;
        this.app = null;
        this.firebaseRefs = null;
        this.processedSignals = new Set();
        this.activityInterval = null;
    }

    /**
     * Initialize Firebase connection
     */
    async initialize() {
        try {
            console.log('🔥 Initializing Firebase...');
            
            // Import Firebase modules with timeout
            const loadPromise = Promise.all([
                import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js')
            ]);
            
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Firebase load timeout')), 15000)
            );
            
            const [{ initializeApp }, { getDatabase, ref, set, update, push, onChildAdded, onChildChanged, off, remove, get, onDisconnect, serverTimestamp, onValue }] = 
                await Promise.race([loadPromise, timeoutPromise]);
            
            this.app = initializeApp(firebaseConfig);
            this.database = getDatabase(this.app);
            
            // Store Firebase functions for later use
            this.firebaseRefs = { ref, set, update, push, onChildAdded, onChildChanged, off, remove, get, onDisconnect, serverTimestamp, onValue };
            
            // Set up connection state monitoring
            this.setupConnectionMonitoring();
            
            this.isConnected = true;
            console.log('✅ Firebase initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Firebase:', error);
            this.isConnected = false;
            throw new Error(`Firebase initialization failed: ${error.message}`);
        }
    }
    
    /**
     * Set up Firebase connection monitoring
     */
    setupConnectionMonitoring() {
        const connectedRef = this.firebaseRefs.ref(this.database, '.info/connected');
        this.firebaseRefs.onValue(connectedRef, (snapshot) => {
            if (snapshot.val() === true) {
                console.log('🟢 Firebase connected');
                this.isConnected = true;
            } else {
                console.log('🔴 Firebase disconnected');
                this.isConnected = false;
            }
        });
    }

    /**
     * Join or create room
     */
    async joinRoom(roomId, sessionId, isInitiator = false) {
        this.currentRoomId = roomId;
        this.sessionId = sessionId;
        
        console.log(`🚪 ${isInitiator ? 'Creating' : 'Joining'} room:`, roomId);

        // Set up room reference
        this.roomRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}`);

        // Update room info
        const roomUpdate = {
            [`participants/${sessionId}`]: {
                joined: Date.now(),
                lastSeen: Date.now(),
                active: true
            },
            lastActivity: Date.now()
        };

        if (isInitiator) {
            roomUpdate.created = Date.now();
            roomUpdate.messageCount = 0;
        }

        await this.firebaseRefs.update(this.roomRef, roomUpdate);

        // Set up WebRTC signaling listeners
        this.setupWebRTCSignaling();

        // Set up encrypted message listener
        this.setupEncryptedMessageListener();

        // Start periodic activity updates to keep participant active
        this.startActivityUpdates();

        console.log('✅ Room setup complete');
    }

    /**
     * Setup WebRTC signaling listeners
     */
    setupWebRTCSignaling() {
        const signalingRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}`);

        // Listen for offers
        const offersRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}/offers`);
        this.firebaseRefs.onChildAdded(offersRef, (snapshot) => {
            const offerData = snapshot.val();
            if (offerData && offerData.sender !== this.sessionId) {
                this.handleSignalingMessage('offer', offerData);
            }
        });

        // Listen for answers
        const answersRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}/answers`);
        this.firebaseRefs.onChildAdded(answersRef, (snapshot) => {
            const answerData = snapshot.val();
            if (answerData && answerData.sender !== this.sessionId) {
                this.handleSignalingMessage('answer', answerData);
            }
        });

        // Listen for ICE candidates
        const candidatesRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}/candidates`);
        this.firebaseRefs.onChildAdded(candidatesRef, (snapshot) => {
            const candidateData = snapshot.val();
            if (candidateData && candidateData.sender !== this.sessionId) {
                const actualCandidate = candidateData.candidate || candidateData;
                this.handleSignalingMessage('candidate', actualCandidate);
            }
        });
    }

    /**
     * Setup encrypted message listener for offline messages
     */
    setupEncryptedMessageListener() {
        const messagesRef = this.firebaseRefs.ref(this.database, `encrypted_messages/${this.currentRoomId}`);

        this.firebaseRefs.onChildAdded(messagesRef, (snapshot) => {
            const messageData = snapshot.val();
            const messageId = snapshot.key;

            // Skip processed, expired, or own messages
            if (this.processedSignals.has(messageId) || 
                messageData.ttl < Date.now() || 
                messageData.sender === this.sessionId) {
                return;
            }

            this.processedSignals.add(messageId);

            if (this.onEncryptedMessageReceived) {
                this.onEncryptedMessageReceived({
                    id: messageId,
                    ...messageData
                });
            }
        });
    }

    /**
     * Handle WebRTC signaling messages
     */
    handleSignalingMessage(type, data) {
        const signalId = `${type}_${data.timestamp || Date.now()}`;
        
        if (this.processedSignals.has(signalId)) {
            return; // Skip duplicates
        }
        
        this.processedSignals.add(signalId);

        if (this.onSignalingMessage) {
            // The data already contains the correct SDP structure from Firebase
            this.onSignalingMessage(type, data);
        }
    }

    /**
     * Send WebRTC offer
     */
    async sendOffer(offer) {
        console.log('🚀 Sending WebRTC offer...');
        console.log('📋 Offer data:', { type: offer.type, sdpLength: offer.sdp?.length });
        
        const offerData = {
            sdp: {
                type: offer.type,
                sdp: offer.sdp
            },
            sender: this.sessionId,
            timestamp: Date.now()
        };

        console.log('📤 Writing offer to Firebase path:', `webrtc_signaling/${this.currentRoomId}/offers`);
        console.log('📤 Offer payload:', { 
            sender: offerData.sender, 
            timestamp: offerData.timestamp,
            sdpType: offerData.sdp.type
        });

        const offersRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}/offers`);
        const offerRef = this.firebaseRefs.push(offersRef);
        
        try {
            await this.firebaseRefs.set(offerRef, offerData);
            console.log('✅ Offer successfully written to Firebase');
            console.log('🔑 Offer key:', offerRef.key);
        } catch (error) {
            console.error('❌ Failed to write offer to Firebase:', error);
            throw error;
        }
    }

    /**
     * Send WebRTC answer
     */
    async sendAnswer(answer) {
        const answerData = {
            sdp: {
                type: answer.type,
                sdp: answer.sdp
            },
            sender: this.sessionId,
            timestamp: Date.now()
        };

        const answersRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}/answers`);
        const answerRef = this.firebaseRefs.push(answersRef);
        await this.firebaseRefs.set(answerRef, answerData);
        
        console.log('📤 Answer sent');
    }

    /**
     * Send ICE candidate
     */
    async sendIceCandidate(candidate) {
        const candidateData = {
            candidate: {
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
            },
            sender: this.sessionId,
            timestamp: Date.now()
        };

        const candidatesRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}/candidates`);
        const candidateRef = this.firebaseRefs.push(candidatesRef);
        await this.firebaseRefs.set(candidateRef, candidateData);
        
        console.log('📤 ICE candidate sent');
    }

    /**
     * Check if room exists
     */
    async checkRoomExists(roomId) {
        const roomRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}`);
        const snapshot = await this.firebaseRefs.get(roomRef);
        return snapshot.exists();
    }

    /**
     * Check if room has active participants (within last 2 minutes)
     */
    async checkActiveParticipants(roomId) {
        try {
            const roomRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}/participants`);
            const snapshot = await this.firebaseRefs.get(roomRef);
            
            if (!snapshot.exists()) {
                return { count: 0, hasActive: false };
            }
            
            const participants = snapshot.val();
            const now = Date.now();
            const activeTimeout = 2 * 60 * 1000; // 2 minutes
            
            let activeCount = 0;
            for (const [sessionId, data] of Object.entries(participants)) {
                if (data.active && data.lastSeen && (now - data.lastSeen < activeTimeout)) {
                    activeCount++;
                } else if (data.active && data.joined && (now - data.joined < activeTimeout)) {
                    // Recently joined but no lastSeen yet
                    activeCount++;
                }
            }
            
            console.log(`🔍 Room ${roomId}: ${activeCount} active participants found`);
            return { count: activeCount, hasActive: activeCount > 0 };
            
        } catch (error) {
            console.warn('⚠️ Could not check active participants:', error);
            return { count: 0, hasActive: false };
        }
    }

    /**
     * Start periodic activity updates
     */
    startActivityUpdates() {
        // Clear any existing interval
        if (this.activityInterval) {
            clearInterval(this.activityInterval);
        }
        
        // Update activity every 30 seconds
        this.activityInterval = setInterval(() => {
            this.updateActivity();
        }, 30000);
        
        console.log('⏰ Started activity updates (30s interval)');
    }

    /**
     * Update room activity
     */
    async updateActivity() {
        if (this.roomRef && this.sessionId) {
            try {
                await this.firebaseRefs.update(this.roomRef, {
                    [`participants/${this.sessionId}/lastSeen`]: Date.now(),
                    lastActivity: Date.now()
                });
            } catch (error) {
                console.warn('⚠️ Failed to update activity:', error.message);
            }
        }
    }

    /**
     * Leave room and cleanup
     */
    async leaveRoom() {
        // Stop activity updates
        if (this.activityInterval) {
            clearInterval(this.activityInterval);
            this.activityInterval = null;
            console.log('⏹️ Stopped activity updates');
        }
        
        if (this.roomRef && this.sessionId) {
            // Mark as inactive
            await this.firebaseRefs.update(this.roomRef, {
                [`participants/${this.sessionId}/active`]: false,
                [`participants/${this.sessionId}/left`]: Date.now()
            });

            // Remove listeners
            this.firebaseRefs.off(this.roomRef);
            
            // Clean up signaling data (optional - keeps for debugging)
            // await this.cleanupSignalingData();
        }

        this.currentRoomId = null;
        this.sessionId = null;
        this.roomRef = null;
        this.processedSignals.clear();
        
        console.log('👋 Left room');
    }

    /**
     * Clean up stale signaling data for a specific room (important for password reuse)
     */
    async cleanupStaleSignalingData(roomId) {
        try {
            const signalingRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${roomId}`);
            await this.firebaseRefs.remove(signalingRef);
            console.log(`🧹 Cleaned stale signaling data for room: ${roomId}`);
            
            // Also clear any old ICE candidates and offers/answers
            const roomRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}/signaling_data`);
            await this.firebaseRefs.remove(roomRef);
            console.log(`🧹 Cleaned room signaling metadata for: ${roomId}`);
        } catch (error) {
            console.warn('⚠️ Failed to cleanup stale signaling data (may not exist):', error.message);
        }
    }

    /**
     * Cleanup old signaling data
     */
    async cleanupSignalingData() {
        try {
            const signalingRef = this.firebaseRefs.ref(this.database, `webrtc_signaling/${this.currentRoomId}`);
            await this.firebaseRefs.remove(signalingRef);
            console.log('🧹 Signaling data cleaned');
        } catch (error) {
            console.error('❌ Failed to cleanup signaling data:', error);
        }
    }

    /**
     * Get room statistics
     */
    async getRoomStats() {
        if (!this.currentRoomId) return null;

        try {
            const roomSnapshot = await this.firebaseRefs.get(this.roomRef);
            const messagesSnapshot = await this.firebaseRefs.get(
                this.firebaseRefs.ref(this.database, `encrypted_messages/${this.currentRoomId}`)
            );

            return {
                roomData: roomSnapshot.exists() ? roomSnapshot.val() : null,
                messageCount: messagesSnapshot.exists() ? Object.keys(messagesSnapshot.val()).length : 0,
                activeParticipants: roomSnapshot.exists() ? 
                    Object.values(roomSnapshot.val().participants || {})
                        .filter(p => p.active).length : 0
            };
        } catch (error) {
            console.error('❌ Failed to get room stats:', error);
            return null;
        }
    }
}