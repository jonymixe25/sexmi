import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import * as webrtc from '../services/webrtcService';
import { Video, Mic, MicOff, VideoOff, PhoneOff, Share2, Users, Settings, MessageSquare, Shield, Lock, Copy, Check, Maximize, PictureInPicture2, Camera } from 'lucide-react';
import { db, doc, onSnapshot, getDoc } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import Toast from '../components/Toast';

export default function PrivateMeeting() {
  const { id: meetingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const videoRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!meetingId || !user) return;

    const setupCall = async () => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Local stream
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      
      // Display local video
      const localVideo = document.createElement('video');
      localVideo.srcObject = stream;
      localVideo.autoplay = true;
      localVideo.muted = true;
      localVideo.playsInline = true;
      localVideo.className = "w-full h-full object-cover rounded-3xl border border-white/10 shadow-2xl scale-x-[-1]";
      
      const localContainer = document.getElementById('local-video-container');
      if (localContainer) {
        localContainer.innerHTML = '';
        localContainer.appendChild(localVideo);
      }

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.className = "w-full h-full object-cover rounded-3xl border border-white/10 shadow-2xl";
        
        const container = document.getElementById('remote-video-container');
        if (container) {
          container.innerHTML = ''; // Single remote for P2P
          container.appendChild(remoteVideo);
          setParticipants([{ identity: 'Remoto', sid: 'remote-1' }]);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const role = pc.localDescription?.type === 'offer' ? 'caller' : 'receiver';
          webrtc.addCallIceCandidate(meetingId, event.candidate, role);
        }
      };

      // Check if we should be caller or receiver
      const callDocRef = doc(db, 'calls', meetingId);
      const callSnap = await getDoc(callDocRef);
      
      let isCaller = false;
      if (!callSnap.exists()) {
        isCaller = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await webrtc.createCallDocument(meetingId, offer, user.uid, '');
      }

      const unsubscribeCall = onSnapshot(callDocRef, async (snapshot) => {
        const data = snapshot.data();
        if (data) {
          if (!isCaller && data.offer && !pc.remoteDescription) {
            // Receiver logic
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await webrtc.answerCall(meetingId, answer);
          } else if (isCaller && data.answer && !pc.remoteDescription) {
            // Caller receiving answer
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
        }
      });

      const unsubIceCaller = webrtc.listenForCallIceCandidates(meetingId, 'caller', (c) => {
        if (!isCaller) pc.addIceCandidate(c);
      });
      const unsubIceReceiver = webrtc.listenForCallIceCandidates(meetingId, 'receiver', (c) => {
        if (isCaller) pc.addIceCandidate(c);
      });

      return () => {
        unsubscribeCall();
        unsubIceCaller();
        unsubIceReceiver();
      };
    };

    const cleanup = setupCall();

    return () => {
      cleanup.then(unsubs => {
        if (typeof unsubs === 'function') unsubs();
      });
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [meetingId, user]);

  const toggleMute = async () => {
    if (!localStreamRef.current) return;
    const enabled = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !enabled);
    setIsMuted(enabled);
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const enabled = !isVideoOff;
    localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !enabled);
    setIsVideoOff(enabled);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    setToast({ message: 'Enlace copiado al portapapeles', type: 'success', isVisible: true });
  };

  const endCall = () => {
    if (pcRef.current) pcRef.current.close();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    navigate('/');
  };

  const toggleCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    
    // In actual WebRTC we would re-negotiate or replace track
    // For now we just show intent
    setToast({ message: `Cámara cambiada a: ${newMode === 'user' ? 'Frontal' : 'Trasera'}`, type: 'success', isVisible: true });
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#0a0502] overflow-hidden font-sans">
      {/* Cinematic Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand/5 blur-[120px] rounded-full animate-pulse delay-700" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 h-full flex flex-col py-6">
        {/* Modern Header */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-10 bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-[2rem]"
        >
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-brand/20 flex items-center justify-center border border-brand/30 shadow-[0_0_20px_rgba(255,78,0,0.2)]">
                <Shield className="w-7 h-7 text-brand" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#0a0502] animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-black tracking-tight text-white uppercase italic">Sala Mixe Privada</h1>
              <div className="flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-widest mt-1">
                <Lock className="w-3 h-3 text-emerald-500" />
                <span>Encriptación punto a punto habilitada</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10">
              <Users className="w-4 h-4 text-brand" />
              <span className="text-xs font-mono font-bold text-white/80">{participants.length + 1} Conectados</span>
            </div>
            <button 
              onClick={copyLink}
              className="flex items-center gap-2 bg-brand/10 hover:bg-brand/20 border border-brand/20 px-5 py-2.5 rounded-2xl text-brand text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 group"
            >
              {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 group-hover:rotate-12 transition-transform" />}
              <span>{isCopied ? 'Enlace Copiado' : 'Invitar a la Sala'}</span>
            </button>
          </div>
        </motion.div>

        {/* Dynamic Video Grid */}
        <div className="flex-1 min-h-[500px] mb-24">
          <div className={`grid gap-6 h-full transition-all duration-700 ${
            participants.length === 0 ? 'grid-cols-1 max-w-4xl mx-auto' : 'grid-cols-1 lg:grid-cols-2'
          }`}>
            
            {/* Local Stream View */}
            <motion.div 
              layout
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative group rounded-[2.5rem] overflow-hidden bg-white/5 border border-white/10 shadow-2xl transition-all duration-500 hover:border-white/20"
            >
              <div id="local-video-container" className="w-full h-full" />
              
              <AnimatePresence>
                {isVideoOff && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0d0f]"
                  >
                    <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                      <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center animate-pulse">
                        <VideoOff className="w-8 h-8 text-brand" />
                      </div>
                    </div>
                    <p className="text-xs font-mono text-white/40 uppercase tracking-widest">Cámara Desactivada</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status Overlay */}
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10">
                  <div className="w-2 h-2 bg-brand rounded-full " />
                  <span className="text-[10px] font-black uppercase tracking-widest italic">{user?.displayName || 'Mi Cámara'} (Tú)</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {isMuted && (
                    <div className="bg-red-500/20 backdrop-blur-xl p-2 rounded-xl border border-red-500/40">
                      <MicOff className="w-4 h-4 text-red-500" />
                    </div>
                  )}
                  <button 
                    onClick={toggleCamera}
                    className="bg-white/10 backdrop-blur-xl p-2 rounded-xl border border-white/10 hover:bg-white/20 transition-all"
                  >
                    <Camera className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Remote Participants / Empty State */}
            <AnimatePresence mode="wait">
              {participants.length > 0 ? (
                <div id="remote-video-container" className="contents">
                  {participants.map((p, idx) => (
                    <motion.div 
                      key={p.sid || idx}
                      layout
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative group rounded-[2.5rem] overflow-hidden bg-white/5 border border-white/10 shadow-2xl transition-all duration-500 hover:border-white/20"
                    >
                      {/* Video is attached here by the service */}
                      <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                          <span className="text-[10px] font-black uppercase tracking-widest italic">{p.identity || 'Participante'} </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div 
                  layout
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative group aspect-video lg:aspect-auto rounded-[2.5rem] bg-white/5 border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-12 text-center"
                >
                  <div className="w-20 h-20 rounded-full bg-brand/5 border border-brand/20 flex items-center justify-center mb-8 relative">
                    <Users className="w-10 h-10 text-brand/40" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-brand rounded-full animate-ping opacity-75" />
                  </div>
                  <h3 className="text-lg font-display font-bold text-white/80 mb-2">Sala de Espera Activa</h3>
                  <p className="text-xs font-mono text-white/30 uppercase tracking-[0.2em] mb-8 leading-relaxed">
                    Comparte el enlace con tus invitados<br />para comenzar la transmisión segura.
                  </p>
                  <button 
                    onClick={copyLink}
                    className="group px-8 py-3 rounded-2xl bg-brand text-white text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 shadow-[0_10px_30px_rgba(255,78,0,0.3)] hover:scale-105 active:scale-95 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    Copia enlace y espera
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Premium Floating Toolbar */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-[32px] bg-black/80 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-4 sm:gap-6"
        >
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleMute}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                isMuted ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-brand border border-white/10'
              }`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            
            <button 
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                isVideoOff ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-brand border border-white/10'
              }`}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          </div>

          <div className="w-[1px] h-10 bg-white/10 mx-1" />

          <div className="flex items-center gap-3">
            <button 
              onClick={copyLink}
              className="w-14 h-14 rounded-2xl bg-white/5 text-white/60 hover:bg-brand/10 hover:text-brand flex items-center justify-center border border-white/10 transition-all"
              title="Invitar"
            >
              <Users className="w-6 h-6" />
            </button>
            
            <button 
              className="w-14 h-14 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center border border-white/10 transition-all"
              title="Chat de Reunión"
            >
              <MessageSquare className="w-6 h-6" />
            </button>
          </div>

          <div className="w-[1px] h-10 bg-white/10 mx-1" />

          <button 
            onClick={endCall}
            className="group h-14 px-8 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(220,38,38,0.3)] hover:scale-110 flex items-center gap-3"
          >
            <PhoneOff className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline">Finalizar</span>
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {toast.isVisible && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            isVisible={toast.isVisible}
            onClose={() => setToast({ ...toast, isVisible: false })} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
