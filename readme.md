# WebRTC Serverless Browser Messenger

## 📌 Project Overview
This project is a **serverless, peer-to-peer browser messenger** using **WebRTC** for direct data transfer between clients.  
There will be **no traditional backend server** for message delivery.  
A **serverless signaling mechanism** will be used to exchange connection details (SDP, ICE candidates).

---

## 🎯 Goals
- 1-to-1 real-time text messaging directly between browsers (P2P)
- Optional audio/video call support
- Simple, responsive UI
- Minimal latency (direct WebRTC connection)
- Fully serverless architecture

---

## 🏗 Architecture Overview
1. **Frontend** (HTML/JS/optional React or Vue)
2. **Signaling Server** (Serverless - Firebase Realtime Database)
3. **STUN/TURN Servers** for NAT traversal
4. **WebRTC DataChannels** for chat
5. **Optional Firebase Auth** for user login

---

## 📦 Pre-Configured Resources
These must be ready before development starts:

### 1. **Frontend Environment**
- Static hosting (choose one):
    - GitHub Pages (free)
    - Netlify (free tier)
    - Vercel (free tier)

### 2. **Signaling Service**
- **Firebase Project** (Realtime Database enabled)
- Firebase config object ready:
```json
{
  "apiKey": "YOUR_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "databaseURL": "https://YOUR_PROJECT.firebaseio.com",
  "projectId": "YOUR_PROJECT_ID",
  "storageBucket": "YOUR_PROJECT.appspot.com",
  "messagingSenderId": "YOUR_SENDER_ID",
  "appId": "YOUR_APP_ID"
}
