import { webrtcConfig } from './config.js';

export class MultiPeerWebRTCManager {
    constructor() {
        this.peerConnections = new Map(); // sessionId -> RTCPeerConnection
        this.dataChannels = new Map(); // sessionId -> RTCDataChannel
        this.localStream = null;
        this.onMessageReceived = null;
        this.onConnectionStateChange = null;
        this.onRemoteStream = null;
        this.onIceCandidate = null;
        this.iceCandidateBuffers = new Map(); // sessionId -> [candidates]
        this.connectedPeers = new Set();
        this.sessionId = null;
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }

    async createPeerConnection(remoteSessionId) {
        if (this.peerConnections.has(remoteSessionId)) {
            console.log(`🔗 Peer connection already exists for ${remoteSessionId}`);
            return this.peerConnections.get(remoteSessionId);
        }

        const peerConnection = new RTCPeerConnection(webrtcConfig);
        this.peerConnections.set(remoteSessionId, peerConnection);
        this.iceCandidateBuffers.set(remoteSessionId, []);

        console.log(`🔗 Peer connection created for ${remoteSessionId}`);

        // Set up event handlers
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.onIceCandidate) {
                this.onIceCandidate(event.candidate, remoteSessionId);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log(`🔄 Connection state for ${remoteSessionId}:`, peerConnection.connectionState);
            
            if (peerConnection.connectionState === 'connected') {
                this.connectedPeers.add(remoteSessionId);
            } else if (peerConnection.connectionState === 'disconnected' || 
                       peerConnection.connectionState === 'failed') {
                this.connectedPeers.delete(remoteSessionId);
            }
            
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(peerConnection.connectionState, remoteSessionId);
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log(`📺 Remote stream received from ${remoteSessionId}`);
            if (event.streams && event.streams[0] && this.onRemoteStream) {
                this.onRemoteStream(event.streams[0], remoteSessionId);
            }
        };

        // Handle data channel
        peerConnection.ondatachannel = (event) => {
            console.log(`📡 Data channel received from ${remoteSessionId}`);
            this.setupDataChannel(event.channel, remoteSessionId);
        };

        // Add local stream if available
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        return peerConnection;
    }

    createDataChannel(remoteSessionId) {
        const peerConnection = this.peerConnections.get(remoteSessionId);
        if (!peerConnection) return;
        
        const dataChannel = peerConnection.createDataChannel('messages', { ordered: true });
        this.dataChannels.set(remoteSessionId, dataChannel);
        this.setupDataChannel(dataChannel, remoteSessionId);
    }

    setupDataChannel(channel, remoteSessionId) {
        console.log(`🔧 Setting up data channel for ${remoteSessionId}`);
        
        channel.onopen = () => {
            console.log(`✅ Data channel opened for ${remoteSessionId}`);
            this.dataChannels.set(remoteSessionId, channel);
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onMessageReceived) {
                    this.onMessageReceived(data, remoteSessionId);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to parse message from ${remoteSessionId}:`, error);
            }
        };

        channel.onerror = (error) => {
            console.error(`❌ Data channel error for ${remoteSessionId}:`, error);
        };

        channel.onclose = () => {
            console.log(`🔒 Data channel closed for ${remoteSessionId}`);
            this.dataChannels.delete(remoteSessionId);
        };
    }

    async createOffer(remoteSessionId) {
        const peerConnection = await this.createPeerConnection(remoteSessionId);
        this.createDataChannel(remoteSessionId);
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log(`📋 Offer created for ${remoteSessionId}`);
        return offer;
    }

    async createAnswer(offer, remoteSessionId) {
        const peerConnection = await this.createPeerConnection(remoteSessionId);
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Process buffered ICE candidates
        await this.processBufferedCandidates(remoteSessionId);
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log(`📋 Answer created for ${remoteSessionId}`);
        return answer;
    }

    async handleAnswer(answer, remoteSessionId) {
        const peerConnection = this.peerConnections.get(remoteSessionId);
        if (!peerConnection) return;
        
        if (peerConnection.signalingState === 'have-local-offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            await this.processBufferedCandidates(remoteSessionId);
            console.log(`✅ Answer handled for ${remoteSessionId}`);
        }
    }

    async addIceCandidate(candidate, remoteSessionId) {
        const peerConnection = this.peerConnections.get(remoteSessionId);
        if (!peerConnection) return;
        
        const iceCandidate = new RTCIceCandidate(candidate);
        
        if (peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(iceCandidate);
            console.log(`✅ ICE candidate added for ${remoteSessionId}`);
        } else {
            // Buffer the candidate
            const buffer = this.iceCandidateBuffers.get(remoteSessionId) || [];
            buffer.push(iceCandidate);
            this.iceCandidateBuffers.set(remoteSessionId, buffer);
            console.log(`⏳ ICE candidate buffered for ${remoteSessionId}`);
        }
    }

    async processBufferedCandidates(remoteSessionId) {
        const buffer = this.iceCandidateBuffers.get(remoteSessionId) || [];
        const peerConnection = this.peerConnections.get(remoteSessionId);
        
        if (!peerConnection) return;
        
        console.log(`🔄 Processing ${buffer.length} buffered candidates for ${remoteSessionId}`);
        
        for (const candidate of buffer) {
            try {
                await peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.warn(`❌ Failed to add buffered candidate for ${remoteSessionId}:`, error);
            }
        }
        
        this.iceCandidateBuffers.set(remoteSessionId, []);
    }

    // Send message to all connected peers
    sendMessage(messagePayload) {
        let successCount = 0;
        
        for (const [sessionId, dataChannel] of this.dataChannels) {
            if (dataChannel.readyState === 'open') {
                try {
                    dataChannel.send(JSON.stringify(messagePayload));
                    successCount++;
                } catch (error) {
                    console.error(`❌ Failed to send message to ${sessionId}:`, error);
                }
            }
        }
        
        console.log(`📤 Message sent to ${successCount}/${this.dataChannels.size} peers`);
        return successCount > 0;
    }

    async startMediaCall(video = false, audio = true) {
        try {
            const mediaConstraints = {
                audio: audio ? {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : false,
                video: video ? {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 30, max: 60 }
                } : false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            
            // Add tracks to all existing peer connections
            for (const [sessionId, peerConnection] of this.peerConnections) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
                
                // Renegotiate if connected
                if (peerConnection.connectionState === 'connected') {
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);
                    // Signal the new offer to the peer
                    if (this.onIceCandidate) {
                        // This would need to be handled by the signaling layer
                        console.log(`🔄 Renegotiation needed for ${sessionId}`);
                    }
                }
            }

            console.log(`✅ Media stream started and added to ${this.peerConnections.size} connections`);
            return this.localStream;
            
        } catch (error) {
            console.error('❌ Error accessing media devices:', error);
            throw error;
        }
    }

    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Remove tracks from all peer connections
        for (const peerConnection of this.peerConnections.values()) {
            peerConnection.getSenders().forEach(sender => {
                if (sender.track) {
                    peerConnection.removeTrack(sender);
                }
            });
        }
        
        console.log('📞 Media call ended for all peers');
    }

    toggleAudio(enabled = null) {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = enabled !== null ? enabled : !audioTrack.enabled;
                return audioTrack.enabled;
            }
        }
        return false;
    }

    toggleVideo(enabled = null) {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = enabled !== null ? enabled : !videoTrack.enabled;
                return videoTrack.enabled;
            }
        }
        return false;
    }

    getConnectedPeerCount() {
        return this.connectedPeers.size;
    }

    getConnectedPeers() {
        return Array.from(this.connectedPeers);
    }

    close() {
        console.log('🔒 Closing all peer connections...');
        
        this.endCall();
        
        for (const [sessionId, peerConnection] of this.peerConnections) {
            peerConnection.close();
        }
        
        for (const [sessionId, dataChannel] of this.dataChannels) {
            dataChannel.close();
        }
        
        this.peerConnections.clear();
        this.dataChannels.clear();
        this.iceCandidateBuffers.clear();
        this.connectedPeers.clear();
        
        console.log('✅ All connections closed');
    }
}