import { webrtcConfig } from './config.js';

export class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.localStream = null;
        this.onMessageReceived = null;
        this.onConnectionStateChange = null;
        this.isInitiator = false;
        this.iceCandidateBuffer = [];
        this.iceTimeoutId = null;
    }

    async createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(webrtcConfig);
        console.log('🔗 Peer connection created with config:', webrtcConfig);

        this.peerConnection.onicecandidate = (event) => {
            console.log('🧊 ICE candidate event:', event.candidate);
            
            if (event.candidate) {
                // Log candidate type for debugging
                const candidate = event.candidate;
                const candidateType = candidate.type || 'unknown';
                const candidateProtocol = candidate.protocol || 'unknown';
                const candidateAddress = candidate.address || 'unknown';
                
                console.log(`📊 ICE Candidate: ${candidateType} (${candidateProtocol}) - ${candidateAddress}`);
                
                if (this.onIceCandidate) {
                    this.onIceCandidate(event.candidate);
                }
            } else {
                console.log('🏁 ICE candidate gathering complete (null candidate)');
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('🔄 Connection state changed:', this.peerConnection.connectionState);
            console.log('📊 Connection stats:', {
                connectionState: this.peerConnection.connectionState,
                iceConnectionState: this.peerConnection.iceConnectionState,
                signalingState: this.peerConnection.signalingState,
                iceGatheringState: this.peerConnection.iceGatheringState,
                hasDataChannel: !!this.dataChannel,
                dataChannelState: this.dataChannel?.readyState
            });
            
            // Trigger connection state change callback
            if (this.onConnectionStateChange) {
                // Map WebRTC states to our app states
                let appState = this.peerConnection.connectionState;
                if (appState === 'connected' && this.dataChannel?.readyState === 'open') {
                    appState = 'connected';
                } else if (appState === 'connecting' || this.peerConnection.iceConnectionState === 'checking') {
                    appState = 'connecting';
                } else if (appState === 'failed' || this.peerConnection.iceConnectionState === 'failed') {
                    appState = 'failed';
                }
                this.onConnectionStateChange(appState);
            }
        };

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('📺 Remote stream received:', event);
            console.log('📹 Tracks:', event.track);
            console.log('🎦 Streams:', event.streams);
            
            if (event.streams && event.streams[0]) {
                const remoteStream = event.streams[0];
                console.log('✅ Setting remote stream with tracks:', remoteStream.getTracks().length);
                if (this.onRemoteStream) {
                    this.onRemoteStream(remoteStream);
                }
            } else {
                console.warn('⚠️ No streams in track event, creating manual stream');
                // Create a stream with the track if no stream is provided
                const remoteStream = new MediaStream([event.track]);
                if (this.onRemoteStream) {
                    this.onRemoteStream(remoteStream);
                }
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE connection state changed:', this.peerConnection.iceConnectionState);
            
            // Clear any existing timeout
            if (this.iceTimeoutId) {
                clearTimeout(this.iceTimeoutId);
            }
            
            switch (this.peerConnection.iceConnectionState) {
                case 'checking':
                    console.log('⏳ ICE connectivity checking... Setting 30s timeout');
                    this.iceTimeoutId = setTimeout(() => {
                        console.warn('⏰ ICE connection timeout, attempting restart...');
                        this.restartIce();
                    }, 30000);
                    break;
                    
                case 'connected':
                case 'completed':
                    console.log('✅ ICE connection successful!');
                    if (this.onConnectionStateChange) {
                        this.onConnectionStateChange('connected');
                    }
                    break;
                    
                case 'failed':
                    console.warn('❌ ICE connection failed, attempting restart...');
                    this.restartIce();
                    break;
                    
                case 'disconnected':
                    console.warn('⚠️ ICE connection disconnected, waiting for reconnection...');
                    this.iceTimeoutId = setTimeout(() => {
                        if (this.peerConnection.iceConnectionState === 'disconnected') {
                            console.warn('🔄 Still disconnected, attempting restart...');
                            this.restartIce();
                        }
                    }, 10000);
                    break;
            }
        };

        this.peerConnection.onicegatheringstatechange = () => {
            console.log('📡 ICE gathering state changed:', this.peerConnection.iceGatheringState);
        };

        this.peerConnection.onsignalingstatechange = () => {
            console.log('📶 Signaling state changed:', this.peerConnection.signalingState);
        };

        this.peerConnection.ondatachannel = (event) => {
            console.log('📡 Data channel received:', event.channel);
            const channel = event.channel;
            this.setupDataChannel(channel);
        };

    }

    createDataChannel() {
        if (!this.peerConnection) return;
        
        this.dataChannel = this.peerConnection.createDataChannel('messages', {
            ordered: true
        });
        
        this.setupDataChannel(this.dataChannel);
    }

    setupDataChannel(channel) {
        console.log('🔧 Setting up data channel:', channel.label);
        console.log('📊 Data channel initial state:', channel.readyState);
        
        channel.onopen = () => {
            console.log('✅ Data channel opened! Ready for messaging');
            console.log('📊 Data channel state:', channel.readyState);
            console.log('📊 Peer connection state:', this.peerConnection?.connectionState);
            console.log('📊 ICE connection state:', this.peerConnection?.iceConnectionState);
            
            // Clear any ICE timeouts since data channel is working
            if (this.iceTimeoutId) {
                clearTimeout(this.iceTimeoutId);
                this.iceTimeoutId = null;
            }
            
            // Trigger connection state change when data channel opens - this is the key event
            console.log('🎉 Data channel open - triggering connected state');
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange('connected');
            }
            
            // Send a test message to verify the channel
            setTimeout(() => {
                try {
                    channel.send(JSON.stringify({
                        type: 'connection_test',
                        timestamp: Date.now()
                    }));
                    console.log('🧪 Connection test message sent');
                } catch (error) {
                    console.warn('⚠️ Failed to send test message:', error);
                }
            }, 500);
        };

        channel.onmessage = (event) => {
            console.log('📨 Data channel message received:', event.data);
            
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'connection_test') {
                    console.log('🧪 Connection test message received - connection verified!');
                    return;
                }
                
                if (this.onMessageReceived) {
                    this.onMessageReceived(data);
                }
            } catch (error) {
                console.warn('⚠️ Failed to parse data channel message:', error);
            }
        };

        channel.onerror = (error) => {
            console.error('❌ Data channel error:', error);
        };

        channel.onclose = () => {
            console.log('🔒 Data channel closed');
            
            // Trigger connection state change when data channel closes
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange('disconnected');
            }
        };

        this.dataChannel = channel;
    }

    async createOffer() {
        if (!this.peerConnection) return null;
        
        console.log('🔧 Creating data channel for initiator...');
        this.createDataChannel();
        
        console.log('📋 Creating WebRTC offer...');
        const offer = await this.peerConnection.createOffer();
        
        console.log('📝 Setting local description...');
        await this.peerConnection.setLocalDescription(offer);
        
        console.log('✅ Offer created successfully');
        return offer;
    }

    async createAnswer(offer) {
        if (!this.peerConnection) return null;
        
        console.log('📥 Setting remote description (offer)...');
        console.log('📋 Offer SDP type:', offer.type);
        console.log('📋 Offer SDP content (first 200 chars):', offer.sdp?.substring(0, 200));
        
        // Validate the offer format
        if (!offer || !offer.type || !offer.sdp) {
            throw new Error('Invalid offer format - missing type or sdp');
        }
        
        // Create RTCSessionDescription object if needed
        const offerDesc = new RTCSessionDescription({
            type: offer.type,
            sdp: offer.sdp
        });
        
        await this.peerConnection.setRemoteDescription(offerDesc);
        
        // Process any buffered ICE candidates now that we have remote description
        await this.processBufferedCandidates();
        
        console.log('📋 Creating WebRTC answer...');
        const answer = await this.peerConnection.createAnswer();
        
        console.log('📝 Setting local description (answer)...');
        await this.peerConnection.setLocalDescription(answer);
        
        console.log('✅ Answer created successfully');
        return answer;
    }

    async handleAnswer(answer) {
        if (!this.peerConnection) return;
        
        console.log('🔍 Handling answer. Current state:', this.peerConnection.signalingState);
        console.log('📄 Answer SDP type:', answer.type);
        console.log('📄 Answer SDP content (first 200 chars):', answer.sdp?.substring(0, 200));
        
        // Only set remote description if we're in the correct state
        if (this.peerConnection.signalingState === 'have-local-offer') {
            try {
                // Validate the answer format
                if (!answer || !answer.type || !answer.sdp) {
                    throw new Error('Invalid answer format - missing type or sdp');
                }
                
                // Create RTCSessionDescription object if needed
                const answerDesc = new RTCSessionDescription({
                    type: answer.type,
                    sdp: answer.sdp
                });
                
                await this.peerConnection.setRemoteDescription(answerDesc);
                console.log('✅ Remote description set successfully');
                
                // Process any buffered ICE candidates now that we have remote description
                await this.processBufferedCandidates();
            } catch (error) {
                console.error('❌ Failed to set remote description:', error);
                throw error;
            }
        } else {
            console.warn('Ignoring answer - wrong signaling state:', this.peerConnection.signalingState);
        }
    }

    async addIceCandidate(candidate) {
        if (!this.peerConnection) return;
        
        console.log('🧊 Adding ICE candidate:', candidate);
        console.log('📊 Current connection states:', {
            hasRemoteDescription: !!this.peerConnection.remoteDescription,
            signalingState: this.peerConnection.signalingState,
            iceConnectionState: this.peerConnection.iceConnectionState
        });
        
        // Validate candidate format
        if (!candidate || !candidate.candidate) {
            console.warn('⚠️ Invalid ICE candidate format');
            return;
        }
        
        // Create RTCIceCandidate object if needed
        const iceCandidate = candidate instanceof RTCIceCandidate ? 
            candidate : new RTCIceCandidate(candidate);
        
        // Only add ICE candidates if we have remote description set
        if (this.peerConnection.remoteDescription) {
            try {
                await this.peerConnection.addIceCandidate(iceCandidate);
                console.log('✅ ICE candidate added successfully');
            } catch (error) {
                console.warn('❌ Failed to add ICE candidate:', error);
            }
        } else {
            console.warn('⏳ Buffering ICE candidate - no remote description yet');
            this.iceCandidateBuffer.push(iceCandidate);
        }
    }

    async processBufferedCandidates() {
        console.log(`🔄 Processing ${this.iceCandidateBuffer.length} buffered ICE candidates`);
        
        while (this.iceCandidateBuffer.length > 0) {
            const candidate = this.iceCandidateBuffer.shift();
            try {
                // Ensure it's an RTCIceCandidate object
                const iceCandidate = candidate instanceof RTCIceCandidate ? 
                    candidate : new RTCIceCandidate(candidate);
                    
                await this.peerConnection.addIceCandidate(iceCandidate);
                console.log('✅ Buffered ICE candidate added successfully');
            } catch (error) {
                console.warn('❌ Failed to add buffered ICE candidate:', error);
            }
        }
    }

    async restartIce() {
        try {
            console.log('🔄 Restarting ICE...');
            
            if (this.peerConnection && this.peerConnection.restartIce) {
                await this.peerConnection.restartIce();
                console.log('✅ ICE restart initiated');
            } else {
                console.warn('⚠️ ICE restart not supported, trying connection reset...');
                // Force a new offer/answer exchange
                if (this.onConnectionStateChange) {
                    this.onConnectionStateChange('failed');
                }
            }
        } catch (error) {
            console.error('❌ Failed to restart ICE:', error);
        }
    }

    sendMessage(messagePayload) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try {
                console.log('📤 Sending message via WebRTC data channel:', messagePayload.id);
                
                // Send the full encrypted message payload
                this.dataChannel.send(JSON.stringify(messagePayload));
                console.log('✅ Message sent successfully via WebRTC');
                return true;
            } catch (error) {
                console.error('❌ Failed to send WebRTC message:', error);
                return false;
            }
        } else {
            console.log('⚠️ WebRTC data channel not ready, state:', this.dataChannel?.readyState);
            return false;
        }
    }

    async startMediaCall(video = false, audio = true) {
        try {
            console.log('📞 Starting media call with video:', video, 'audio:', audio);
            
            const mediaConstraints = {
                audio: audio ? {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                } : false,
                video: video ? {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30, max: 60 }
                } : false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            console.log('✅ Media stream acquired');

            // Add tracks to peer connection if it exists
            if (this.peerConnection) {
                this.localStream.getTracks().forEach(track => {
                    console.log('➕ Adding track to peer connection:', track.kind);
                    this.peerConnection.addTrack(track, this.localStream);
                });
                
                // Renegotiate connection if already established
                if (this.peerConnection.connectionState === 'connected') {
                    console.log('🔄 Renegotiating connection for new media tracks');
                    await this.renegotiateConnection();
                }
            }

            return this.localStream;
        } catch (error) {
            console.error('❌ Error accessing media devices:', error);
            throw error;
        }
    }

    async renegotiateConnection() {
        try {
            if (this.isInitiator) {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                // Send the new offer via signaling
                if (this.onIceCandidate) {
                    // This would need to be connected to the signaling system
                    console.log('📤 New offer created for renegotiation');
                }
            }
        } catch (error) {
            console.error('❌ Failed to renegotiate connection:', error);
        }
    }

    endCall() {
        console.log('📞 Ending media call');
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                console.log('⏹️ Stopping track:', track.kind);
                track.stop();
            });
            this.localStream = null;
        }
        
        // Remove tracks from peer connection
        if (this.peerConnection) {
            this.peerConnection.getSenders().forEach(sender => {
                if (sender.track) {
                    this.peerConnection.removeTrack(sender);
                }
            });
        }
    }

    // Toggle audio mute
    toggleAudio(enabled = null) {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = enabled !== null ? enabled : !audioTrack.enabled;
                console.log('🎤 Audio', audioTrack.enabled ? 'unmuted' : 'muted');
                return audioTrack.enabled;
            }
        }
        return false;
    }

    // Toggle video
    toggleVideo(enabled = null) {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = enabled !== null ? enabled : !videoTrack.enabled;
                console.log('📹 Video', videoTrack.enabled ? 'enabled' : 'disabled');
                return videoTrack.enabled;
            }
        }
        return false;
    }

    close() {
        console.log('🔒 Closing WebRTC connection...');
        
        // Clear any timeouts
        if (this.iceTimeoutId) {
            clearTimeout(this.iceTimeoutId);
            this.iceTimeoutId = null;
        }
        
        // Close data channel
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Clear buffered candidates
        this.iceCandidateBuffer = [];
        
        // End any active calls
        this.endCall();
        
        console.log('✅ WebRTC connection closed and reset');
    }
}