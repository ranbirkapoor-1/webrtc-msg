import { WebRTCManager } from './webrtc.js';
import { SignalingManager } from './signaling.js';

class MessengerApp {
    constructor() {
        this.webrtc = new WebRTCManager();
        this.signaling = new SignalingManager();
        this.isInitiator = false;
        this.currentRoomId = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupWebRTCCallbacks();
        this.setupSignalingCallbacks();
    }

    initializeElements() {
        this.elements = {
            roomId: document.getElementById('roomId'),
            createRoom: document.getElementById('createRoom'),
            joinRoom: document.getElementById('joinRoom'),
            connectionStatus: document.getElementById('connectionStatus'),
            connectionInfo: document.getElementById('connectionInfo'),
            currentRoomId: document.getElementById('currentRoomId'),
            copyRoomId: document.getElementById('copyRoomId'),
            chatContainer: document.getElementById('chatContainer'),
            messages: document.getElementById('messages'),
            messageInput: document.getElementById('messageInput'),
            sendMessage: document.getElementById('sendMessage'),
            mediaControls: document.getElementById('mediaControls'),
            startCall: document.getElementById('startCall'),
            endCall: document.getElementById('endCall'),
            toggleMute: document.getElementById('toggleMute'),
            toggleVideo: document.getElementById('toggleVideo'),
            videoContainer: document.getElementById('videoContainer'),
            localVideo: document.getElementById('localVideo'),
            remoteVideo: document.getElementById('remoteVideo'),
            liveTab: document.getElementById('liveTab'),
            offlineTab: document.getElementById('offlineTab'),
            offlineMessages: document.getElementById('offlineMessages'),
            offlineMessagesList: document.getElementById('offlineMessagesList'),
            liveInputContainer: document.getElementById('liveInputContainer'),
            offlineInputContainer: document.getElementById('offlineInputContainer'),
            senderName: document.getElementById('senderName'),
            offlineMessageInput: document.getElementById('offlineMessageInput'),
            sendOfflineMessage: document.getElementById('sendOfflineMessage')
        };
    }

    setupEventListeners() {
        this.elements.createRoom.addEventListener('click', () => this.createRoom());
        this.elements.joinRoom.addEventListener('click', () => this.joinRoom());
        this.elements.copyRoomId.addEventListener('click', () => this.copyRoomId());
        this.elements.sendMessage.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        this.elements.startCall.addEventListener('click', () => this.startCall());
        this.elements.endCall.addEventListener('click', () => this.endCall());
        this.elements.toggleMute.addEventListener('click', () => this.toggleMute());
        this.elements.toggleVideo.addEventListener('click', () => this.toggleVideo());
        
        // Offline messaging
        this.elements.liveTab.addEventListener('click', () => this.switchToLiveTab());
        this.elements.offlineTab.addEventListener('click', () => this.switchToOfflineTab());
        this.elements.sendOfflineMessage.addEventListener('click', () => this.sendOfflineMessage());
        this.elements.offlineMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendOfflineMessage();
        });
    }

    setupWebRTCCallbacks() {
        this.webrtc.onMessageReceived = (data) => {
            if (data.type === 'message') {
                this.displayMessage(data.text, 'remote', data.timestamp);
            }
        };

        this.webrtc.onConnectionStateChange = (state) => {
            this.updateConnectionStatus(state);
            if (state === 'connected') {
                this.showChatInterface();
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
            console.log(`📨 Received ${type} message:`, data);
            
            switch (type) {
                case 'offer':
                    if (!this.isInitiator) {
                        console.log('🔄 Processing offer as joiner...');
                        await this.webrtc.createPeerConnection();
                        const answer = await this.webrtc.createAnswer(data.sdp);
                        console.log('✅ Answer created:', answer);
                        await this.signaling.sendAnswer(answer);
                        console.log('✅ Answer sent');
                    } else {
                        console.log('⚠️ Ignoring offer (I am initiator)');
                    }
                    break;
                
                case 'answer':
                    if (this.isInitiator) {
                        console.log('🔄 Processing answer as initiator...');
                        await this.webrtc.handleAnswer(data.sdp);
                        console.log('✅ Answer processed');
                    } else {
                        console.log('⚠️ Ignoring answer (I am joiner)');
                    }
                    break;
                
                case 'candidate':
                    console.log('🔄 Processing ICE candidate...');
                    await this.webrtc.addIceCandidate(data);
                    break;
            }
        };
    }

    async initialize() {
        try {
            console.log('🔄 Initializing Firebase...');
            await this.signaling.initialize();
            console.log('✅ Firebase initialized successfully');
            this.updateConnectionStatus('ready');
        } catch (error) {
            console.error('❌ Failed to initialize:', error);
            this.updateConnectionStatus('error');
            alert('Failed to initialize Firebase. Please check your configuration.');
        }
    }

    async createRoom() {
        try {
            console.log('🔄 Creating room...');
            this.isInitiator = true;
            await this.webrtc.createPeerConnection();
            console.log('✅ WebRTC peer connection created');
            
            const roomId = await this.signaling.createRoom();
            this.currentRoomId = roomId;
            console.log('✅ Room created with ID:', roomId);
            
            this.elements.currentRoomId.textContent = roomId;
            this.elements.connectionInfo.style.display = 'block';
            this.updateConnectionStatus('waiting');

            const offer = await this.webrtc.createOffer();
            console.log('✅ Offer created:', offer);
            await this.signaling.sendOffer(offer);
            console.log('✅ Offer sent to Firebase');
            
        } catch (error) {
            console.error('❌ Failed to create room:', error);
            alert('Failed to create room');
        }
    }

    async joinRoom() {
        const roomId = this.elements.roomId.value.trim();
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        try {
            console.log('🔄 Checking if room exists:', roomId);
            const roomExists = await this.signaling.checkRoomExists(roomId);
            console.log('Room exists:', roomExists);
            
            if (!roomExists) {
                alert('Room not found');
                return;
            }

            this.isInitiator = false;
            this.currentRoomId = roomId;
            console.log('🔄 Joining room:', roomId);
            
            await this.signaling.joinRoom(roomId, false);
            this.elements.currentRoomId.textContent = roomId;
            this.elements.connectionInfo.style.display = 'block';
            this.updateConnectionStatus('connecting');
            console.log('✅ Successfully joined room');
            
        } catch (error) {
            console.error('❌ Failed to join room:', error);
            alert('Failed to join room');
        }
    }

    copyRoomId() {
        if (this.currentRoomId) {
            navigator.clipboard.writeText(this.currentRoomId).then(() => {
                const button = this.elements.copyRoomId;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            });
        }
    }

    sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message) return;

        if (this.webrtc.sendMessage(message)) {
            this.displayMessage(message, 'local');
            this.elements.messageInput.value = '';
        } else {
            alert('Connection not ready. Please wait.');
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async showChatInterface() {
        this.elements.chatContainer.style.display = 'block';
        this.elements.mediaControls.style.display = 'block';
        
        // Load any offline messages when showing chat interface
        await this.loadOfflineMessages();
        
        // Set up listener for new offline messages
        this.signaling.setupOfflineMessageListener((messageData) => {
            this.displayOfflineMessage(messageData);
        });
    }

    updateConnectionStatus(status) {
        const statusElement = this.elements.connectionStatus;
        statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        statusElement.className = `status ${status}`;
    }

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

    switchToLiveTab() {
        this.elements.liveTab.classList.add('active');
        this.elements.offlineTab.classList.remove('active');
        this.elements.messages.style.display = 'block';
        this.elements.offlineMessages.style.display = 'none';
        this.elements.liveInputContainer.style.display = 'flex';
        this.elements.offlineInputContainer.style.display = 'none';
    }

    switchToOfflineTab() {
        this.elements.liveTab.classList.remove('active');
        this.elements.offlineTab.classList.add('active');
        this.elements.messages.style.display = 'none';
        this.elements.offlineMessages.style.display = 'block';
        this.elements.liveInputContainer.style.display = 'none';
        this.elements.offlineInputContainer.style.display = 'flex';
    }

    async sendOfflineMessage() {
        const message = this.elements.offlineMessageInput.value.trim();
        const senderName = this.elements.senderName.value.trim() || 'Anonymous';
        
        if (!message) {
            alert('Please enter a message');
            return;
        }

        try {
            await this.signaling.sendOfflineMessage(message, senderName);
            this.elements.offlineMessageInput.value = '';
            
            // Show confirmation
            const button = this.elements.sendOfflineMessage;
            const originalText = button.textContent;
            button.textContent = '✅ Sent!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        } catch (error) {
            console.error('Failed to send offline message:', error);
            alert('Failed to send message');
        }
    }

    async loadOfflineMessages() {
        try {
            const messages = await this.signaling.getOfflineMessages();
            this.elements.offlineMessagesList.innerHTML = '';
            
            if (messages.length === 0) {
                this.elements.offlineMessagesList.innerHTML = '<p style="color: #6c757d; font-style: italic;">No messages yet.</p>';
                return;
            }
            
            messages.forEach(message => {
                this.displayOfflineMessage(message);
            });
        } catch (error) {
            console.error('Failed to load offline messages:', error);
        }
    }

    displayOfflineMessage(messageData) {
        const messageElement = document.createElement('div');
        messageElement.className = 'offline-message';
        
        const time = new Date(messageData.timestamp).toLocaleString();
        messageElement.innerHTML = `
            <div class="sender">${this.escapeHtml(messageData.senderName)}</div>
            <div class="text">${this.escapeHtml(messageData.text)}</div>
            <div class="time">${time}</div>
        `;
        
        this.elements.offlineMessagesList.appendChild(messageElement);
        
        // Add notification badge to offline tab if we're on live tab
        if (this.elements.liveTab.classList.contains('active')) {
            this.elements.offlineTab.style.position = 'relative';
            if (!this.elements.offlineTab.querySelector('.badge')) {
                const badge = document.createElement('span');
                badge.className = 'badge';
                badge.textContent = '●';
                badge.style.cssText = 'color: #dc3545; font-size: 1.5rem; position: absolute; top: 5px; right: 10px;';
                this.elements.offlineTab.appendChild(badge);
            }
        }
    }
}

const app = new MessengerApp();
app.initialize();