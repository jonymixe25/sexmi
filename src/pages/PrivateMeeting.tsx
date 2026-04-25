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
    <div className="min-h-[calc(100vh-12rem)] flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-6 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand/20 rounded-2xl flex items-center justify-center border border-brand/30">
              <Lock className="w-6 h-6 text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-black tracking-tight uppercase italic">Reunión Privada</h1>
              <div className="flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-widest">
                <Shield className="w-3 h-3 text-emerald-500" />
                <span>Encriptación de extremo a extremo</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3">
              <Users className="w-4 h-4 text-brand" />
              <span className="text-xs font-mono font-bold">{participants.length + 1} Participantes</span>
            </div>
            <button 
              onClick={copyLink}
              className="flex items-center gap-2 bg-brand/10 border border-brand/20 px-4 py-2 rounded-xl text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-white transition-all"
            >
              {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{isCopied ? 'Copiado' : 'Copiar Enlace'}</span>
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10 min-h-[500px]">
          {/* Local Participant */}
          <div className="relative group aspect-video bg-white/5 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
            <div id="local-video-container" className="w-full h-full" />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0a0502]">
                <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <VideoOff className="w-10 h-10 text-white/20" />
                </div>
              </div>
            )}
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between z-20">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                <div className="w-2 h-2 bg-brand rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest italic">{user?.displayName || 'Tú'} (Anfitrión)</span>
              </div>
              {isMuted && (
                <div className="bg-red-500/80 backdrop-blur-md p-2 rounded-lg border border-red-500/50">
                  <MicOff className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
          </div>

          {/* Remote Participants */}
          <div id="remote-video-container" className="contents" />
          {participants.map(p => (
            <div 
              key={p.sid} 
              id={`participant-${p.sid}`}
              className="relative group aspect-video bg-white/5 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl"
            >
              <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between z-20">
                <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest italic">{p.identity}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Empty States */}
          {participants.length === 0 && (
            <div className="aspect-video bg-white/5 rounded-[2.5rem] border border-dashed border-white/10 flex flex-col items-center justify-center p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Share2 className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4">Esperando a otros participantes...</p>
              <button 
                onClick={copyLink}
                className="text-brand text-[10px] font-black uppercase tracking-widest hover:underline"
              >
                Compartir enlace de invitación
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
          <div className="glass rounded-[2.5rem] border-white/10 p-4 flex items-center gap-4 shadow-2xl shadow-black/50 backdrop-blur-3xl">
            <button 
              onClick={toggleMute}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${isMuted ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            
            <button 
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${isVideoOff ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>

            <div className="w-px h-8 bg-white/10 mx-2" />

            <button 
              onClick={toggleCamera}
              className="w-14 h-14 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all"
              title="Voltear Cámara"
            >
              <Camera className="w-6 h-6" />
            </button>

            <button 
              className="w-14 h-14 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all"
              title="Compartir Pantalla"
            >
              <Maximize className="w-6 h-6" />
            </button>

            <button 
              className="w-14 h-14 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all"
              title="Chat de Reunión"
            >
              <MessageSquare className="w-6 h-6" />
            </button>

            <button 
              className="w-14 h-14 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all"
              title="Ajustes"
            >
              <Settings className="w-6 h-6" />
            </button>

            <div className="w-px h-8 bg-white/10 mx-2" />

            <button 
              onClick={endCall}
              className="bg-red-500 px-8 h-14 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-red-600 transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] flex items-center gap-3 group"
            >
              <PhoneOff className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              <span>Finalizar</span>
            </button>
          </div>
        </div>
      </div>

      <Toast 
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />
    </div>
  );
}
