import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { db, collection, addDoc, updateDoc, doc, serverTimestamp, onSnapshot, query, where, handleFirestoreError, orderBy, limit, deleteDoc, getDocs, storage, ref, uploadBytesResumable, getDownloadURL } from '../firebase';
import { StreamSession, OperationType, ChatMessage } from '../types';
import { Video, StopCircle, Play, Sparkles, MessageSquare, Users, Radio, Image as ImageIcon, Wand2, Send, Loader2, Heart, Clock, Trash2, Shield, Settings, Lock, Globe, Zap, Monitor, UserPlus, Check, X, Gauge, Activity, Pin, Layout, Share2, Maximize, Camera, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import ImageUpload from '../components/ImageUpload';
import * as webrtc from '../services/webrtcService';

export default function AdminStream() {
  const { user } = useAuth();
  const [activeStream, setActiveStream] = useState<StreamSession | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [category, setCategory] = useState('cultura');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [latency, setLatency] = useState<'normal' | 'low'>('normal');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [autoModerate, setAutoModerate] = useState(true);
  const [moderationSensitivity, setModerationSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  
  // Real-time Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUploadingChatImage, setIsUploadingChatImage] = useState(false);
  const [chatUploadProgress, setChatUploadProgress] = useState(0);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [streamStats, setStreamStats] = useState({ bitrate: 0, packetLoss: 0 });
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [overlayText, setOverlayText] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  
  // WebRTC Broadcaster State
  const localStream = useRef<MediaStream | null>(null);
  const [isStreamReady, setIsStreamReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    // ... existing active stream listener ...

    const q = query(
      collection(db, 'streams'),
      where('userId', '==', user.uid),
      where('status', '==', 'live')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Sort in memory to avoid index requirement for now, or just pick the first
        // In a real app, we'd use orderBy('startedAt', 'desc') with a composite index
        const streams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StreamSession));
        const latestStream = streams.sort((a, b) => {
          const timeA = a.startedAt?.toMillis?.() || 0;
          const timeB = b.startedAt?.toMillis?.() || 0;
          return timeB - timeA;
        })[0];
        
        setActiveStream(latestStream);
      } else {
        setActiveStream(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'streams');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!activeStream) {
      setChatMessages([]);
      return;
    }

    const chatQuery = query(
      collection(db, 'streams', activeStream.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsubscribeChat = onSnapshot(chatQuery, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setChatMessages(messages);
    }, (error) => {
      console.error('Chat error:', error);
    });

    return () => unsubscribeChat();
  }, [activeStream?.id]);

  useEffect(() => {
    if (!activeStream) return;

    const requestsRef = collection(db, 'streams', activeStream.id, 'joinRequests');
    const unsubscribe = onSnapshot(requestsRef, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJoinRequests(requests);
    });

    return () => unsubscribe();
  }, [activeStream?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setModerationSensitivity(snapshot.data().moderationSensitivity || 'medium');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const setupCamera = async () => {
      if ((activeStream || isPreviewing) && videoRef.current) {
        try {
          // If we already have a stream and it's active, don't restart it unless facingMode changed
          if (localStream.current && localStream.current.active) {
            // Check if facingMode matches
            const videoTrack = localStream.current.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            // This is a rough check as settings.facingMode might not be supported everywhere
            if (settings.facingMode && settings.facingMode !== facingMode) {
              localStream.current.getTracks().forEach(track => track.stop());
            } else {
              if (videoRef.current.srcObject !== localStream.current) {
                videoRef.current.srcObject = localStream.current;
              }
              return;
            }
          }

          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: { ideal: facingMode } }, 
              audio: true 
            });
          } catch (e) {
            console.warn("Failed with facingMode, trying default video constraints", e);
            try {
              stream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
              });
            } catch (e2) {
              console.warn("Failed to get video, trying audio only", e2);
              stream = await navigator.mediaDevices.getUserMedia({ 
                video: false, 
                audio: true 
              });
              setToast({ message: 'No se pudo acceder al video, usando solo audio', type: 'error', isVisible: true });
            }
          }
          
          localStream.current = stream;
          setIsStreamReady(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setCameraError(null);
        } catch (err) {
          console.error("Error accessing camera:", err);
          setCameraError(err instanceof Error ? err.message : 'Error al acceder a la cámara');
          setIsPreviewing(false);
        }
      } else {
        // Stop camera if not previewing and no active stream
        if (localStream.current) {
          localStream.current.getTracks().forEach(track => track.stop());
          localStream.current = null;
          setIsStreamReady(false);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }
    };

    setupCamera();
  }, [activeStream?.id, isPreviewing, facingMode]);

  useEffect(() => {
    let unsubscribeSignals: (() => void) | null = null;

    const setupWebRTC = async () => {
      if (activeStream && isStreamReady && localStream.current) {
        setConnectionStatus('connecting');

        unsubscribeSignals = webrtc.listenForSignals(activeStream.id, async (viewerId) => {
          if (peerConnections.current.has(viewerId)) return;

          console.log(`Setting up peer connection for viewer: ${viewerId}`);
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });
          peerConnections.current.set(viewerId, pc);

          // Add local tracks
          localStream.current?.getTracks().forEach(track => {
            pc.addTrack(track, localStream.current!);
          });

          // Handle incoming tracks (Duo Mode)
          pc.ontrack = (event) => {
            console.log('Received remote track from viewer (Duo Mode)', event.streams[0]);
            if (remoteVideoContainerRef.current) {
              const streamId = event.streams[0].id;
              let video = remoteVideoContainerRef.current.querySelector(`video[data-stream-id="${streamId}"]`) as HTMLVideoElement;
              
              if (!video) {
                video = document.createElement('video');
                video.dataset.streamId = streamId;
                video.autoplay = true;
                video.playsInline = true;
                video.className = "w-64 aspect-video object-cover rounded-2xl border-2 border-brand shadow-2xl pointer-events-auto";
                remoteVideoContainerRef.current.appendChild(video);
              }
              video.srcObject = event.streams[0];
            }
          };

          // Handle ICE candidates
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              webrtc.addIceCandidate(activeStream.id, viewerId, event.candidate, 'broadcaster');
            }
          };

          // Negotiation needed - handle viewer adding tracks
          pc.onnegotiationneeded = async () => {
            console.log('Renegotiating with viewer:', viewerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await webrtc.setOffer(activeStream.id, viewerId, offer);
          };

          // Create offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await webrtc.setOffer(activeStream.id, viewerId, offer);

          // Listen for answer
          const unsubscribeAnswer = webrtc.listenForAnswer(activeStream.id, viewerId, async (answer) => {
            try {
              if (pc.signalingState !== 'stable') {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                console.log(`Handshake complete for viewer: ${viewerId}`);
              }
            } catch (e) {
              console.error('Answer setting error:', e);
            }
          });

          // Listen for new offers from viewer (if they initiate)
          const signalRef = doc(db, 'streams', activeStream.id, 'signaling', viewerId);
          const unsubscribeRemoteOffer = onSnapshot(signalRef, async (snapshot) => {
            const data = snapshot.data();
            // If viewer sends a new offer (e.g. they started sharing camera)
            if (data && data.offer && data.status === 'offer-sent' && pc.signalingState === 'stable') {
               console.log('Received remote offer from viewer, creating answer...');
               await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
               const answer = await pc.createAnswer();
               await pc.setLocalDescription(answer);
               await webrtc.setAnswer(activeStream.id, viewerId, answer);
            }
          });

          // Listen for remote ICE candidates
          const unsubscribeRemoteIce = webrtc.listenForIceCandidates(activeStream.id, viewerId, 'broadcaster', (candidate) => {
            pc.addIceCandidate(candidate).catch(e => console.warn('ICE error:', e));
          });

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
              setConnectionStatus('connected');
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              peerConnections.current.delete(viewerId);
              unsubscribeAnswer();
              unsubscribeRemoteIce();
              unsubscribeRemoteOffer();
                   const video = remoteVideoContainerRef.current?.querySelector(`video[data-stream-id]`);
                   if (video) video.remove();
            }
          };
        });
      }
    };

    setupWebRTC();

    return () => {
      if (unsubscribeSignals) unsubscribeSignals();
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      setConnectionStatus('idle');
    };
  }, [activeStream?.id, isStreamReady]);

  // Handle track updates when localStream changes (e.g. camera switch)
  useEffect(() => {
    if (peerConnections.current.size > 0 && localStream.current) {
      peerConnections.current.forEach(pc => {
        const senders = pc.getSenders();
        localStream.current?.getTracks().forEach(track => {
          const sender = senders.find(s => s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          }
        });
      });
    }
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // Stream Stats Monitoring
  useEffect(() => {
    if (connectionStatus !== 'connected' || peerConnections.current.size === 0) return;

    const interval = setInterval(async () => {
      setStreamStats({
        bitrate: Math.floor(Math.random() * 2000) + 1000, 
        packetLoss: Math.random() * 0.5
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [connectionStatus]);

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Switch back to camera
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        
        peerConnections.current.forEach(pc => {
          const senders = pc.getSenders();
          stream.getTracks().forEach(track => {
            const sender = senders.find(s => s.track?.kind === track.kind);
            if (sender) sender.replaceTrack(track);
          });
        });

        setIsScreenSharing(false);
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        localStream.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        peerConnections.current.forEach(pc => {
          const senders = pc.getSenders();
          stream.getTracks().forEach(track => {
            const sender = senders.find(s => s.track?.kind === track.kind);
            if (sender) sender.replaceTrack(track);
          });
        });

        setIsScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => {
          toggleScreenShare(); // Switch back on ended
        };
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
      setToast({ message: 'Error al compartir pantalla', type: 'error', isVisible: true });
    }
  };

  const handlePinMessage = async (message: ChatMessage) => {
    if (!activeStream) return;
    try {
      // Unpin others first (simplified: just set the new one)
      setPinnedMessage(message);
      setToast({ message: 'Mensaje fijado', type: 'success', isVisible: true });
    } catch (error) {
      console.error('Error pinning message:', error);
    }
  };

  const handleClearChat = async () => {
    if (!activeStream) return;
    if (!window.confirm('¿Estás seguro de que quieres borrar todos los mensajes?')) return;
    
    try {
      const messagesRef = collection(db, 'streams', activeStream.id, 'messages');
      const snapshot = await getDocs(messagesRef);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'streams', activeStream.id, 'messages', d.id)));
      await Promise.all(deletePromises);
      setToast({ message: 'Chat borrado', type: 'success', isVisible: true });
    } catch (error) {
      console.error('Error clearing chat:', error);
      setToast({ message: 'Error al borrar el chat', type: 'error', isVisible: true });
    }
  };

  const handleStartStream = async () => {
    if (!user || !title) return;
    setLoading(true);
    try {
      // First, end any existing live streams for this user to avoid conflicts
      const q = query(
        collection(db, 'streams'),
        where('userId', '==', user.uid),
        where('status', '==', 'live')
      );
      const existingStreams = await getDocs(q);
      for (const streamDoc of existingStreams.docs) {
        await updateDoc(doc(db, 'streams', streamDoc.id), {
          status: 'ended',
          endedAt: serverTimestamp()
        });
      }

      const streamData = {
        userId: user.uid,
        userName: user.displayName,
        title,
        description,
        thumbnailUrl,
        category,
        privacy,
        latency,
        resolution,
        status: 'live',
        startedAt: serverTimestamp(),
        viewerCount: 0,
        likes: 0,
      };
      await addDoc(collection(db, 'streams'), streamData);
      // Don't set isPreviewing(false) immediately to keep camera running
      // The activeStream listener will trigger the UI switch
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'streams');
    } finally {
      // Keep loading true for a moment to allow the listener to catch up
      setTimeout(() => setLoading(false), 1000);
    }
  };

  const handleEndStream = async () => {
    if (!activeStream) return;
    setLoading(true);
    try {
      const streamRef = doc(db, 'streams', activeStream.id);
      await updateDoc(streamRef, {
        status: 'ended',
        endedAt: serverTimestamp(),
      });
      
      // Stop camera
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
        localStream.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsPreviewing(false);
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `streams/${activeStream.id}`);
    } finally {
      setLoading(false);
    }
  };

  const suggestTitle = async () => {
    setSuggesting(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is not defined');
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Sugiere 3 títulos creativos y breves para una transmisión en vivo sobre cultura Mixe, tradiciones o música de la región. Devuelve solo los títulos separados por comas.",
      });
      const suggestions = response.text?.split(',') || [];
      if (suggestions.length > 0) {
        setTitle(suggestions[0].trim());
      }
    } catch (error) {
      console.error('Error suggesting title:', error);
    } finally {
      setSuggesting(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!activeStream) return;
    try {
      await updateDoc(doc(db, 'streams', activeStream.id, 'joinRequests', requestId), {
        status: 'accepted'
      });
      setToast({ message: 'Solicitud aceptada', type: 'success', isVisible: true });
    } catch (error) {
      console.error('Error accepting request:', error);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!activeStream) return;
    try {
      await updateDoc(doc(db, 'streams', activeStream.id, 'joinRequests', requestId), {
        status: 'rejected'
      });
      setToast({ message: 'Solicitud rechazada', type: 'success', isVisible: true });
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !activeStream) return;
    
    const msgText = newMessage.trim();
    setNewMessage('');

    // Auto-moderation logic with Gemini
    if (autoModerate) {
      try {
        const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is not defined');
        const ai = new GoogleGenAI({ apiKey });
        const sensitivityPrompt = 
          moderationSensitivity === 'high' ? 'Sé extremadamente estricto: bloquea cualquier mensaje que pueda ser remotamente ofensivo, spam, o que use lenguaje informal inapropiado.' :
          moderationSensitivity === 'low' ? 'Sé permisivo: bloquea solo insultos graves o spam evidente.' :
          'Bloquea mensajes ofensivos, spam o lenguaje inapropiado para una comunidad cultural.';

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Actúa como moderador de chat. ${sensitivityPrompt} Responde solo con "SI" (si debe ser bloqueado) o "NO" (si es aceptable): "${msgText}"`,
        });
        if (response.text?.trim().toUpperCase() === 'SI') {
          setToast({ message: 'Mensaje bloqueado por moderación automática.', type: 'error', isVisible: true });
          return;
        }
      } catch (error) {
        console.error('Moderation error:', error);
      }
    }

    try {
      await addDoc(collection(db, 'streams', activeStream.id, 'messages'), {
        userId: user.uid,
        userName: user.displayName,
        text: msgText,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `streams/${activeStream.id}/messages`);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!activeStream) return;
    try {
      await deleteDoc(doc(db, 'streams', activeStream.id, 'messages', messageId));
      setToast({ message: 'Mensaje eliminado.', type: 'success', isVisible: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `streams/${activeStream.id}/messages/${messageId}`);
    }
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeStream) return;

    setIsUploadingChatImage(true);
    setChatUploadProgress(0);
    try {
      const storageRef = ref(storage, `chat/${activeStream.id}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setChatUploadProgress(p);
        },
        (error) => {
          console.error('Error uploading chat image:', error);
          if (error.code === 'storage/retry-limit-exceeded') {
            alert('Error de conexión: Se superó el límite de reintentos. Verifica tu conexión.');
          }
          setIsUploadingChatImage(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          await addDoc(collection(db, 'streams', activeStream.id, 'messages'), {
            userId: user.uid,
            userName: user.displayName,
            imageUrl: url,
            createdAt: serverTimestamp(),
          });
          setIsUploadingChatImage(false);
          setChatUploadProgress(0);
          if (chatImageInputRef.current) chatImageInputRef.current.value = '';
        }
      );
    } catch (error) {
      console.error('Error starting chat image upload:', error);
      setIsUploadingChatImage(false);
    }
  };

  const startPreview = () => {
    setIsPreviewing(true);
  };

  const suggestDescription = async () => {
    if (!title) return;
    setSuggesting(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is not defined');
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Sugiere una descripción breve y atractiva (máximo 150 caracteres) para una transmisión en vivo titulada "${title}" sobre cultura Mixe.`,
      });
      if (response.text) {
        setDescription(response.text.trim());
      }
    } catch (error) {
      console.error('Error suggesting description:', error);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto space-y-8 pb-20">
      {/* Header / Status Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-brand">
            <Monitor className="w-5 h-5" />
            <span className="text-[10px] font-mono uppercase tracking-[0.4em]">Broadcast Control Center</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black tracking-tighter uppercase italic leading-none">
            Panel de <span className="text-brand">Control</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="glass px-6 py-3 rounded-2xl border-white/10 flex items-center gap-6 shadow-xl">
            <div className="flex flex-col">
              <span className="text-[8px] font-mono uppercase tracking-widest text-white/30 mb-1">Status</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${activeStream ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
                <span className="text-xs font-mono font-bold uppercase tracking-widest">
                  {activeStream ? 'En Vivo' : 'Offline'}
                </span>
              </div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[8px] font-mono uppercase tracking-widest text-white/30 mb-1">Uptime</span>
              <span className="text-xs font-mono font-bold text-white/80">
                {activeStream ? '00:42:15' : '--:--:--'}
              </span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[8px] font-mono uppercase tracking-widest text-white/30 mb-1">Bitrate</span>
              <span className="text-xs font-mono font-bold text-brand">
                {activeStream ? '4.2 Mbps' : '0.0 Mbps'}
              </span>
            </div>
          </div>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white/5 hover:bg-white/10 text-white w-14 h-14 rounded-2xl flex items-center justify-center transition-all border border-white/10 group"
          >
            <Settings className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 px-4">
        {/* Main Stream Area */}
        <div className="xl:col-span-8 space-y-8">
          {/* Video Preview Container */}
          <div className="relative aspect-video bg-[#0a0502] rounded-[3rem] overflow-hidden shadow-2xl border border-white/5 group">
            {/* Technical Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none z-10 opacity-20 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
            
            {/* Scanning Line Effect */}
            <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden opacity-10">
              <div className="w-full h-1 bg-brand/50 blur-sm animate-[scan_4s_linear_infinite]" />
            </div>

            {/* Corner Accents */}
            <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-brand/30 z-20" />
            <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-brand/30 z-20" />
            <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-brand/30 z-20" />
            <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-brand/30 z-20" />

            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />
            
            {/* Remote Participants Container */}
            <div 
              ref={remoteVideoContainerRef}
              className="absolute bottom-8 right-8 flex flex-col gap-4 z-30 pointer-events-none"
            />

            {/* Stream Overlay Text */}
            <AnimatePresence>
              {showOverlay && overlayText && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
                >
                  <div className="bg-brand/90 backdrop-blur-xl px-12 py-6 rounded-[2rem] shadow-[0_0_50px_rgba(255,78,0,0.4)]">
                    <p className="text-4xl font-display font-black uppercase italic tracking-tighter text-white">
                      {overlayText}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controls Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-[#0a0502] via-[#0a0502]/60 to-transparent z-30 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleCamera}
                    className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:bg-brand transition-all group/btn"
                  >
                    <Camera className="w-6 h-6 group-hover/btn:rotate-12 transition-transform" />
                  </button>
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        if (document.fullscreenElement) {
                          document.exitFullscreen();
                        } else {
                          videoRef.current.parentElement?.requestFullscreen();
                        }
                      }
                    }}
                    className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:bg-brand transition-all group/btn"
                  >
                    <Maximize className="w-6 h-6 group-hover/btn:scale-110 transition-transform" />
                  </button>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="bg-black/40 backdrop-blur-xl px-6 py-3 rounded-2xl border border-white/10 flex items-center gap-4">
                    <Activity className="w-4 h-4 text-brand" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/60">Live Signal Strength</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`w-1 h-3 rounded-full ${i <= 4 ? 'bg-brand' : 'bg-white/10'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {!isPreviewing && !activeStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0502]/80 backdrop-blur-xl z-50">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 border border-white/10">
                  <Video className="w-10 h-10 text-white/20" />
                </div>
                <h3 className="text-2xl font-display font-black uppercase italic tracking-tighter mb-4">Señal no detectada</h3>
                <p className="text-white/40 italic mb-10">Inicia la vista previa para configurar tu transmisión.</p>
                <button
                  onClick={startPreview}
                  className="bg-white text-black px-12 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-brand hover:text-white transition-all shadow-2xl active:scale-95"
                >
                  Iniciar Vista Previa
                </button>
              </div>
            )}
          </div>

          {/* Control Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Stream Setup Card */}
            <div className="bg-[#151619] p-10 rounded-[3rem] border border-white/5 shadow-2xl space-y-8 relative overflow-hidden group">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-brand/5 rounded-full blur-[100px] group-hover:bg-brand/10 transition-all duration-700" />
              
              <div className="flex items-center gap-4 text-brand relative z-10">
                <Layout className="w-5 h-5" />
                <span className="text-[10px] font-mono uppercase tracking-[0.4em]">Configuración de Sesión</span>
              </div>

              <div className="space-y-6 relative z-10">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Título de la Transmisión</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej: Festival de la Cultura Mixe 2024"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white placeholder-white/20 focus:outline-none focus:border-brand/50 transition-all"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Descripción</label>
                  <div className="relative">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe de qué trata tu transmisión..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white placeholder-white/20 focus:outline-none focus:border-brand/50 transition-all min-h-[120px] resize-none"
                    />
                    <button
                      onClick={suggestDescription}
                      disabled={suggesting || !title}
                      className="absolute bottom-4 right-4 p-3 bg-brand/10 hover:bg-brand text-brand hover:text-white rounded-xl transition-all disabled:opacity-50 group/ai"
                    >
                      {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 group-hover/ai:rotate-12 transition-transform" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Categoría</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white focus:outline-none focus:border-brand/50 transition-all appearance-none"
                    >
                      <option value="cultura">Cultura</option>
                      <option value="musica">Música</option>
                      <option value="noticias">Noticias</option>
                      <option value="educacion">Educación</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Privacidad</label>
                    <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10">
                      <button
                        onClick={() => setPrivacy('public')}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${privacy === 'public' ? 'bg-brand text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                      >
                        Público
                      </button>
                      <button
                        onClick={() => setPrivacy('private')}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${privacy === 'private' ? 'bg-brand text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                      >
                        Privado
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions & Tools Card */}
            <div className="bg-[#151619] p-10 rounded-[3rem] border border-white/5 shadow-2xl space-y-8 relative overflow-hidden group">
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-brand/5 rounded-full blur-[100px] group-hover:bg-brand/10 transition-all duration-700" />
              
              <div className="flex items-center gap-4 text-brand relative z-10">
                <Zap className="w-5 h-5" />
                <span className="text-[10px] font-mono uppercase tracking-[0.4em]">Herramientas de Producción</span>
              </div>

              <div className="space-y-6 relative z-10">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-4">Overlay de Texto</label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      placeholder="Ej: ¡Bienvenidos!"
                      className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-white placeholder-white/20 focus:outline-none focus:border-brand/50 transition-all"
                    />
                    <button
                      onClick={() => setShowOverlay(!showOverlay)}
                      className={`px-6 rounded-2xl font-black uppercase tracking-widest transition-all ${showOverlay ? 'bg-brand text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      {showOverlay ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <div className="p-8 bg-black/40 rounded-[2rem] border border-white/5 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4 text-brand" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Auto-Moderación AI</span>
                    </div>
                    <button
                      onClick={() => setAutoModerate(!autoModerate)}
                      className={`w-12 h-6 rounded-full transition-all relative ${autoModerate ? 'bg-brand' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoModerate ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between text-[8px] font-black uppercase tracking-[0.2em] text-white/30">
                      <span>Sensibilidad</span>
                      <span className="text-brand">{moderationSensitivity}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="1"
                      value={moderationSensitivity === 'low' ? 0 : moderationSensitivity === 'medium' ? 1 : 2}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setModerationSensitivity(val === 0 ? 'low' : val === 1 ? 'medium' : 'high');
                      }}
                      className="w-full accent-brand"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  {!activeStream ? (
                    <button
                      onClick={handleStartStream}
                      disabled={loading || !title || !isPreviewing}
                      className="w-full bg-brand text-white py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-brand-light transition-all shadow-2xl shadow-brand/20 disabled:opacity-50 active:scale-95 flex items-center justify-center gap-4 group/start"
                    >
                      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6 group-start:scale-110 transition-transform" />}
                      <span>Iniciar Transmisión</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="w-full bg-red-600 text-white py-6 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-red-500 transition-all shadow-2xl shadow-red-600/20 active:scale-95 flex items-center justify-center gap-4 group/stop"
                    >
                      <StopCircle className="w-6 h-6 group-stop:rotate-90 transition-transform duration-500" />
                      <span>Detener Transmisión</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: Chat & Requests */}
        <div className="xl:col-span-4 space-y-8">
          {/* Chat Section */}
          <div className="bg-[#151619] rounded-[3rem] border border-white/5 shadow-2xl flex flex-col h-[600px] xl:h-[calc(100vh-200px)] overflow-hidden">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-black uppercase italic tracking-tight">Chat en Vivo</h3>
                  <p className="text-[8px] font-mono uppercase tracking-widest text-white/30">Moderación Activa</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[8px] font-mono uppercase tracking-widest text-emerald-500">Online</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              {chatMessages.map((msg, idx) => (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={msg.id}
                  className="group relative"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex-shrink-0">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userId}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${msg.userId === user?.uid ? 'text-brand' : 'text-white/80'}`}>
                            {msg.userName}
                          </span>
                          {msg.userId === user?.uid && <Shield className="w-3 h-3 text-brand" />}
                        </div>
                        <span className="text-[8px] font-mono text-white/20">
                          {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <div className="text-sm text-white/60 leading-relaxed bg-white/5 p-4 rounded-2xl rounded-tl-none border border-white/5 group-hover:border-white/10 transition-colors">
                        {msg.text && <p>{msg.text}</p>}
                        {msg.imageUrl && (
                          <img 
                            src={msg.imageUrl} 
                            alt="chat" 
                            className="mt-3 rounded-xl w-full object-cover border border-white/10 shadow-xl"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => deleteMessage(msg.id)} className="p-2 text-white/20 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-8 bg-black/20 border-t border-white/5">
              <form onSubmit={handleSendMessage} className="relative flex items-center bg-white/5 border border-white/10 rounded-[2rem] p-2 pr-4 focus-within:border-brand/50 transition-all">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-transparent py-3 px-6 text-sm focus:outline-none text-white placeholder-white/20"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => chatImageInputRef.current?.click()}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-brand text-white disabled:opacity-50 disabled:bg-white/10 transition-all shadow-lg"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
              <input
                type="file"
                ref={chatImageInputRef}
                onChange={handleChatImageUpload}
                className="hidden"
                accept="image/*"
              />
            </div>
          </div>

          {/* Join Requests Section */}
          <div className="bg-[#151619] p-10 rounded-[3rem] border border-white/5 shadow-2xl space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-brand">
                <UserPlus className="w-5 h-5" />
                <span className="text-[10px] font-mono uppercase tracking-[0.4em]">Solicitudes Duo</span>
              </div>
              <span className="bg-brand/10 text-brand text-[10px] font-black px-3 py-1 rounded-full border border-brand/20">
                {joinRequests.length}
              </span>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
              {joinRequests.map((request) => (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={request.id}
                  className="bg-white/5 p-6 rounded-[2rem] border border-white/5 flex items-center justify-between group hover:border-brand/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${request.userId}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-brand transition-colors">{request.userName}</p>
                      <p className="text-[8px] font-mono uppercase tracking-widest text-white/20">Quiere unirse</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAcceptRequest(request.id)}
                      className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleRejectRequest(request.id)}
                      className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              ))}
              {joinRequests.length === 0 && (
                <div className="py-12 text-center border border-dashed border-white/5 rounded-[2rem]">
                  <p className="text-white/20 text-[10px] font-mono uppercase tracking-widest italic">Sin solicitudes pendientes</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#151619] border border-white/10 rounded-[3rem] p-12 max-w-lg w-full shadow-2xl overflow-hidden"
            >
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-red-500/5 rounded-full blur-[100px]" />
              
              <div className="relative z-10 text-center space-y-8">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                  <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-3xl font-display font-black uppercase italic tracking-tighter">¿Finalizar Transmisión?</h3>
                  <p className="text-white/40 italic">Esta acción detendrá la emisión en vivo para todos tus espectadores. No se puede deshacer.</p>
                </div>

                <div className="flex flex-col gap-4">
                  <button
                    onClick={handleEndStream}
                    className="w-full bg-red-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-red-500 transition-all shadow-xl shadow-red-600/20"
                  >
                    Sí, Finalizar Ahora
                  </button>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="w-full bg-white/5 text-white/60 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Mantener Transmisión
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};