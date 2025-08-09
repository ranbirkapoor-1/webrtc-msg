export const firebaseConfig = {
    apiKey: "AIzaSyAhH6A7jKRRhTd3d082nhxw0OkRAABFANI",
    authDomain: "p-2-p-d2339.firebaseapp.com",
    databaseURL: "https://p-2-p-d2339-default-rtdb.firebaseio.com",
    projectId: "p-2-p-d2339",
    storageBucket: "p-2-p-d2339.firebasestorage.app",
    messagingSenderId: "85389967918",
    appId: "1:85389967918:web:391b170d6f426f69d615bf",
    measurementId: "G-PXW02NH5D8"
};

export const webrtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.ekiga.net' },
        { urls: 'stun:stun.ideasip.com' },
        { urls: 'stun:stun.rixtelecom.se' },
        { urls: 'stun:stun.schlund.de' },
        { urls: 'stun:stunserver.org' },
        // More reliable TURN servers
        {
            urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
        },
        {
            urls: ['turn:192.158.29.39:3478?transport=udp', 'turn:192.158.29.39:3478?transport=tcp'],
            credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            username: '28224511:1379330808'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};