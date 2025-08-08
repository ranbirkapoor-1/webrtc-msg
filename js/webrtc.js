import { webrtcConfig } from './config.js';

export class WebRTCManager {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.localStream = null;
        this.onMessageReceived = null;
        this.onConnectionStateChange = null;
        this.isInitiator = false;
    }

    async createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(webrtcConfig);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.onIceCandidate) {
                this.onIceCandidate(event.candidate);
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(this.peerConnection.connectionState);
            }
        };

        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(channel);
        };

        this.peerConnection.ontrack = (event) => {
            if (this.onRemoteStream) {
                this.onRemoteStream(event.streams[0]);
            }
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
        channel.onopen = () => {
            console.log('Data channel opened');
        };

        channel.onmessage = (event) => {
            if (this.onMessageReceived) {
                this.onMessageReceived(JSON.parse(event.data));
            }
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };

        this.dataChannel = channel;
    }

    async createOffer() {
        if (!this.peerConnection) return null;
        
        this.createDataChannel();
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        return offer;
    }

    async createAnswer(offer) {
        if (!this.peerConnection) return null;
        
        await this.peerConnection.setRemoteDescription(offer);
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        return answer;
    }

    async handleAnswer(answer) {
        if (!this.peerConnection) return;
        
        // Only set remote description if we're in the correct state
        if (this.peerConnection.signalingState === 'have-local-offer') {
            await this.peerConnection.setRemoteDescription(answer);
        } else {
            console.warn('Ignoring answer - wrong signaling state:', this.peerConnection.signalingState);
        }
    }

    async addIceCandidate(candidate) {
        if (!this.peerConnection) return;
        
        // Only add ICE candidates if we have remote description set
        if (this.peerConnection.remoteDescription) {
            try {
                await this.peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.warn('Failed to add ICE candidate:', error);
            }
        } else {
            console.warn('Ignoring ICE candidate - no remote description yet');
        }
    }

    sendMessage(message) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'message',
                text: message,
                timestamp: Date.now()
            }));
            return true;
        }
        return false;
    }

    async startMediaCall(video = false) {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: video
            });

            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            return this.localStream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }

    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        this.endCall();
    }
}