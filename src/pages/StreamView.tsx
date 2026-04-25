import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, doc, onSnapshot, updateDoc, increment, handleFirestoreError, collection, addDoc, serverTimestamp, query, orderBy, limit, setDoc, storage, ref, uploadBytesResumable, getDownloadURL, where } from '../firebase';
import { StreamSession, OperationType, ChatMessage } from '../types';
import { Users, Heart, MessageSquare, Share2, X, Radio, Volume2, Play, Pause, Maximize, VolumeX, Settings, Send, Image as ImageIcon, Loader2, Camera, UserPlus, Linkedin, PictureInPicture2, Gauge, Clock, CheckCircle2, Shield, Sparkles, Wand2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import { useAuth } from '../AuthContext';
import * as webrtc from '../services/webrtcService';
import { useIsMobile } from '../hooks/useIsMobile';

import Toast from '../components/Toast';

const StreamView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [stream, setStream] = useState<StreamSession | null>(null);
  const [showChat, setShowChat] = useState(true);
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [isUploadingChatImage, setIsUploadingChatImage] = useState(false);
  const [chatUploadProgress, setChatUploadProgress] = useState(0);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [joinStatus, setJoinStatus] = useState<'none' | 'pending' | 'accepted' | 'rejected'>('none');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });
  
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [hasVideo, setHasVideo] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  
  const [reactions, setReactions] = useState<{ id: number; x: number }[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [moderationSensitivity, setModerationSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [suggestedStreams, setSuggestedStreams] = useState<StreamSession[]>([]);
  const [anonymousId] = useState(() => `anon_${Math.random().toString(36).substring(2, 11)}`);

  // Apply volume to video element
  useEffect(() => {
    if (videoElementRef.current) {
      videoElementRef.current.volume = isMuted ? 0 : volume;
      videoElementRef.current.muted = isMuted;
    }
  }, [volume, isMuted, hasVideo]);

  const toggleMute = () => setIsMuted(!isMuted);

  const togglePlay = () => {
    if (videoElementRef.current) {
      if (isPlaying) {
        videoElementRef.current.pause();
      } else {
        videoElementRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleCamera = async () => {
    // Placeholder for future duo streaming internal WebRTC logic
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    } else if (newVolume === 0 && !isMuted) {
      setIsMuted(true);
    }
  };
  const viewerIdentity = user?.uid || anonymousId;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localDuoStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'streams'),
      where('status', '==', 'live'),
      orderBy('startedAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const streams = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as StreamSession))
        .filter(s => s.id !== id); // Exclude current stream
      setSuggestedStreams(streams);
    });

    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setModerationSensitivity(snapshot.data().moderationSensitivity || 'medium');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!id) return;
    // ... existing stream and chat listeners ...

    const streamRef = doc(db, 'streams', id);
    const unsubscribe = onSnapshot(streamRef, (doc) => {
      if (doc.exists()) {
        setStream({ id: doc.id, ...doc.data() } as StreamSession);
      } else {
        navigate('/');
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `streams/${id}`);
    });

    // Chat listener
    const chatQuery = query(
      collection(db, 'streams', id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );
    const unsubscribeChat = onSnapshot(chatQuery, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setChat(messages);
    }, (error) => {
      console.error('Chat error:', error);
    });

    // Increment viewer count
    const updateViewerCount = async (val: number) => {
      try {
        await updateDoc(streamRef, {
          viewerCount: increment(val)
        });
      } catch (error) {
        try {
          handleFirestoreError(error, OperationType.UPDATE, `streams/${id}`);
        } catch (e) {
          if ((e as any).isQuotaError) throw e;
          console.error('Background update error:', e);
        }
      }
    };

    updateViewerCount(1);

    let isMounted = true;
    let unsubscribeJoinRequest = () => {};

    if (user) {
      unsubscribeJoinRequest = onSnapshot(doc(db, 'streams', id, 'joinRequests', user.uid), (doc) => {
        if (doc.exists()) {
          setJoinStatus(doc.data().status);
        } else {
          setJoinStatus('none');
        }
      });
    }

    // WebRTC Setup
    const setupWebRTC = async () => {
      if (!id || !viewerIdentity) return;
      
      console.log('Setting up viewer WebRTC connection...');
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      pcRef.current = pc;

      pc.ontrack = (event) => {
        console.log('Received remote track', event.streams[0]);
        if (videoRef.current) {
          const streamId = event.streams[0].id;
          let video = videoRef.current.querySelector(`video[data-stream-id="${streamId}"]`) as HTMLVideoElement;
          
          if (!video) {
            video = document.createElement('video');
            video.dataset.streamId = streamId;
            video.playsInline = true;
            video.autoplay = true;
            video.className = "flex-1 w-full h-full object-cover rounded-2xl border border-white/10 shadow-2xl transition-all duration-500";
            videoRef.current.appendChild(video);
            
            if (videoRef.current.children.length === 1) {
              videoElementRef.current = video;
            }
          }
          video.srcObject = event.streams[0];
          setHasVideo(true);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          webrtc.addIceCandidate(id, viewerIdentity, event.candidate, 'viewer');
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          console.log('Negotiation needed for viewer...');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await webrtc.setOffer(id, viewerIdentity, offer);
        } catch (err) {
          console.error('Negotiation error:', err);
        }
      };

      // Create signaling document
      await webrtc.createSignalDocument(id, viewerIdentity);

      // Listen for offer
      const signalRef = doc(db, 'streams', id, 'signaling', viewerIdentity);
      const unsubscribeSignal = onSnapshot(signalRef, async (snapshot) => {
        const data = snapshot.data();
        if (data && data.offer && data.status === 'offer-sent') {
          console.log('Offer received, creating answer...');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await webrtc.setAnswer(id, viewerIdentity, answer);
          } catch (err) {
            console.error('Error handling offer:', err);
          }
        }
      });

      // Listen for remote ICE candidates
      const unsubscribeIce = webrtc.listenForIceCandidates(id, viewerIdentity, 'viewer', (candidate) => {
        pc.addIceCandidate(candidate).catch(e => console.warn('ICE error:', e));
      });

      pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setConnectionStatus('connected');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setConnectionStatus('failed');
        }
      };

      return () => {
        unsubscribeSignal();
        unsubscribeIce();
      };
    };

    const cleanup = setupWebRTC();

    return () => {
      isMounted = false;
      unsubscribe();
      unsubscribeChat();
      unsubscribeJoinRequest();
      updateViewerCount(-1);
      cleanup.then(unsubs => {
        if (typeof unsubs === 'function') unsubs();
      });
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localDuoStreamRef.current) {
        localDuoStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [id, navigate, viewerIdentity, user]);

  // Duo mode activation
  useEffect(() => {
    if (joinStatus === 'accepted' && pcRef.current && !localDuoStreamRef.current) {
      const activateDuo = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          localDuoStreamRef.current = stream;
          stream.getTracks().forEach(track => pcRef.current?.addTrack(track, stream));
          
          if (videoRef.current) {
            const localPreview = document.createElement('video');
            localPreview.dataset.streamId = 'local-duo';
            localPreview.srcObject = stream;
            localPreview.muted = true;
            localPreview.autoplay = true;
            localPreview.playsInline = true;
            localPreview.className = "w-1/3 aspect-video object-cover rounded-xl border-2 border-brand absolute bottom-4 right-4 z-40 shadow-2xl scale-x-[-1]";
            videoRef.current.appendChild(localPreview);
          }
          
          setToast({ message: 'Modo Duo activado. Tu señal se está transmitiendo.', type: 'success', isVisible: true });
        } catch (err) {
          console.error('Error activating Duo mode:', err);
          setToast({ message: 'No se pudo acceder a tu cámara para el modo Duo', type: 'error', isVisible: true });
        }
      };
      activateDuo();
    }
  }, [joinStatus]);

  useEffect(() => {
    if (isMobile) {
      setShowChat(false);
    } else {
      setShowChat(true);
    }
  }, [isMobile]);

  const handleRequestJoin = async () => {
    if (!user || !id) return;
    try {
      setJoinStatus('pending');
      await setDoc(doc(db, 'streams', id, 'joinRequests', user.uid), {
        userId: user.uid,
        userName: user.displayName,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setToast({ message: 'Solicitud enviada al anfitrión', type: 'success', isVisible: true });
    } catch (error) {
      console.error('Error requesting join:', error);
      setJoinStatus('none');
      setToast({ message: 'Error al enviar solicitud', type: 'error', isVisible: true });
    }
  };

  const speak = async (text: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say cheerfully: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
        audio.play();
      }
    } catch (error) {
      console.error('TTS error:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !user || !id) return;

    const msgText = message.trim();
    setMessage('');

    // Auto-moderation logic
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
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

    try {
      await addDoc(collection(db, 'streams', id, 'messages'), {
        userId: user.uid,
        userName: user.displayName,
        text: msgText,
        createdAt: serverTimestamp(),
      });

      // Simulate TTS for certain keywords
      if (msgText.toLowerCase().includes('hola')) {
        speak(`¡Hola ${user.displayName}! Bienvenido a la transmisión.`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `streams/${id}/messages`);
    }
  };

  const handleChatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !id) return;

    setIsUploadingChatImage(true);
    setChatUploadProgress(0);
    try {
      const storageRef = ref(storage, `chat/${id}/${Date.now()}_${file.name}`);
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
          await addDoc(collection(db, 'streams', id, 'messages'), {
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

  const handleLike = async () => {
    if (!id) return;
    if (!user) {
      setToast({
        message: 'Debes iniciar sesión para dar me gusta',
        type: 'error',
        isVisible: true
      });
      return;
    }

    setIsLiked(!isLiked);
    try {
      await updateDoc(doc(db, 'streams', id), {
        likes: increment(isLiked ? -1 : 1)
      });
    } catch (error) {
      console.error('Error updating likes:', error);
      setIsLiked(isLiked); // Rollback
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setToast({
      message: '¡Enlace copiado al portapapeles!',
      type: 'success',
      isVisible: true
    });
  };

  const shareToLinkedIn = () => {
    const url = window.location.href;
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, '_blank');
  };

  const handleReaction = () => {
    const id = Date.now();
    const x = Math.random() * 100;
    setReactions(prev => [...prev, { id, x }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);
  };

  const togglePiP = async () => {
    try {
      if (videoElementRef.current) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await videoElementRef.current.requestPictureInPicture();
        }
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  };

  const toggleFullScreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const generateSummary = async () => {
    if (!stream?.description) return;
    setIsSummarizing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Resume de forma muy breve y atractiva esta transmisión sobre cultura Mixe: ${stream.description}`,
      });
      setSummary(response.text || 'No se pudo generar el resumen.');
    } catch (error) {
      console.error('Summary error:', error);
    } finally {
      setIsSummarizing(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#ff4e00]"></div>
    </div>
  );

  return (
    <div className="max-w-[1800px] mx-auto space-y-8 relative">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-radial from-[#ff4e00]/10 to-transparent blur-[120px] opacity-50" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-radial from-[#3a1510]/30 to-transparent blur-[100px] opacity-60" />
      </div>

      {/* Private Stream Warning */}
      {stream?.privacy === 'private' && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] bg-black/40 backdrop-blur-xl px-6 py-2 rounded-full border border-yellow-500/30 flex items-center gap-3 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
          <Lock className="w-3 h-3 text-yellow-500" />
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-yellow-500/80">Transmisión Privada</span>
        </div>
      )}

      {/* Immersive Stream Container */}
      <div className="relative w-full aspect-video bg-black/80 rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl shadow-black/80 group border border-white/5 backdrop-blur-sm z-10">
        {/* Floating Reactions Container */}
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          <AnimatePresence>
            {reactions.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: '100%', x: `${r.x}%` }}
                animate={{ opacity: 1, y: '-20%', x: `${r.x + (Math.random() * 20 - 10)}%` }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: "easeOut" }}
                className="absolute bottom-0"
              >
                <Heart className="w-8 h-8 text-[#ff4e00] fill-current drop-shadow-[0_0_15px_rgba(255,78,0,0.6)]" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* LiveKit Video Container */}
        <div
          ref={videoRef}
          className="w-full h-full flex items-center justify-center gap-4 p-4 [&>video]:flex-1 [&>video]:h-full [&>video]:object-cover [&>video]:rounded-2xl [&>video]:border [&>video]:border-white/10"
        />

        {/* Stream Ended Overlay */}
        {stream?.status === 'ended' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-2xl z-[70]">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8 border border-white/10">
              <Radio className="w-10 h-10 text-white/20" />
            </div>
            <h2 className="text-3xl font-display font-black uppercase italic tracking-tighter mb-4">La transmisión ha finalizado</h2>
            <p className="text-white/40 italic mb-10">Gracias por acompañarnos en esta sesión cultural.</p>
            <button 
              onClick={() => navigate('/')}
              className="bg-[#ff4e00] text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-[#ff4e00]/90 transition-all shadow-2xl shadow-[#ff4e00]/20"
            >
              Volver al Inicio
            </button>
          </div>
        )}

        {/* Connection Status Overlay */}
        {connectionStatus !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl z-50">
            <div className="relative">
              <div className="w-24 h-24 border-2 border-[#ff4e00]/20 rounded-full animate-spin border-t-[#ff4e00] shadow-[0_0_30px_rgba(255,78,0,0.15)]" />
              <Radio className="w-8 h-8 text-[#ff4e00] absolute inset-0 m-auto animate-pulse" />
            </div>
            <p className="mt-8 font-mono uppercase tracking-[0.3em] text-[10px] text-[#ff4e00]/80">
              <span>{connectionStatus === 'connecting' ? 'CONECTANDO CON EL ANFITRIÓN...' : 'ERROR DE SEÑAL'}</span>
            </p>
            {connectionStatus === 'failed' && (
              <button 
                onClick={() => window.location.reload()}
                className="mt-8 bg-transparent border border-[#ff4e00]/50 text-[#ff4e00] px-8 py-3 rounded-full text-[10px] font-mono uppercase tracking-widest hover:bg-[#ff4e00]/10 transition-all active:scale-95"
              >
                <span>Reintentar</span>
              </button>
            )}
          </div>
        )}

        {/* Waiting for Host Overlay */}
        {connectionStatus === 'connected' && !hasVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md z-40">
            <div className="relative">
              <div className="w-20 h-20 border border-white/10 rounded-full flex items-center justify-center mb-6">
                <Radio className="w-8 h-8 text-white/20 animate-pulse" />
              </div>
            </div>
            <p className="text-white/40 text-[10px] font-mono uppercase tracking-[0.3em] italic">
              Esperando la señal del anfitrión...
            </p>
          </div>
        )}

        {/* Top Overlay Bar */}
        <div className="absolute top-0 left-0 right-0 p-6 md:p-8 flex items-start justify-between z-30 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <AnimatePresence>
            {showStats && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-24 right-8 z-50 glass p-6 rounded-3xl border-white/10 shadow-2xl w-64 space-y-4"
              >
                <div className="flex items-center gap-3 text-[#ff4e00] mb-2">
                  <Gauge className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Estado de la Señal</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Resolución</span>
                    <span className="text-[10px] font-bold text-white">{stream?.resolution || '720p'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Latencia</span>
                    <span className="text-[10px] font-bold text-white uppercase">{stream?.latency || 'Normal'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Conexión</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-[10px] font-bold text-white uppercase">{connectionStatus}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-[#ff4e00]/20 backdrop-blur-md border border-[#ff4e00]/30 px-3 py-1.5 rounded-full flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-[#ff4e00]">
                <div className="w-1.5 h-1.5 bg-[#ff4e00] rounded-full animate-pulse shadow-[0_0_8px_#ff4e00]" />
                <span>En Vivo</span>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest">
                <Users className="w-3 h-3 text-white/60" />
                <span>{stream.viewerCount}</span>
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-white drop-shadow-xl">
              {stream.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStats(!showStats)}
              className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <Gauge className="w-4 h-4 text-white/70" />
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chat Overlay (Desktop/Toggle) */}
        <AnimatePresence>
          {showChat && (
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={`absolute top-8 right-8 bottom-8 ${isMobile ? 'left-8 w-auto' : 'w-80'} z-50 flex flex-col glass border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all duration-500`}
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#ff4e00]" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Chat en Vivo</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  {isMobile && (
                    <button onClick={() => setShowChat(false)} className="p-1 hover:bg-white/10 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                {chat.map((msg) => (
                  <motion.div 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={msg.id} 
                    className="flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium ${msg.userId === stream?.userId ? 'text-[#ff4e00]' : 'text-white/80'}`}>
                        {msg.userName}
                      </span>
                      {msg.userId === stream?.userId && (
                        <Shield className="w-3 h-3 text-[#ff4e00]" />
                      )}
                      <span className="text-[9px] font-mono text-white/30">
                        {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div className="text-sm text-white/70 leading-relaxed">
                      {msg.text && <p>{msg.text}</p>}
                      {msg.imageUrl && (
                        <img 
                          src={msg.imageUrl} 
                          alt="chat" 
                          className="mt-2 rounded-xl w-full object-cover border border-white/10"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  </motion.div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {user ? (
                <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-black/20">
                  <div className="relative flex items-center bg-white/5 border border-white/10 rounded-full p-1">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 bg-transparent py-2 px-4 text-sm focus:outline-none text-white placeholder-white/30"
                    />
                    <div className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        onClick={handleReaction}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-red-500 hover:bg-white/5 transition-all"
                      >
                        <Heart className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => chatImageInputRef.current?.click()}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="submit"
                        disabled={!message.trim()}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-[#ff4e00] text-white disabled:opacity-50 disabled:bg-white/10 transition-all"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={chatImageInputRef}
                    onChange={handleChatImageUpload}
                    className="hidden"
                    accept="image/*"
                  />
                </form>
              ) : (
                <div className="p-4 border-t border-white/5 bg-black/20 text-center">
                  <p className="text-white/40 text-sm italic">Inicia sesión para participar en el chat</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 z-30 bg-gradient-to-t from-black/95 via-black/60 to-transparent opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-500">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-3 md:gap-4">
                <button 
                  onClick={togglePlay}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#ff4e00] flex items-center justify-center text-white shadow-[0_0_20px_rgba(255,78,0,0.4)] hover:scale-110 transition-all active:scale-95"
                  title={isPlaying ? "Pausar" : "Reproducir"}
                >
                  {isPlaying ? <Pause className="w-4 h-4 md:w-5 md:h-5" /> : <Play className="w-4 h-4 md:w-5 md:h-5 ml-1" />}
                </button>
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-white/10 overflow-hidden bg-black/50 backdrop-blur-md hidden xs:block">
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${stream.userId}`}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5 md:mb-1">
                    <p className="text-xs md:text-sm font-medium tracking-wide truncate max-w-[100px] md:max-w-none">{stream.userName}</p>
                    <div className="flex items-center gap-1 bg-red-500 px-1.5 py-0.5 rounded text-[7px] md:text-[8px] font-black uppercase tracking-widest animate-pulse">
                      <div className="w-1 h-1 bg-white rounded-full" />
                      LIVE
                    </div>
                  </div>
                  <p className="text-[8px] md:text-[9px] font-mono uppercase tracking-widest text-[#ff4e00]/80">Anfitrión</p>
                </div>
              </div>
              
              <div className="h-8 w-px bg-white/10 hidden sm:block" />
              
              <div className="flex items-center gap-2 group/volume">
                <button onClick={toggleMute} className="p-2 text-white/60 hover:text-white transition-colors">
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className="w-20 md:w-0 overflow-hidden md:group-hover/volume:w-24 transition-all duration-300 ease-out flex items-center">
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-full h-1 bg-white/20 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#ff4e00] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-end">
              <button
                onClick={() => setShowChat(!showChat)}
                className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${
                  showChat ? 'bg-brand text-white shadow-[0_0_20px_rgba(255,78,0,0.3)]' : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
                title="Toggle Chat"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
              {user && user.uid !== stream.userId && (
                <button
                  onClick={handleRequestJoin}
                  disabled={joinStatus === 'pending' || joinStatus === 'accepted'}
                  className={`flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 rounded-full font-mono uppercase tracking-widest text-[9px] md:text-[10px] transition-all duration-500 ${
                    joinStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
                    joinStatus === 'accepted' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' :
                    'bg-[#ff4e00]/20 text-[#ff4e00] hover:bg-[#ff4e00] hover:text-white border border-[#ff4e00]/30'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>
                    {joinStatus === 'pending' ? 'Pendiente' :
                     joinStatus === 'accepted' ? 'En Duo' :
                     'Unirse'}
                  </span>
                </button>
              )}
              
              <div className="flex items-center gap-2">
                {joinStatus === 'accepted' && (
                  <button
                    onClick={toggleCamera}
                    className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/60 hover:text-white"
                    title="Voltear Cámara"
                  >
                    <Camera className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                )}
                <button
                  onClick={togglePiP}
                  className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/60 hover:text-white"
                  title="Picture in Picture"
                >
                  <PictureInPicture2 className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <button
                  onClick={toggleFullScreen}
                  className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/60 hover:text-white"
                  title="Pantalla Completa"
                >
                  <Maximize className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <button
                  onClick={handleLike}
                  className={`flex items-center justify-center w-9 h-9 md:w-11 md:h-11 rounded-full transition-all duration-500 ${
                    isLiked 
                      ? 'bg-red-500/20 text-red-500 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                      : 'bg-white/5 backdrop-blur-md text-white/60 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  <Heart className={`w-4 h-4 md:w-5 md:h-5 ${isLiked ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Info & Chat Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-black/40 backdrop-blur-2xl p-8 rounded-[2rem] md:rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 text-[#ff4e00]">
                <Radio className="w-4 h-4" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Descripción</span>
              </div>
              <button 
                onClick={generateSummary}
                disabled={isSummarizing || !stream?.description}
                className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-[#ff4e00] transition-colors disabled:opacity-50 bg-white/5 px-4 py-2 rounded-full border border-white/5"
              >
                {isSummarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>Resumen IA</span>
              </button>
            </div>
            
            <AnimatePresence>
              {summary && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-6 p-6 bg-[#ff4e00]/10 border border-[#ff4e00]/20 rounded-[2rem] text-sm text-white/80 leading-relaxed"
                >
                  <p>{summary}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="text-white/70 text-lg leading-relaxed font-medium">
              {stream.description || 'Sin descripción disponible.'}
            </p>
          </div>
        </div>

        {/* Mobile Chat (visible only on small screens) */}
        <div className="lg:hidden bg-black/40 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col h-[500px]">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#ff4e00]" />
              <span className="text-[10px] font-mono uppercase tracking-widest">Chat en Vivo</span>
            </div>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
            {chat.map((msg) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id} 
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium ${msg.userId === stream?.userId ? 'text-[#ff4e00]' : 'text-white/80'}`}>
                    {msg.userName}
                  </span>
                  {msg.userId === stream?.userId && (
                    <Shield className="w-3 h-3 text-[#ff4e00]" />
                  )}
                  <span className="text-[9px] font-mono text-white/30">
                    {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className="text-sm text-white/70 leading-relaxed">
                  {msg.text && <p>{msg.text}</p>}
                  {msg.imageUrl && (
                    <img 
                      src={msg.imageUrl} 
                      alt="chat" 
                      className="mt-2 rounded-xl w-full object-cover border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {user ? (
            <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-black/20">
              <div className="relative flex items-center bg-white/5 border border-white/10 rounded-full p-1">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-transparent py-2 px-4 text-sm focus:outline-none text-white placeholder-white/30"
                />
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={handleReaction}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-red-500 hover:bg-white/5 transition-all"
                  >
                    <Heart className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => chatImageInputRef.current?.click()}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="submit"
                    disabled={!message.trim()}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-[#ff4e00] text-white disabled:opacity-50 disabled:bg-white/10 transition-all"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <input
                type="file"
                ref={chatImageInputRef}
                onChange={handleChatImageUpload}
                className="hidden"
                accept="image/*"
              />
            </form>
          ) : (
            <div className="p-4 border-t border-white/5 bg-black/20 text-center">
              <p className="text-white/40 text-sm italic">Inicia sesión para participar en el chat</p>
            </div>
          )}
        </div>

        {/* Suggested Streams */}
        {suggestedStreams.length > 0 && (
          <div className="bg-black/40 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] p-6 shadow-2xl">
            <h3 className="text-[#ff4e00] font-mono uppercase tracking-widest text-xs mb-6 flex items-center gap-2">
              <Radio className="w-4 h-4" />
              Transmisiones Sugeridas
            </h3>
            <div className="space-y-4">
              {suggestedStreams.map(s => (
                <div key={s.id} onClick={() => navigate(`/stream/${s.id}`)} className="flex gap-4 cursor-pointer group hover:bg-white/5 p-2 rounded-2xl transition-colors">
                  <div className="w-24 h-16 bg-white/10 rounded-xl overflow-hidden relative flex-shrink-0">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${s.userId}`} alt="" className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                    <div className="absolute bottom-1 right-1 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">
                      <div className="w-1 h-1 bg-white rounded-full animate-pulse" />
                      LIVE
                    </div>
                  </div>
                  <div className="flex flex-col justify-center overflow-hidden">
                    <h4 className="text-white text-sm font-medium truncate group-hover:text-[#ff4e00] transition-colors">{s.title}</h4>
                    <p className="text-white/50 text-xs truncate">{s.userName}</p>
                    <div className="flex items-center gap-1 text-white/40 text-[10px] mt-1">
                      <Users className="w-3 h-3" />
                      <span>{s.viewerCount}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Toast 
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </div>
  );
};

export default StreamView;
