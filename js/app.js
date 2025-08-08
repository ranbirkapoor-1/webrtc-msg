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
            remoteVideo: document.getElementById('remoteVideo')
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
            switch (type) {
                case 'offer':
                    if (!this.isInitiator) {
                        await this.webrtc.createPeerConnection();
                        const answer = await this.webrtc.createAnswer(data);
                        await this.signaling.sendAnswer(answer);
                    }
                    break;
                
                case 'answer':
                    if (this.isInitiator) {
                        await this.webrtc.handleAnswer(data);
                    }
                    break;
                
                case 'candidate':
                    await this.webrtc.addIceCandidate(data);
                    break;
            }
        };
    }

    async initialize() {
        try {
            await this.signaling.initialize();
            this.updateConnectionStatus('ready');
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.updateConnectionStatus('error');
            alert('Failed to initialize Firebase. Please check your configuration.');
        }
    }

    async createRoom() {
        try {
            this.isInitiator = true;
            await this.webrtc.createPeerConnection();
            
            const roomId = await this.signaling.createRoom();
            this.currentRoomId = roomId;
            
            this.elements.currentRoomId.textContent = roomId;
            this.elements.connectionInfo.style.display = 'block';
            this.updateConnectionStatus('waiting');

            const offer = await this.webrtc.createOffer();
            await this.signaling.sendOffer(offer);
            
        } catch (error) {
            console.error('Failed to create room:', error);
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
            const roomExists = await this.signaling.checkRoomExists(roomId);
            if (!roomExists) {
                alert('Room not found');
                return;
            }

            this.isInitiator = false;
            this.currentRoomId = roomId;
            
            await this.signaling.joinRoom(roomId, false);
            this.elements.currentRoomId.textContent = roomId;
            this.elements.connectionInfo.style.display = 'block';
            this.updateConnectionStatus('connecting');
            
        } catch (error) {
            console.error('Failed to join room:', error);
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

    showChatInterface() {
        this.elements.chatContainer.style.display = 'block';
        this.elements.mediaControls.style.display = 'block';
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
}

const app = new MessengerApp();
app.initialize();