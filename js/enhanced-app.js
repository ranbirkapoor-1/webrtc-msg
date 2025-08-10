/**
 * Enhanced Secure Messenger with Immediate Send & Offline Support
 */

import { WebRTCManager } from './webrtc.js';
import { EnhancedSignalingManager } from './enhanced-signaling.js';
import { EnhancedCryptoManager } from './enhanced-crypto.js';
import { MessageManager } from './message-manager.js';
import { WebRTCSecrets } from './webrtc-secrets.js';

class EnhancedSecureMessenger {
    constructor() {
        this.webrtc = new WebRTCManager();
        this.signaling = new EnhancedSignalingManager();
        this.crypto = new EnhancedCryptoManager();
        this.messageManager = null;
        
        this.isInRoom = false;
        this.roomId = null;
        this.sessionId = null;
        this.webrtcSecrets = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupWebRTCCallbacks();
        this.setupSignalingCallbacks();
        this.setupScrollBehavior();
        this.setupPageUnloadHandling();
    }

    initializeElements() {
        this.elements = {
            roomPassword: document.getElementById('roomPassword'),
            userAlias: document.getElementById('userAlias'),
            joinRoom: document.getElementById('joinRoom'),
            leaveRoom: document.getElementById('leaveRoom'),
            connectionStatus: document.getElementById('connectionStatus'),
            connectionInfo: document.getElementById('connectionInfo'),
            currentRoomId: document.getElementById('currentRoomId'),
            chatContainer: document.getElementById('chatContainer'),
            messages: document.getElementById('messages'),
            messageInput: document.getElementById('messageInput'),
            sendMessage: document.getElementById('sendMessage'),
            onlineMessages: document.getElementById('onlineMessages'),
            onlineMessagesList: document.getElementById('onlineMessagesList'),
            offlineInputContainer: document.getElementById('offlineInputContainer'),
            offlineTab: document.getElementById('offlineTab'),
            onlineTab: document.getElementById('onlineTab'),
            onlineSection: document.getElementById('onlineSection'),
            offlineSection: document.getElementById('offlineSection'),
            onlineInputContainer: document.getElementById('onlineInputContainer'),
            onlineMessageInput: document.getElementById('onlineMessageInput'),
            sendOnlineMessage: document.getElementById('sendOnlineMessage'),
            mediaControls: document.getElementById('onlineMediaControls'),
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
        this.elements.userAlias.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        this.elements.sendMessage.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        this.elements.sendOnlineMessage.addEventListener('click', () => this.sendOnlineMessage());
        this.elements.onlineMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendOnlineMessage();
        });

        
        this.elements.startCall.addEventListener('click', () => this.startCall());
        this.elements.endCall.addEventListener('click', () => this.endCall());
        this.elements.toggleMute.addEventListener('click', () => this.toggleMute());
        this.elements.toggleVideo.addEventListener('click', () => this.toggleVideo());
        
        this.elements.offlineTab.addEventListener('click', () => this.switchToOfflineTab());
        this.elements.onlineTab.addEventListener('click', () => this.switchToOnlineTab());
    }

    setupWebRTCCallbacks() {
        this.webrtc.onConnectionStateChange = (state) => {
            this.updateConnectionStatus(state);
            
            if (this.messageManager) {
                this.messageManager.isWebRTCConnected = (state === 'connected');
                if (this.messageManager.isWebRTCConnected) {
                    this.messageManager.processMessageQueue();
                }
            }
            
            setTimeout(() => {
                this.updateOnlineMessageStatus();
            }, 100);
        };

        this.webrtc.onIceCandidate = (candidate) => {
            this.signaling.sendIceCandidate(candidate);
        };

        this.webrtc.onRemoteStream = (stream) => {
            this.elements.remoteVideo.srcObject = stream;
            this.elements.videoContainer.style.display = 'block';
        };

        this.webrtc.onMessageReceived = async (data) => {
            if (data.type === 'webrtc_secret' && this.webrtcSecrets) {
                await this.webrtcSecrets.handleWebRTCSecret(data);
            } else if (data.type === 'encrypted_chat' && this.messageManager) {
                await this.messageManager.handleIncomingMessage(data, 'webrtc');
            }
        };
    }

    setupSignalingCallbacks() {
        this.signaling.onSignalingMessage = async (type, data) => {
            try {
                switch (type) {
                    case 'offer':
                        this.updateConnectionStatus('connecting');
                        if (!this.webrtc.peerConnection) {
                            await this.webrtc.createPeerConnection();
                        }
                        const answer = await this.webrtc.createAnswer(data.sdp);
                        await this.signaling.sendAnswer(answer);
                        break;
                    
                    case 'answer':
                        this.updateConnectionStatus('connecting');
                        await this.webrtc.handleAnswer(data.sdp);
                        break;
                    
                    case 'candidate':
                        await this.webrtc.addIceCandidate(data);
                        break;
                }
            } catch (error) {
                if (type === 'offer' || type === 'answer') {
                    this.updateConnectionStatus('failed');
                    setTimeout(() => {
                        this.updateConnectionStatus('ready');
                    }, 5000);
                }
            }
        };
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Enhanced Secure Messenger...');
            
            // Try initializing Firebase with retries
            let retries = 3;
            let initialized = false;
            
            while (retries > 0 && !initialized) {
                try {
                    await this.signaling.initialize();
                    initialized = true;
                    console.log('✅ Firebase initialized successfully');
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Firebase initialization failed, retries left: ${retries}`);
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        throw error;
                    }
                }
            }
            
            this.updateConnectionStatus('ready');
            console.log('✅ Application initialized');
        } catch (error) {
            console.error('❌ Failed to initialize:', error);
            this.updateConnectionStatus('error');
            
            // Provide more helpful error message
            const errorMsg = error.message.includes('Firebase') 
                ? 'Unable to connect to Firebase. Please check your internet connection and try refreshing the page.'
                : 'Failed to initialize. Please refresh the page and try again.';
            
            alert(errorMsg);
        }
    }

    /**
     * Ensure clean state before joining room
     */
    async ensureCleanState() {
        console.log('🧹 Ensuring clean state...');
        
        // Only close connections if we're already in a room
        if (this.isInRoom) {
            console.log('🔄 Already in room - cleaning up existing connections');
            
            // Close any existing connections
            if (this.webrtc) {
                this.webrtc.close();
            }
            
            // Reset message manager
            if (this.messageManager) {
                this.messageManager = null;
            }
            
            // Reset WebRTC secrets
            if (this.webrtcSecrets) {
                this.webrtcSecrets = null;
            }
        } else {
            console.log('🆕 First connection - minimal cleanup');
        }
        
        // Always clear processed signals cache
        if (this.signaling && this.signaling.processedSignals) {
            this.signaling.processedSignals.clear();
            console.log('🧹 Cleared processed signals cache');
        }
        
        // Reset connection state
        this.isInRoom = false;
        this.roomId = null;
        this.sessionId = null;
        
        console.log('✅ State cleaned for fresh connection');
    }

    /**
     * Join room with password and alias
     */
    async joinRoom() {
        const password = this.elements.roomPassword.value.trim();
        if (!password) {
            alert('Please enter a room key');
            return;
        }

        // Get alias from input field
        const alias = this.elements.userAlias.value.trim();
        if (!alias) {
            alert('Please enter an alias');
            return;
        }
        
        if (alias.length > 20) {
            alert('Alias must be 20 characters or less');
            return;
        }

        this.userAlias = alias;
        console.log('👤 User alias set to:', this.userAlias);

        try {
            console.log('🔐 Joining room with password...');
            this.updateConnectionStatus('connecting');

            // Validate that Firebase is initialized (skip for now to debug)
            console.log(`🔍 Firebase connection status: ${this.signaling.isConnected}`);
            // if (!this.signaling.isConnected) {
            //     throw new Error('Firebase not initialized. Please refresh the page.');
            // }

            // Ensure clean state before joining
            await this.ensureCleanState();

            // Initialize crypto with password
            this.roomId = await this.crypto.initialize(password);
            this.sessionId = this.crypto.getSessionId();

            console.log('🏠 Room ID:', this.roomId);
            console.log('👤 Session ID:', this.sessionId);

            // Check if room exists first
            const roomExists = await this.signaling.checkRoomExists(this.roomId);
            
            // Don't clean up signaling data - we need to receive offers from other peers
            console.log(roomExists ? '🏠 Room exists - preserving signaling data' : '🆕 New room');
            // Determine initiator status based on room state
            let isInitiator = !roomExists;
            
            if (roomExists) {
                // Room exists, but check if there are active participants
                const activeCheck = await this.signaling.checkActiveParticipants(this.roomId);
                if (!activeCheck.hasActive) {
                    // Room exists but no one is active - become initiator to restart the room
                    isInitiator = true;
                    console.log('🔄 Room exists but empty - restarting as initiator');
                } else {
                    console.log(`👥 Found ${activeCheck.count} active participant(s) - joining as responder`);
                }
            }

            console.log(isInitiator ? '👑 Creating/restarting room' : '🚪 Joining active room');

            // Join room in signaling with alias
            console.log('📡 Starting signaling setup...');
            await this.signaling.joinRoom(this.roomId, this.sessionId, isInitiator, this.userAlias);
            console.log('✅ Signaling setup complete');

            // Initialize message manager (for live chat with Firebase fallback)
            this.messageManager = new MessageManager(this.signaling, this.webrtc, this.crypto);
            this.messageManager.onMessageReceived = (message) => this.displayMessage(message);
            this.messageManager.initialize();

            // Initialize WebRTC online chat (for P2P-only direct messages)
            this.webrtcSecrets = new WebRTCSecrets(this.webrtc, this.crypto, this.signaling);
            this.webrtcSecrets.onSecretReceived = (secret) => this.displayOnlineMessage(secret.text, secret.timestamp, false, secret.ephemeral, secret.senderAlias);
            this.webrtcSecrets.initialize();

            // Set up WebRTC with error handling
            try {
                await this.webrtc.createPeerConnection();
                console.log('✅ WebRTC peer connection created');
            } catch (error) {
                console.error('❌ Failed to create WebRTC connection:', error);
                console.log('🔄 Continuing without WebRTC - you can still use Firebase chat');
            }

            if (isInitiator && this.webrtc.peerConnection) {
                // Create offer if we're the first one
                console.log('🚀 Creating WebRTC offer as initiator...');
                try {
                    const offer = await this.webrtc.createOffer();
                    await this.signaling.sendOffer(offer);
                    console.log('📤 WebRTC offer sent to Firebase');
                    
                    // Set connection timeout with more detailed logging
                    setTimeout(() => {
                        if (this.webrtc.peerConnection?.iceConnectionState !== 'connected' && 
                            this.webrtc.peerConnection?.iceConnectionState !== 'completed') {
                            console.warn('⏰ WebRTC P2P connection timeout');
                            console.log('💡 Direct messaging may not work, but Firebase chat is available');
                        }
                    }, 20000);
                    
                } catch (error) {
                    console.error('❌ Failed to create/send offer:', error);
                    console.log('🔄 WebRTC failed, but Firebase chat is still available');
                }
            } else if (!isInitiator) {
                // Load offline messages if joining existing room
                console.log('🔗 Joining existing room as responder...');
                try {
                    await this.messageManager.loadOfflineMessages();
                    console.log('📥 Waiting for WebRTC offer...');
                } catch (error) {
                    console.error('❌ Failed to load offline messages:', error);
                    // Continue anyway, messages can be loaded later
                }
            }

            // Show UI
            this.showRoomInterface();
            this.isInRoom = true;

            // Update connection status to show we're in the room
            this.updateConnectionStatus('in_room');

            // Start periodic cleanup
            this.startPeriodicTasks();

            console.log('🎉 Successfully joined room!');
            
        } catch (error) {
            console.error('❌ Failed to join room:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to join room';
            if (error.message.includes('Room is full')) {
                errorMessage = 'Room is full (maximum 3 participants). Please try a different room.';
            } else
            if (error.message.includes('Firebase')) {
                errorMessage = 'Connection failed. Please check your internet and try again.';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Connection timed out. Please try again with a stable connection.';
            } else if (error.message.includes('not initialized')) {
                errorMessage = 'App not ready. Please refresh the page and try again.';
            } else {
                errorMessage = `Failed to join room: ${error.message}`;
            }
            
            alert(errorMessage);
            this.updateConnectionStatus('error');
            
            // Reset to allow retry
            setTimeout(() => {
                this.updateConnectionStatus('ready');
            }, 3000);
        }
    }

    /**
     * Send message (works immediately, even if peer not connected)
     */
    async sendMessage() {
        if (!this.messageManager) {
            alert('Please join a room first');
            return;
        }

        const message = this.elements.messageInput.value.trim();
        if (!message) return;

        try {
            const success = await this.messageManager.sendMessage(message);
            
            if (success) {
                // Display immediately in UI with user's alias
                this.displayMessage({
                    text: message,
                    timestamp: Date.now(),
                    sender: 'local',
                    senderAlias: this.userAlias
                });
                
                this.elements.messageInput.value = '';
            } else {
                alert('Failed to send message');
            }
        } catch (error) {
            console.error('❌ Send failed:', error);
            alert('Failed to send message');
        }
    }

    /**
     * Send online message via WebRTC P2P only
     */
    async sendOnlineMessage() {
        if (!this.webrtcSecrets) {
            alert('Please join a room first');
            return;
        }

        const message = this.elements.onlineMessageInput.value.trim();
        if (!message) return;

        try {
            // Check if WebRTC is ready for online messages
            if (!this.webrtcSecrets.isReady()) {
                alert('Online messages require direct peer connection. Please wait for the other person to join.');
                return;
            }

            // Send online message via WebRTC P2P only (never touches Firebase)
            await this.webrtcSecrets.sendWebRTCSecret(message);
            
            // Display in UI as sent
            this.displayOnlineMessage(message, Date.now(), true, true, this.userAlias);
            this.elements.onlineMessageInput.value = '';
            
            // Show confirmation
            const button = this.elements.sendOnlineMessage;
            const originalText = button.textContent;
            const originalClass = button.className;
            button.textContent = 'sent';
            button.className = 'bg-green-600 text-white px-4 py-2 rounded font-medium text-sm';
            setTimeout(() => {
                button.textContent = originalText;
                button.className = originalClass;
            }, 2000);
            
        } catch (error) {
            console.error('❌ Failed to send online message:', error);
            alert('Failed to send online message: ' + error.message);
        }
    }

    /**
     * Display message in UI with smooth scrolling and sender alias
     */
    displayMessage(message) {
        // Hide placeholder messages when first real message arrives
        const messagesContainer = this.elements.messages.querySelector('.space-y-2');
        if (messagesContainer && !messagesContainer.classList.contains('has-real-messages')) {
            messagesContainer.classList.add('has-real-messages');
            console.log('📝 First real message - hiding placeholders');
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const sourceLabel = message.source ? ` (${message.source})` : '';
        
        // Show sender alias for received messages, "you" for sent messages
        let senderLabel = '';
        if (message.sender === 'remote' && message.senderAlias) {
            senderLabel = `<div class="message-sender">${this.escapeHtml(message.senderAlias)}</div>`;
        } else if (message.sender === 'local') {
            senderLabel = `<div class="message-sender">you</div>`;
        }
        
        messageElement.innerHTML = `
            <div class="message-wrapper">
                ${senderLabel}
                <div class="message-content">${this.escapeHtml(message.text)}</div>
                <div class="message-time">${time}${sourceLabel}</div>
            </div>
        `;
        
        this.elements.messages.appendChild(messageElement);
        this.scrollToBottom(this.elements.messages);
    }

    /**
     * Display online message with WebRTC indicators and smooth scrolling
     */
    displayOnlineMessage(text, timestamp, isSent = false, isEphemeral = false, senderAlias = null) {
        // Hide placeholder messages when first real message arrives
        const onlineMessagesContainer = this.elements.onlineMessagesList;
        if (onlineMessagesContainer && !onlineMessagesContainer.classList.contains('has-real-messages')) {
            onlineMessagesContainer.classList.add('has-real-messages');
            console.log('⚡ First online message - hiding placeholders');
        }
        
        const messageElement = document.createElement('div');
        // Use standard message classes for proper alignment
        messageElement.className = `message ${isSent ? 'local' : 'remote'} p2p-message`;
        
        if (isEphemeral) {
            messageElement.classList.add('ephemeral');
        }
        
        const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Show sender alias for received messages, "you" for sent messages
        let senderLabel = '';
        if (!isSent && senderAlias) {
            senderLabel = `<div class="message-sender">${this.escapeHtml(senderAlias)}</div>`;
        } else if (isSent) {
            senderLabel = `<div class="message-sender">you</div>`;
        }
        
        messageElement.innerHTML = `
            <div class="message-wrapper">
                ${senderLabel}
                <div class="message-content">
                    ${this.escapeHtml(text)}
                </div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        this.elements.onlineMessagesList.appendChild(messageElement);
        this.scrollToBottom(this.elements.onlineMessagesList);
        
        // Add notification if not on online tab
        if (!this.elements.onlineTab.classList.contains('active') && !isSent) {
            this.addOnlineNotification();
        }
        

    }





    /**
     * Update online message status based on WebRTC connection
     */
    updateOnlineMessageStatus() {
        if (!this.webrtcSecrets) return;

        const status = this.webrtcSecrets.getConnectionStatus();
        const onlineInput = this.elements.onlineMessageInput;
        const onlineButton = this.elements.sendOnlineMessage;
        const statusDot = document.getElementById('statusDot');
        const connectionText = document.getElementById('connectionText');

        switch (status) {
            case 'ready':
                onlineInput.placeholder = 'direct message...';
                onlineButton.disabled = false;
                onlineButton.textContent = 'send';
                onlineButton.className = 'bg-white text-black px-4 py-2 rounded font-medium hover:bg-gray-200 transition-colors text-sm';
                if (statusDot) {
                    statusDot.className = 'w-2 h-2 bg-green-500 rounded-full';
                }
                if (connectionText) {
                    connectionText.textContent = 'online';
                }
                break;
                
            case 'connecting':
                onlineInput.placeholder = 'connecting...';
                onlineButton.disabled = true;
                onlineButton.textContent = 'wait';
                onlineButton.className = 'bg-gray-600 text-white px-4 py-2 rounded font-medium text-sm cursor-not-allowed';
                if (statusDot) {
                    statusDot.className = 'w-2 h-2 bg-yellow-500 rounded-full';
                }
                if (connectionText) {
                    connectionText.textContent = 'connecting';
                }
                break;
                
            case 'disconnected':
            case 'no_connection':
            default:
                onlineInput.placeholder = 'peer offline...';
                onlineButton.disabled = true;
                onlineButton.textContent = 'offline';
                onlineButton.className = 'bg-gray-600 text-white px-4 py-2 rounded font-medium text-sm cursor-not-allowed';
                if (statusDot) {
                    statusDot.className = 'w-2 h-2 bg-red-500 rounded-full';
                }
                if (connectionText) {
                    connectionText.textContent = 'offline';
                }
                break;
        }
    }

    /**
     * Add notification to online tab
     */
    addOnlineNotification() {
        if (!this.elements.onlineTab.querySelector('.notification')) {
            const notification = document.createElement('span');
            notification.className = 'notification';
            notification.textContent = '●';
            notification.style.cssText = 'color: #dc3545; font-size: 1.2rem; margin-left: 5px;';
            this.elements.onlineTab.appendChild(notification);
        }
    }

    /**
     * Switch to offline chat tab
     */
    switchToOfflineTab() {
        // Remove active class from all tabs
        this.elements.offlineTab.classList.add('active');
        this.elements.onlineTab.classList.remove('active');
        
        // Update Tailwind classes for visual feedback
        this.elements.offlineTab.classList.add('text-white', 'border-white');
        this.elements.offlineTab.classList.remove('text-gray-400', 'border-transparent');
        
        this.elements.onlineTab.classList.add('text-gray-400', 'border-transparent');
        this.elements.onlineTab.classList.remove('text-white', 'border-white');
        
        // Show/hide sections
        this.elements.offlineSection.style.display = 'flex';
        this.elements.offlineSection.classList.remove('hidden');
        this.elements.onlineSection.style.display = 'none';
        this.elements.onlineSection.classList.add('hidden');
        
        console.log('📁 Switched to store tab');
    }

    /**
     * Switch to online chat tab
     */
    switchToOnlineTab() {
        try {
            console.log('🔄 Switching to online/direct tab...');
            
            // Remove active class from all tabs
            if (this.elements.offlineTab) {
                this.elements.offlineTab.classList.remove('active');
                this.elements.offlineTab.classList.add('text-gray-400', 'border-transparent');
                this.elements.offlineTab.classList.remove('text-white', 'border-white');
            }
            
            if (this.elements.onlineTab) {
                this.elements.onlineTab.classList.add('active');
                this.elements.onlineTab.classList.add('text-white', 'border-white');
                this.elements.onlineTab.classList.remove('text-gray-400', 'border-transparent');
                
                // Remove notification
                const notification = this.elements.onlineTab.querySelector('.notification');
                if (notification) {
                    notification.remove();
                }
            }
            
            // Show/hide sections
            if (this.elements.onlineSection) {
                this.elements.onlineSection.style.display = 'flex';
                this.elements.onlineSection.classList.remove('hidden');
            }
            
            if (this.elements.offlineSection) {
                this.elements.offlineSection.style.display = 'none';
                this.elements.offlineSection.classList.add('hidden');
            }
            
            console.log('✅ Successfully switched to direct tab');
            
        } catch (error) {
            console.error('❌ Error switching to online tab:', error);
            // Don't let tab switching errors break the connection
        }
    }

    /**
     * Show room interface with online chat tab open by default
     */
    showRoomInterface() {
        try {
            console.log('🎨 Updating UI to show room interface...');
            
            if (this.elements.currentRoomId) {
                this.elements.currentRoomId.textContent = this.roomId;
                console.log('✅ Room ID displayed');
            }
            
            if (this.elements.connectionInfo) {
                this.elements.connectionInfo.style.display = 'block';
                console.log('✅ Connection info shown');
            }
            
            if (this.elements.roomPassword) {
                this.elements.roomPassword.style.display = 'none';
                console.log('✅ Password input hidden');
            }
            
            if (this.elements.userAlias) {
                this.elements.userAlias.style.display = 'none';
                console.log('✅ Alias input hidden');
            }
            
            if (this.elements.joinRoom) {
                this.elements.joinRoom.style.display = 'none';
                console.log('✅ Join button hidden');
            }
            
            if (this.elements.chatContainer) {
                this.elements.chatContainer.style.display = 'block';
                console.log('✅ Chat container shown');
            }
            
            if (this.elements.mediaControls) {
                this.elements.mediaControls.style.display = 'block';
                console.log('✅ Media controls shown');
            }
            
            console.log('✅ Room interface UI update complete');
            
        } catch (error) {
            console.error('❌ Error updating room interface UI:', error);
            // Don't let UI errors break the connection
        }
        
        // Open online chat tab by default
        this.switchToOnlineTab();
        
        // Update online message status with small delay
        setTimeout(() => {
            this.updateOnlineMessageStatus();
        }, 1000);
        
        this.updateConnectionStatus('in_room');
    }

    /**
     * Leave room
     */
    async leaveRoom() {
        try {
            if (this.messageManager) {
                this.messageManager = null;
            }
            
            await this.signaling.leaveRoom();
            this.crypto.destroy();
            this.webrtc.close();
            
            // Reset UI
            this.elements.connectionInfo.style.display = 'none';
            this.elements.chatContainer.style.display = 'none';
            this.elements.mediaControls.style.display = 'none';
            this.elements.videoContainer.style.display = 'none';
            this.elements.roomPassword.style.display = 'block';
            this.elements.userAlias.style.display = 'block';
            this.elements.joinRoom.style.display = 'block';
            this.elements.roomPassword.value = '';
            this.elements.userAlias.value = '';
            this.elements.messages.innerHTML = '';
            this.elements.onlineMessagesList.innerHTML = '';
            
            this.isInRoom = false;
            this.roomId = null;
            this.sessionId = null;
            
            this.updateConnectionStatus('ready');
            
            console.log('👋 Left room successfully');
            
        } catch (error) {
            console.error('❌ Error leaving room:', error);
        }
    }

    /**
     * Start periodic tasks
     */
    startPeriodicTasks() {
        // Cleanup expired messages every 5 minutes
        setInterval(async () => {
            if (this.messageManager) {
                await this.messageManager.cleanupExpiredMessages();
            }
        }, 5 * 60 * 1000);

        // Update activity every 30 seconds
        setInterval(async () => {
            if (this.isInRoom) {
                await this.signaling.updateActivity();
                // Also update online message status periodically
                this.updateOnlineMessageStatus();
            }
        }, 30 * 1000);
    }

    /**
     * Update connection status display
     */
    updateConnectionStatus(status, details = '') {
        const statusElement = this.elements.connectionStatus;
        const statusDot = statusElement.querySelector('div');
        const statusText = statusElement.querySelector('span');
        
        const statusConfig = {
            'ready': { text: 'ready', color: 'bg-gray-500', title: 'Ready to connect' },
            'connecting': { text: 'connecting...', color: 'bg-yellow-500 animate-pulse', title: 'Establishing connection...' },
            'in_room': { text: 'in room', color: 'bg-green-500', title: 'Connected to room' },
            'connected': { text: 'p2p connected', color: 'bg-green-500', title: 'Direct P2P connection active' },
            'disconnected': { text: 'offline', color: 'bg-red-500', title: 'Connection lost' },
            'failed': { text: 'failed - retry?', color: 'bg-red-500', title: 'Connection failed - try again' },
            'error': { text: 'error - refresh?', color: 'bg-red-500', title: 'Error occurred - refresh page' },
            'partial': { text: 'firebase only', color: 'bg-orange-500', title: 'Firebase connected, P2P limited' }
        };
        
        const config = statusConfig[status] || { text: status, color: 'bg-red-500', title: 'Unknown status' };
        
        if (statusDot) {
            statusDot.className = `w-2 h-2 rounded-full ${config.color}`;
        }
        
        if (statusText) {
            statusText.textContent = config.text;
            statusText.title = details || config.title;
        }
        
        // Add visual feedback for errors
        if (status === 'error' || status === 'failed') {
            statusElement.style.cursor = 'pointer';
            statusElement.onclick = () => {
                if (confirm('Refresh the page to reset connection?')) {
                    window.location.reload();
                }
            };
        } else {
            statusElement.style.cursor = 'default';
            statusElement.onclick = null;
        }
    }

    /**
     * Smooth scroll to bottom of container
     */
    scrollToBottom(container, smooth = true) {
        if (!container) return;
        
        const shouldAutoScroll = this.shouldAutoScroll(container);
        if (!shouldAutoScroll) return; // Don't auto-scroll if user has scrolled up
        
        if (smooth) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            container.scrollTop = container.scrollHeight;
        }
    }

    /**
     * Check if we should auto-scroll (user hasn't scrolled up)
     */
    shouldAutoScroll(container) {
        if (!container) return true;
        
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const scrollTop = container.scrollTop;
        
        // Consider "at bottom" if within 100px of the bottom
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
        
        return isNearBottom;
    }

    /**
     * Set up scroll behavior for chat containers
     */
    setupScrollBehavior() {
        // Add scroll event listeners to detect user scrolling
        if (this.elements.messages) {
            this.elements.messages.classList.add('scrollbar-hide');
            this.elements.messages.addEventListener('scroll', () => {
                // User is actively scrolling, this will be checked by shouldAutoScroll
            });
        }
        
        if (this.elements.onlineMessagesList) {
            this.elements.onlineMessagesList.classList.add('scrollbar-hide');
            this.elements.onlineMessagesList.addEventListener('scroll', () => {
                // User is actively scrolling, this will be checked by shouldAutoScroll
            });
        }
    }

    /**
     * Set up page unload handling to clean up room when user closes browser
     */
    setupPageUnloadHandling() {
        // Clean up when page is about to unload
        window.addEventListener('beforeunload', () => {
            if (this.isInRoom) {
                // Use synchronous cleanup to ensure it happens before page closes
                this.cleanupBeforeUnload();
            }
        });

        // Also clean up on visibility change (tab switch)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.isInRoom) {
                // Update last seen time when tab becomes hidden
                this.signaling?.updateActivity();
            }
        });
    }

    /**
     * Synchronous cleanup before page unload
     */
    cleanupBeforeUnload() {
        try {
            if (this.signaling && this.signaling.roomRef && this.signaling.sessionId) {
                // Mark participant as inactive immediately
                const roomRef = this.signaling.roomRef;
                const sessionId = this.signaling.sessionId;
                
                // Use synchronous Firebase operation
                if (this.signaling.firebaseRefs) {
                    this.signaling.firebaseRefs.set(
                        this.signaling.firebaseRefs.ref(
                            this.signaling.database, 
                            `rooms/${this.signaling.currentRoomId}/participants/${sessionId}/active`
                        ), 
                        false
                    );
                    
                    this.signaling.firebaseRefs.set(
                        this.signaling.firebaseRefs.ref(
                            this.signaling.database, 
                            `rooms/${this.signaling.currentRoomId}/participants/${sessionId}/left`
                        ), 
                        Date.now()
                    );
                }
            }
            
            // Close WebRTC connection
            if (this.webrtc) {
                this.webrtc.close();
            }
        } catch (error) {
            console.warn('⚠️ Failed to cleanup before unload:', error);
        }
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Enhanced Media controls
    async startCall() {
        try {
            console.log('📞 Starting video call...');
            
            // Check if we're connected first
            if (!this.isInRoom) {
                alert('Please connect to a room first');
                return;
            }
            
            const stream = await this.webrtc.startMediaCall(true, true);
            this.elements.localVideo.srcObject = stream;
            this.elements.videoContainer.style.display = 'block';
            this.elements.startCall.style.display = 'none';
            this.elements.endCall.style.display = 'inline-block';
            
            // Update button states
            this.updateMediaControlsState();
            
            console.log('✅ Video call started successfully');
        } catch (error) {
            console.error('❌ Failed to start call:', error);
            let errorMsg = 'Failed to access camera/microphone. ';
            
            if (error.name === 'NotAllowedError') {
                errorMsg += 'Please allow camera and microphone access.';
            } else if (error.name === 'NotFoundError') {
                errorMsg += 'No camera or microphone found.';
            } else if (error.name === 'NotReadableError') {
                errorMsg += 'Camera/microphone is already in use.';
            } else {
                errorMsg += error.message;
            }
            
            alert(errorMsg);
        }
    }

    endCall() {
        console.log('📞 Ending video call...');
        
        this.webrtc.endCall();
        this.elements.localVideo.srcObject = null;
        this.elements.remoteVideo.srcObject = null;
        this.elements.videoContainer.style.display = 'none';
        this.elements.startCall.style.display = 'inline-block';
        this.elements.endCall.style.display = 'none';
        
        // Reset button states
        this.elements.toggleMute.textContent = 'mute';
        this.elements.toggleVideo.textContent = 'video';
        
        console.log('✅ Video call ended');
    }

    toggleMute() {
        const isEnabled = this.webrtc.toggleAudio();
        this.elements.toggleMute.textContent = isEnabled ? 'mute' : 'unmuted';
        this.elements.toggleMute.className = isEnabled 
            ? 'bg-gray-700 text-white px-3 py-2 rounded font-medium hover:bg-gray-600 transition-colors text-sm'
            : 'bg-red-600 text-white px-3 py-2 rounded font-medium hover:bg-red-700 transition-colors text-sm';
    }

    toggleVideo() {
        const isEnabled = this.webrtc.toggleVideo();
        this.elements.toggleVideo.textContent = isEnabled ? 'video' : 'video off';
        this.elements.toggleVideo.className = isEnabled
            ? 'bg-gray-700 text-white px-3 py-2 rounded font-medium hover:bg-gray-600 transition-colors text-sm'
            : 'bg-red-600 text-white px-3 py-2 rounded font-medium hover:bg-red-700 transition-colors text-sm';
    }

    updateMediaControlsState() {
        // Update mute/video button states based on current stream
        if (this.webrtc.localStream) {
            const audioTrack = this.webrtc.localStream.getAudioTracks()[0];
            const videoTrack = this.webrtc.localStream.getVideoTracks()[0];
            
            if (audioTrack) {
                this.elements.toggleMute.textContent = audioTrack.enabled ? 'mute' : 'unmuted';
                this.elements.toggleMute.className = audioTrack.enabled 
                    ? 'bg-gray-700 text-white px-3 py-2 rounded font-medium hover:bg-gray-600 transition-colors text-sm'
                    : 'bg-red-600 text-white px-3 py-2 rounded font-medium hover:bg-red-700 transition-colors text-sm';
            }
            
            if (videoTrack) {
                this.elements.toggleVideo.textContent = videoTrack.enabled ? 'video' : 'video off';
                this.elements.toggleVideo.className = videoTrack.enabled
                    ? 'bg-gray-700 text-white px-3 py-2 rounded font-medium hover:bg-gray-600 transition-colors text-sm'
                    : 'bg-red-600 text-white px-3 py-2 rounded font-medium hover:bg-red-700 transition-colors text-sm';
            }
        }
    }
}

// Initialize the application
const app = new EnhancedSecureMessenger();
app.initialize();