import { WebRTCManager } from './webrtc.js';
import { SignalingManager } from './signaling.js';
import { CryptoManager } from './crypto.js';

class SecureMessengerApp {
    constructor() {
        this.webrtc = new WebRTCManager();
        this.signaling = new SignalingManager();
        this.crypto = new CryptoManager();
        this.isInitiator = false;
        this.currentRoomId = null;
        this.currentPassword = null;
        this.peerConnected = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupWebRTCCallbacks();
        this.setupSignalingCallbacks();
    }

    initializeElements() {
        this.elements = {
            roomPassword: document.getElementById('roomPassword'),
            joinRoom: document.getElementById('joinRoom'),
            leaveRoom: document.getElementById('leaveRoom'),
            connectionStatus: document.getElementById('connectionStatus'),
            connectionInfo: document.getElementById('connectionInfo'),
            currentRoomId: document.getElementById('currentRoomId'),
            chatContainer: document.getElementById('chatContainer'),
            messages: document.getElementById('messages'),
            messageInput: document.getElementById('messageInput'),
            sendMessage: document.getElementById('sendMessage'),
            liveTab: document.getElementById('liveTab'),
            secretTab: document.getElementById('secretTab'),
            secretMessages: document.getElementById('secretMessages'),
            secretMessagesList: document.getElementById('secretMessagesList'),
            liveInputContainer: document.getElementById('liveInputContainer'),
            secretInputContainer: document.getElementById('secretInputContainer'),
            secretMessageInput: document.getElementById('secretMessageInput'),
            sendSecretMessage: document.getElementById('sendSecretMessage'),
            mediaControls: document.getElementById('mediaControls'),
            startCall: document.getElementById('startCall'),
            endCall: document.getElementById('endCall'),
            toggleMute: document.getElementById('toggleMute'),
            toggleVideo: document.getElementById('toggleVideo'),
            videoContainer: document.getElementById('videoContainer'),
            localVideo: document.getElementById('localVideo'),
            remoteVideo: document.getElementById('remoteVideo')
        };
    }

    setupEventListeners() {
        this.elements.joinRoom.addEventListener('click', () => this.joinRoom());
        this.elements.leaveRoom.addEventListener('click', () => this.leaveRoom());
        this.elements.roomPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        this.elements.sendMessage.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        this.elements.sendSecretMessage.addEventListener('click', () => this.sendSecretMessage());
        this.elements.secretMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendSecretMessage();
        });

        this.elements.liveTab.addEventListener('click', () => this.switchToLiveTab());
        this.elements.secretTab.addEventListener('click', () => this.switchToSecretTab());
        
        this.elements.startCall.addEventListener('click', () => this.startCall());
        this.elements.endCall.addEventListener('click', () => this.endCall());
        this.elements.toggleMute.addEventListener('click', () => this.toggleMute());
        this.elements.toggleVideo.addEventListener('click', () => this.toggleVideo());
    }

    setupWebRTCCallbacks() {
        this.webrtc.onMessageReceived = async (data) => {
            if (data.type === 'encrypted_message') {
                console.log('📨 Received encrypted WebRTC message');
                try {
                    const decryptedText = await this.crypto.decryptMessage(data.encryptedData);
                    this.displayMessage(decryptedText, 'remote', data.timestamp);
                } catch (error) {
                    console.error('Failed to decrypt WebRTC message:', error);
                    this.displayMessage('🔒 [Encrypted message - failed to decrypt]', 'remote', data.timestamp);
                }
            }
        };

        this.webrtc.onConnectionStateChange = (state) => {
            console.log('🔄 WebRTC connection state:', state);
            this.updateConnectionStatus(state);
            
            if (state === 'connected') {
                this.peerConnected = true;
                this.showChatInterface();
            } else if (state === 'disconnected' || state === 'failed') {
                this.peerConnected = false;
            }
        };

        this.webrtc.onIceCandidate = (candidate) => {
            this.signaling.sendIceCandidate(candidate);
        };

        this.webrtc.onRemoteStream = (stream) => {
            this.elements.remoteVideo.srcObject = stream;
            this.elements.videoContainer.style.display = 'block';
        };
    }

    setupSignalingCallbacks() {
        this.signaling.onSignalingMessage = async (type, data) => {
            console.log(`📨 Received ${type} message`);
            
            switch (type) {
                case 'offer':
                    if (!this.isInitiator) {
                        console.log('🔄 Processing offer as joiner...');
                        await this.webrtc.createPeerConnection();
                        const answer = await this.webrtc.createAnswer(data.sdp);
                        await this.signaling.sendAnswer(answer);
                    }
                    break;
                
                case 'answer':
                    if (this.isInitiator) {
                        console.log('🔄 Processing answer as initiator...');
                        await this.webrtc.handleAnswer(data.sdp);
                    }
                    break;
                
                case 'candidate':
                    await this.webrtc.addIceCandidate(data);
                    break;
            }
        };

        // Handle encrypted messages for offline peers
        this.signaling.onEncryptedMessageReceived = async (messageData) => {
            console.log('📬 Received encrypted message from Firebase');
            try {
                const decryptedText = await this.crypto.decryptMessage(messageData.encryptedBlob);
                this.displaySecretMessage(decryptedText, messageData.timestamp);
                
                // Show notification on secret tab
                this.addSecretNotification();
            } catch (error) {
                console.error('Failed to decrypt Firebase message:', error);
                this.displaySecretMessage('🔒 [Failed to decrypt message]', messageData.timestamp);
            }
        };
    }

    async initialize() {
        try {
            console.log('🔄 Initializing Firebase signaling...');
            await this.signaling.initialize();
            this.updateConnectionStatus('ready');
            console.log('✅ Secure messenger initialized');
        } catch (error) {
            console.error('❌ Failed to initialize:', error);
            this.updateConnectionStatus('error');
            alert('Failed to initialize. Please check your connection.');
        }
    }

    async joinRoom() {
        const password = this.elements.roomPassword.value.trim();
        if (!password) {
            alert('Please enter a password');
            return;
        }

        try {
            console.log('🔐 Generating room ID from password...');
            
            // Generate room ID from password
            this.currentRoomId = await this.crypto.generateRoomIdFromPassword(password);
            this.currentPassword = password;
            
            console.log('🔑 Room ID generated:', this.currentRoomId);
            
            // Set up encryption key
            await this.crypto.setEncryptionKey(password, this.currentRoomId);
            
            // Check if room exists
            const roomExists = await this.signaling.checkRoomExists(this.currentRoomId);
            this.isInitiator = !roomExists;
            
            console.log(this.isInitiator ? '👑 Creating new room' : '🚪 Joining existing room');
            
            // Join/create room
            await this.signaling.joinRoom(this.currentRoomId, this.isInitiator);
            
            // Set up WebRTC
            await this.webrtc.createPeerConnection();
            
            if (this.isInitiator) {
                const offer = await this.webrtc.createOffer();
                await this.signaling.sendOffer(offer);
            }
            
            // Show room info
            this.elements.currentRoomId.textContent = this.currentRoomId;
            this.elements.connectionInfo.style.display = 'block';
            this.elements.roomPassword.style.display = 'none';
            this.elements.joinRoom.style.display = 'none';
            
            this.updateConnectionStatus(this.isInitiator ? 'waiting' : 'connecting');
            
            // Set up encrypted message listener
            this.signaling.setupEncryptedMessageListener();
            
            // Load any pending secret messages
            await this.loadSecretMessages();
            
            // Start periodic cleanup
            setInterval(() => {
                this.signaling.cleanupExpiredMessages();
            }, 5 * 60 * 1000); // Every 5 minutes
            
        } catch (error) {
            console.error('❌ Failed to join room:', error);
            alert('Failed to join room: ' + error.message);
        }
    }

    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message) return;

        try {
            if (this.peerConnected) {
                // Send via WebRTC (live chat)
                console.log('📤 Sending encrypted message via WebRTC');
                const encryptedData = await this.crypto.encryptMessage(message);
                
                const success = this.webrtc.sendMessage({
                    type: 'encrypted_message',
                    encryptedData: encryptedData,
                    timestamp: Date.now()
                });
                
                if (success) {
                    this.displayMessage(message, 'local');
                    this.elements.messageInput.value = '';
                } else {
                    alert('Failed to send message - connection not ready');
                }
            } else {
                // Store encrypted for offline peer
                console.log('📤 Storing encrypted message for offline peer');
                const encryptedData = await this.crypto.encryptMessage(message);
                await this.signaling.storeEncryptedMessage(encryptedData, 'unknown'); // Will be delivered to anyone joining
                
                this.displayMessage(message + ' (sent to offline peer)', 'local');
                this.elements.messageInput.value = '';
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message');
        }
    }

    async sendSecretMessage() {
        const message = this.elements.secretMessageInput.value.trim();
        if (!message) return;

        try {
            console.log('🔒 Sending secret message...');
            const encryptedData = await this.crypto.encryptMessage(message);
            
            // Always store secret messages in Firebase for auto-delete behavior
            await this.signaling.storeEncryptedMessage(encryptedData, 'broadcast');
            
            this.displaySecretMessage(message + ' (secret sent)', null, true);
            this.elements.secretMessageInput.value = '';
            
            // Show confirmation
            const button = this.elements.sendSecretMessage;
            const originalText = button.textContent;
            button.textContent = '🔥 Sent!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
            
        } catch (error) {
            console.error('Failed to send secret message:', error);
            alert('Failed to send secret message');
        }
    }

    displayMessage(text, sender, timestamp = Date.now()) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}`;
        
        const time = new Date(timestamp).toLocaleTimeString();
        messageElement.innerHTML = `
            <div class="message-content">${this.escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        this.elements.messages.appendChild(messageElement);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    displaySecretMessage(text, timestamp = Date.now(), isSent = false) {
        const messageElement = document.createElement('div');
        messageElement.className = 'secret-message';
        
        const time = new Date(timestamp).toLocaleString();
        messageElement.innerHTML = `
            <div class="text">${this.escapeHtml(text)}</div>
            <div class="time">${time}</div>
        `;
        
        if (isSent) {
            messageElement.style.opacity = '0.7';
            messageElement.style.borderLeftColor = '#28a745';
        }
        
        this.elements.secretMessagesList.appendChild(messageElement);
    }

    async loadSecretMessages() {
        try {
            const messages = await this.signaling.retrieveEncryptedMessages();
            this.elements.secretMessagesList.innerHTML = '';
            
            if (messages.length === 0) {
                this.elements.secretMessagesList.innerHTML = '<p style="color: #6c757d; font-style: italic;">No secret messages.</p>';
                return;
            }
            
            for (const messageData of messages) {
                try {
                    const decryptedText = await this.crypto.decryptMessage(messageData.encryptedBlob);
                    this.displaySecretMessage(decryptedText, messageData.timestamp);
                } catch (error) {
                    console.error('Failed to decrypt stored message:', error);
                    this.displaySecretMessage('🔒 [Failed to decrypt]', messageData.timestamp);
                }
            }
            
            if (messages.length > 0) {
                this.addSecretNotification();
            }
        } catch (error) {
            console.error('Failed to load secret messages:', error);
        }
    }

    addSecretNotification() {
        if (this.elements.liveTab.classList.contains('active')) {
            if (!this.elements.secretTab.querySelector('.notification')) {
                const notification = document.createElement('span');
                notification.className = 'notification';
                notification.textContent = '●';
                notification.style.cssText = 'color: #dc3545; font-size: 1.2rem; margin-left: 5px;';
                this.elements.secretTab.appendChild(notification);
            }
        }
    }

    switchToLiveTab() {
        this.elements.liveTab.classList.add('active');
        this.elements.secretTab.classList.remove('active');
        this.elements.messages.style.display = 'block';
        this.elements.secretMessages.style.display = 'none';
        this.elements.liveInputContainer.style.display = 'flex';
        this.elements.secretInputContainer.style.display = 'none';
    }

    switchToSecretTab() {
        this.elements.liveTab.classList.remove('active');
        this.elements.secretTab.classList.add('active');
        this.elements.messages.style.display = 'none';
        this.elements.secretMessages.style.display = 'block';
        this.elements.liveInputContainer.style.display = 'none';
        this.elements.secretInputContainer.style.display = 'flex';
        
        // Remove notification
        const notification = this.elements.secretTab.querySelector('.notification');
        if (notification) {
            notification.remove();
        }
    }

    async showChatInterface() {
        this.elements.chatContainer.style.display = 'block';
        this.elements.mediaControls.style.display = 'block';
    }

    updateConnectionStatus(status) {
        const statusElement = this.elements.connectionStatus;
        const statusText = {
            'ready': 'Ready',
            'waiting': 'Waiting for peer...',
            'connecting': 'Connecting...',
            'connected': '🔒 Connected & Encrypted',
            'disconnected': 'Disconnected',
            'failed': 'Connection Failed',
            'error': 'Error'
        };
        
        statusElement.textContent = statusText[status] || status;
        statusElement.className = `status ${status}`;
    }

    leaveRoom() {
        this.signaling.leaveRoom();
        this.crypto.clearKeys();
        this.webrtc.close();
        
        // Reset UI
        this.elements.connectionInfo.style.display = 'none';
        this.elements.chatContainer.style.display = 'none';
        this.elements.mediaControls.style.display = 'none';
        this.elements.videoContainer.style.display = 'none';
        this.elements.roomPassword.style.display = 'block';
        this.elements.joinRoom.style.display = 'block';
        this.elements.roomPassword.value = '';
        this.elements.messages.innerHTML = '';
        this.elements.secretMessagesList.innerHTML = '';
        
        this.currentRoomId = null;
        this.currentPassword = null;
        this.peerConnected = false;
        this.updateConnectionStatus('ready');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Media controls (simplified)
    async startCall() {
        try {
            const stream = await this.webrtc.startMediaCall(true);
            this.elements.localVideo.srcObject = stream;
            this.elements.videoContainer.style.display = 'block';
            this.elements.startCall.style.display = 'none';
            this.elements.endCall.style.display = 'inline-block';
        } catch (error) {
            console.error('Failed to start call:', error);
            alert('Failed to access camera/microphone');
        }
    }

    endCall() {
        this.webrtc.endCall();
        this.elements.localVideo.srcObject = null;
        this.elements.remoteVideo.srcObject = null;
        this.elements.videoContainer.style.display = 'none';
        this.elements.startCall.style.display = 'inline-block';
        this.elements.endCall.style.display = 'none';
    }

    toggleMute() {
        if (this.webrtc.localStream) {
            const audioTrack = this.webrtc.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.elements.toggleMute.textContent = audioTrack.enabled ? '🎤 Mute' : '🔇 Unmute';
            }
        }
    }

    toggleVideo() {
        if (this.webrtc.localStream) {
            const videoTrack = this.webrtc.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.elements.toggleVideo.textContent = videoTrack.enabled ? '📹 Video' : '📹 Video Off';
            }
        }
    }
}

const app = new SecureMessengerApp();
app.initialize();