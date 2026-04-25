import { db, collection, addDoc, onSnapshot, updateDoc, doc, getDoc, setDoc, serverTimestamp } from '../firebase';

/**
 * WebRTC Signaling Service using Firestore
 * This avoids third-party services like LiveKit.
 */

// --- 1. SIGNALLY FOR STREAMING (Broadcaster to many Viewers) ---

export const createSignalDocument = async (streamId: string, viewerId: string) => {
  const signalRef = doc(db, 'streams', streamId, 'signaling', viewerId);
  await setDoc(signalRef, {
    createdAt: serverTimestamp(),
    status: 'new'
  });
  return signalRef;
};

export const setOffer = async (streamId: string, viewerId: string, offer: RTCSessionDescriptionInit) => {
  const signalRef = doc(db, 'streams', streamId, 'signaling', viewerId);
  await updateDoc(signalRef, {
    offer: {
      type: offer.type,
      sdp: offer.sdp
    },
    status: 'offer-sent'
  });
};

export const setAnswer = async (streamId: string, viewerId: string, answer: RTCSessionDescriptionInit) => {
  const signalRef = doc(db, 'streams', streamId, 'signaling', viewerId);
  await updateDoc(signalRef, {
    answer: {
      type: answer.type,
      sdp: answer.sdp
    },
    status: 'answered'
  });
};

export const addIceCandidate = async (streamId: string, viewerId: string, candidate: RTCIceCandidate, role: 'broadcaster' | 'viewer') => {
  const candidatesRef = collection(db, 'streams', streamId, 'signaling', viewerId, role === 'broadcaster' ? 'broadcasterCandidates' : 'viewerCandidates');
  await addDoc(candidatesRef, candidate.toJSON());
};

export const listenForIceCandidates = (streamId: string, viewerId: string, role: 'broadcaster' | 'viewer', callback: (candidate: RTCIceCandidate) => void) => {
  // If we are broadaster, listen for viewer candidates. If we are viewer, listen for broadcaster candidates.
  const remoteRole = role === 'broadcaster' ? 'viewerCandidates' : 'broadcasterCandidates';
  const candidatesRef = collection(db, 'streams', streamId, 'signaling', viewerId, remoteRole);
  
  return onSnapshot(candidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        callback(new RTCIceCandidate(change.doc.data()));
      }
    });
  });
};

// --- 2. SIGNALLING FOR PRIVATE CALLS (Peer to Peer) ---

export const createCallDocument = async (chatId: string, offer: RTCSessionDescriptionInit, callerId: string, receiverId: string) => {
  const callRef = doc(db, 'calls', chatId);
  await setDoc(callRef, {
    offer: {
      type: offer.type,
      sdp: offer.sdp
    },
    callerId,
    receiverId,
    status: 'calling',
    createdAt: serverTimestamp()
  });
  return callRef;
};

export const answerCall = async (chatId: string, answer: RTCSessionDescriptionInit) => {
  const callRef = doc(db, 'calls', chatId);
  await updateDoc(callRef, {
    answer: {
      type: answer.type,
      sdp: answer.sdp
    },
    status: 'connected'
  });
};

export const addCallIceCandidate = async (chatId: string, candidate: RTCIceCandidate, role: 'caller' | 'receiver') => {
  const candidatesRef = collection(db, 'calls', chatId, role === 'caller' ? 'callerCandidates' : 'receiverCandidates');
  await addDoc(candidatesRef, candidate.toJSON());
};

export const listenForAnswer = (streamId: string, viewerId: string, callback: (answer: RTCSessionDescriptionInit) => void) => {
  const signalRef = doc(db, 'streams', streamId, 'signaling', viewerId);
  return onSnapshot(signalRef, (snapshot) => {
    const data = snapshot.data();
    if (data && data.answer && data.status === 'answered') {
      callback(data.answer);
    }
  });
};

export const listenForSignals = (streamId: string, callback: (viewerId: string, data: any) => void) => {
  const signalsRef = collection(db, 'streams', streamId, 'signaling');
  return onSnapshot(signalsRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        callback(change.doc.id, change.doc.data());
      }
    });
  });
};

export const listenForCallAnswer = (chatId: string, callback: (answer: RTCSessionDescriptionInit) => void) => {
  const callRef = doc(db, 'calls', chatId);
  return onSnapshot(callRef, (snapshot) => {
    const data = snapshot.data();
    if (data && data.answer && data.status === 'connected') {
      callback(data.answer);
    }
  });
};

export const listenForCallIceCandidates = (chatId: string, role: 'caller' | 'receiver', callback: (candidate: RTCIceCandidate) => void) => {
  const remoteRole = role === 'caller' ? 'receiverCandidates' : 'callerCandidates';
  const candidatesRef = collection(db, 'calls', chatId, remoteRole);
  
  return onSnapshot(candidatesRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        callback(new RTCIceCandidate(change.doc.data()));
      }
    });
  });
};
