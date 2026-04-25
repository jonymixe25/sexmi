import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { db, collection, addDoc, updateDoc, doc, serverTimestamp, onSnapshot, query, where, handleFirestoreError, orderBy, limit, deleteDoc, setDoc } from '../firebase';
import { StreamSession, OperationType } from '../types';
import { Mic, MicOff, Radio, StopCircle, Play, Volume2, Settings, Users, MessageSquare, Activity, Loader2, Zap, Shield, Clock, Heart, Share2, Maximize2, Smartphone, Plus, Music, Trash2, SkipForward, SkipBack, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Toast from '../components/Toast';

interface PlaylistTrack {
  id: string;
  title: string;
  artist?: string;
  url: string;
  duration?: number;
  addedBy: string;
  createdAt: any;
}

const RadioAdmin: React.FC = () => {
  const { user } = useAuth();
  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uptime, setUptime] = useState('00:00:00');
  const [viewers, setViewers] = useState(0);
  const [likes, setLikes] = useState(0);
  const [bitrate, setBitrate] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isPlayingPlaylist, setIsPlayingPlaylist] = useState(false);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [newTrack, setNewTrack] = useState({ title: '', artist: '', url: '' });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playlistAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  // Listen to playlist
  useEffect(() => {
    const q = query(collection(db, 'radio_playlist'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tracks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlaylistTrack));
      setPlaylist(tracks);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'radio_playlist'));
    
    return () => unsubscribe();
  }, []);

  // Listen to radio status
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'radio_status'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setIsLive(data.isLive);
        setViewers(data.viewers || 0);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isLive) {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        const diff = Date.now() - start;
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        setUptime(`${h}:${m}:${s}`);
        setBitrate(128 + Math.random() * 5);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setUptime('00:00:00');
      setBitrate(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLive]);

  const startBroadcast = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Audio analysis for visualizer
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      const updateLevel = () => {
        if (!analyzerRef.current) return;
        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average / 128);
        if (streamRef.current?.active) {
          requestAnimationFrame(updateLevel);
        }
      };
      
      // Update global status
      await setDoc(doc(db, 'settings', 'radio_status'), {
        isLive: true,
        startedAt: serverTimestamp(),
        viewers: 0,
        currentTrack: isPlayingPlaylist && currentTrackIndex !== null ? playlist[currentTrackIndex].title : 'Micrófono Abierto'
      });

      setIsLive(true);
      updateLevel();
      setToast({ message: '¡Transmisión de radio iniciada!', type: 'success', isVisible: true });
    } catch (error) {
      console.error('Error starting radio:', error);
      setToast({ message: 'Error al acceder al micrófono', type: 'error', isVisible: true });
    } finally {
      setLoading(false);
    }
  };

  const stopBroadcast = async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    await updateDoc(doc(db, 'settings', 'radio_status'), {
      isLive: false,
      endedAt: serverTimestamp()
    });

    setIsLive(false);
    setAudioLevel(0);
    setToast({ message: 'Transmisión finalizada', type: 'success', isVisible: true });
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const addTrackToPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTrack.title || !newTrack.url) return;
    
    setLoading(true);
    try {
      await addDoc(collection(db, 'radio_playlist'), {
        ...newTrack,
        addedBy: user.uid,
        createdAt: serverTimestamp()
      });
      setNewTrack({ title: '', artist: '', url: '' });
      setShowAddTrack(false);
      setToast({ message: 'Canción añadida a la lista', type: 'success', isVisible: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'radio_playlist');
      setToast({ message: 'Error al añadir canción', type: 'error', isVisible: true });
    } finally {
      setLoading(false);
    }
  };

  const deleteTrack = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'radio_playlist', id));
      setToast({ message: 'Canción eliminada', type: 'success', isVisible: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'radio_playlist');
    }
  };

  const playTrack = (index: number) => {
    setCurrentTrackIndex(index);
    setIsPlayingPlaylist(true);
    if (playlistAudioRef.current) {
      playlistAudioRef.current.src = playlist[index].url;
      playlistAudioRef.current.play().catch(err => {
        console.error('Error playing track:', err);
        setToast({ message: 'Error al reproducir la canción: URL no válida', type: 'error', isVisible: true });
        setIsPlayingPlaylist(false);
      });
    }
    
    if (isLive) {
      updateDoc(doc(db, 'settings', 'radio_status'), {
        currentTrack: playlist[index].title
      });
    }
  };

  const togglePlaylistPlayback = () => {
    if (playlistAudioRef.current) {
      if (isPlayingPlaylist) {
        playlistAudioRef.current.pause();
      } else {
        if (currentTrackIndex === null && playlist.length > 0) {
          playTrack(0);
        } else {
          playlistAudioRef.current.play();
        }
      }
      setIsPlayingPlaylist(!isPlayingPlaylist);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-[calc(100vh-8rem)] flex flex-col gap-6 pb-10 px-4">
      <audio 
        ref={playlistAudioRef} 
        onEnded={() => {
          if (currentTrackIndex !== null && currentTrackIndex < playlist.length - 1) {
            playTrack(currentTrackIndex + 1);
          } else {
            setIsPlayingPlaylist(false);
          }
        }}
        onError={(e) => {
          const error = e.currentTarget.error;
          console.error('Audio element error:', error?.message || 'Unknown error');
          setToast({ message: 'Error de reproducción: Fuente no soportada o URL inválida', type: 'error', isVisible: true });
          setIsPlayingPlaylist(false);
        }}
      />

      {/* Status Header */}
      <div className="glass p-8 rounded-[3rem] border-white/10 shadow-2xl relative overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#ff4e00]/5 rounded-full blur-[100px]" />
        
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-white/20'}`} />
            <span className="text-[10px] font-mono font-black uppercase tracking-[0.4em]">
              {isLive ? 'En Vivo' : 'Radio Offline'}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <Smartphone className="w-3 h-3 text-white/40" />
            <span className="text-[8px] font-mono uppercase tracking-widest text-white/60 italic">Mobile Broadcast Mode</span>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center text-center space-y-4 relative z-10">
          <h1 className="text-5xl font-display font-black tracking-tighter uppercase italic leading-none">
            Voz Mixe <span className="text-[#ff4e00]">Radio</span>
          </h1>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-mono uppercase tracking-widest text-white/20 mb-1">Uptime</span>
              <span className="text-xl font-mono font-bold text-white/80">{uptime}</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-[8px] font-mono uppercase tracking-widest text-white/20 mb-1">Bitrate</span>
              <span className="text-xl font-mono font-bold text-[#ff4e00]">{bitrate.toFixed(1)} <span className="text-[10px]">kbps</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Visualizer */}
      <div className="glass p-10 rounded-[3rem] border-white/10 shadow-2xl flex flex-col items-center justify-center gap-8 relative overflow-hidden min-h-[250px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,78,0,0.05)_0%,transparent_70%)]" />
        
        <div className="flex items-end gap-1 h-32 relative z-10">
          {[...Array(24)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ 
                height: isLive ? `${Math.max(10, audioLevel * (40 + Math.random() * 60))}%` : '10%' 
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`w-2 rounded-full ${isLive ? 'bg-gradient-to-t from-[#ff4e00] to-[#ff4e00]/40' : 'bg-white/5'}`}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-4 relative z-10 w-full">
          {currentTrackIndex !== null && (
            <div className="text-center mb-4">
              <p className="text-[8px] font-mono uppercase tracking-widest text-white/40 mb-1">Reproduciendo</p>
              <p className="text-sm font-black italic text-[#ff4e00]">{playlist[currentTrackIndex].title}</p>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10 w-full max-w-xs">
            <Volume2 className="w-4 h-4 text-[#ff4e00]" />
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                animate={{ width: `${audioLevel * 100}%` }}
                className="h-full bg-[#ff4e00] shadow-[0_0_10px_rgba(255,78,0,0.5)]" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Controls */}
      <div className="grid grid-cols-2 gap-6">
        <button
          onClick={isLive ? stopBroadcast : startBroadcast}
          disabled={loading}
          className={`col-span-2 h-24 rounded-[2.5rem] flex items-center justify-center gap-4 transition-all duration-500 shadow-2xl relative overflow-hidden group ${
            isLive 
              ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20' 
              : 'bg-white text-black hover:bg-[#ff4e00] hover:text-white'
          }`}
        >
          {loading ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : isLive ? (
            <>
              <StopCircle className="w-8 h-8 group-hover:scale-110 transition-transform" />
              <span className="text-xl font-black uppercase tracking-widest italic">Detener Radio</span>
            </>
          ) : (
            <>
              <Radio className="w-8 h-8 group-hover:animate-pulse" />
              <span className="text-xl font-black uppercase tracking-widest italic">Transmitir Ahora</span>
            </>
          )}
        </button>

        <button
          onClick={toggleMute}
          disabled={!isLive}
          className={`h-20 rounded-[2rem] border flex items-center justify-center transition-all duration-500 shadow-xl ${
            isMuted 
              ? 'bg-red-500/10 border-red-500/50 text-red-500' 
              : 'glass border-white/10 text-white/40 hover:text-white hover:bg-white/5'
          } disabled:opacity-20`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button
          onClick={togglePlaylistPlayback}
          className="h-20 rounded-[2rem] glass border border-white/10 text-white/40 hover:text-white hover:bg-white/5 flex items-center justify-center transition-all duration-500 shadow-xl"
        >
          {isPlayingPlaylist ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
        </button>
      </div>

      {/* Playlist Section */}
      <div className="glass p-8 rounded-[3rem] border-white/10 shadow-2xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Music className="w-5 h-5 text-[#ff4e00]" />
            <h2 className="text-lg font-black italic uppercase tracking-tight">Lista de Reproducción</h2>
          </div>
          <button 
            onClick={() => setShowAddTrack(!showAddTrack)}
            className="p-2 bg-[#ff4e00] rounded-xl text-white hover:scale-110 transition-transform"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {showAddTrack && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={addTrackToPlaylist}
              className="space-y-4 overflow-hidden"
            >
              <input 
                type="text" 
                placeholder="Título de la canción" 
                value={newTrack.title}
                onChange={e => setNewTrack({...newTrack, title: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#ff4e00] transition-colors"
                required
              />
              <input 
                type="text" 
                placeholder="Artista (Opcional)" 
                value={newTrack.artist}
                onChange={e => setNewTrack({...newTrack, artist: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#ff4e00] transition-colors"
              />
              <input 
                type="url" 
                placeholder="URL del audio (MP3, etc)" 
                value={newTrack.url}
                onChange={e => setNewTrack({...newTrack, url: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-[#ff4e00] transition-colors"
                required
              />
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black font-black uppercase tracking-widest p-4 rounded-xl hover:bg-[#ff4e00] hover:text-white transition-all"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Añadir a la lista'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
          {playlist.length === 0 ? (
            <div className="py-10 text-center text-white/20">
              <Music className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-[10px] font-mono uppercase tracking-widest">No hay canciones en la lista</p>
            </div>
          ) : (
            playlist.map((track, index) => (
              <div 
                key={track.id}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all group ${
                  currentTrackIndex === index 
                    ? 'bg-[#ff4e00]/10 border-[#ff4e00]/30' 
                    : 'bg-white/5 border-white/5 hover:border-white/10'
                }`}
              >
                <div 
                  className="flex items-center gap-4 flex-1 cursor-pointer"
                  onClick={() => playTrack(index)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${currentTrackIndex === index ? 'bg-[#ff4e00] text-white' : 'bg-white/5 text-white/20'}`}>
                    {currentTrackIndex === index && isPlayingPlaylist ? (
                      <div className="flex items-end gap-0.5 h-3">
                        <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-0.5 bg-white" />
                        <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-white" />
                        <motion.div animate={{ height: [6, 10, 6] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-0.5 bg-white" />
                      </div>
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${currentTrackIndex === index ? 'text-[#ff4e00]' : 'text-white'}`}>{track.title}</p>
                    <p className="text-[10px] text-white/40 truncate uppercase tracking-widest">{track.artist || 'Artista Desconocido'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => deleteTrack(track.id)}
                  className="p-2 text-white/10 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users, label: 'Oyentes', value: viewers },
          { icon: Heart, label: 'Likes', value: likes },
          { icon: MessageSquare, label: 'Chat', value: '24' }
        ].map((stat, i) => (
          <div key={i} className="glass p-6 rounded-[2rem] border-white/10 flex flex-col items-center gap-2 text-center">
            <stat.icon className="w-4 h-4 text-white/20" />
            <span className="text-lg font-black italic">{stat.value}</span>
            <span className="text-[8px] font-mono uppercase tracking-widest text-white/30">{stat.label}</span>
          </div>
        ))}
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

export default RadioAdmin;
