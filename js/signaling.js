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

    generateRoomId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    async createRoom() {
        const roomId = this.generateRoomId();
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
                const messageId = `${key}-${JSON.stringify(value)}`;
                if (!this.processedMessages.has(messageId)) {
                    this.processedMessages.add(messageId);
                    if (this.onSignalingMessage) {
                        this.onSignalingMessage(key, value);
                    }
                }
            } else if (key === 'candidates') {
                // Handle ICE candidates separately as they can be multiple
                if (this.onSignalingMessage) {
                    this.onSignalingMessage('candidate', value);
                }
            }
        });

        return roomId;
    }

    async sendOffer(offer) {
        if (!this.roomRef) return;
        await this.firebaseRefs.update(this.roomRef, { offer: offer });
    }

    async sendAnswer(answer) {
        if (!this.roomRef) return;
        await this.firebaseRefs.update(this.roomRef, { answer: answer });
    }

    async sendIceCandidate(candidate) {
        if (!this.roomRef) return;
        const candidatesRef = this.firebaseRefs.ref(this.database, `rooms/${this.currentRoomId}/candidates`);
        const candidateRef = this.firebaseRefs.push(candidatesRef);
        await this.firebaseRefs.set(candidateRef, candidate);
    }

    async checkRoomExists(roomId) {
        const roomRef = this.firebaseRefs.ref(this.database, `rooms/${roomId}`);
        const snapshot = await this.firebaseRefs.get(roomRef);
        return snapshot.exists();
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