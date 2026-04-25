import React, { useState, useEffect, useRef } from 'react';
import { db, doc, onSnapshot, collection, query, orderBy, limit, handleFirestoreError } from '../firebase';
import { OperationType } from '../types';
import { Radio, Users, Heart, MessageSquare, Volume2, VolumeX, Play, Pause, Music, Clock, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const RadioPlayer: React.FC = () => {
  const [isLive, setIsLive] = useState(false);
  const [currentTrack, setCurrentTrack] = useState('Sintonizando...');
  const [viewers, setViewers] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [startedAt, setStartedAt] = useState<any>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'radio_status'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setIsLive(data.isLive);
        setCurrentTrack(data.currentTrack || 'Voz Mixe Radio');
        setViewers(data.viewers || 0);
        setStartedAt(data.startedAt?.toDate());
      }
    });

    return () => unsubscribe();
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        if (!audioRef.current.src || audioRef.current.src === window.location.href) {
          // If no source is set, try to get it from status or show error
          console.warn('No hay una fuente de audio configurada.');
          return;
        }
        audioRef.current.play().catch(err => {
          console.error('Error playing audio:', err);
          setIsPlaying(false);
        });
        setupVisualizer();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const setupVisualizer = () => {
    if (!audioRef.current || audioContextRef.current) return;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaElementSource(audioRef.current);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;
    source.connect(analyzer);
    analyzer.connect(audioContext.destination);
    analyzerRef.current = analyzer;

    const updateLevel = () => {
      if (!analyzerRef.current) return;
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 128);
      requestAnimationFrame(updateLevel);
    };
    updateLevel();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="glass rounded-[4rem] border-white/10 shadow-2xl overflow-hidden relative">
        {/* Background Animation */}
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#ff4e00]/10 to-transparent transition-opacity duration-1000 ${isLive ? 'opacity-100' : 'opacity-0'}`} />
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#ff4e00]/5 rounded-full blur-[120px] animate-pulse" />
        </div>

        <div className="relative z-10 p-10 md:p-16 flex flex-col md:flex-row items-center gap-12">
          {/* Visualizer Circle */}
          <div className="relative w-64 h-64 flex items-center justify-center">
            <motion.div 
              animate={{ 
                scale: isPlaying ? [1, 1.05, 1] : 1,
                rotate: isPlaying ? 360 : 0
              }}
              transition={{ 
                scale: { repeat: Infinity, duration: 2 },
                rotate: { repeat: Infinity, duration: 20, ease: "linear" }
              }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-[#ff4e00]/20"
            />
            <div className="w-48 h-48 rounded-full bg-gradient-to-br from-[#ff4e00] to-[#ff4e00]/40 p-1 shadow-[0_0_50px_rgba(255,78,0,0.3)] relative overflow-hidden group">
              <img 
                src="https://picsum.photos/seed/radio/400/400" 
                className="w-full h-full rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                alt="Radio Cover"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <button 
                  onClick={togglePlay}
                  className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-2xl"
                >
                  {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                </button>
              </div>
            </div>
            
            {/* Audio Waves */}
            <div className="absolute -bottom-4 flex items-end gap-1 h-12">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: isPlaying ? `${20 + Math.random() * 80}%` : '10%' 
                  }}
                  transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
                  className="w-1.5 bg-[#ff4e00] rounded-full"
                />
              ))}
            </div>
          </div>

          {/* Info & Controls */}
          <div className="flex-1 text-center md:text-left space-y-8">
            <div className="space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isLive ? 'bg-red-500 text-white animate-pulse' : 'bg-white/10 text-white/40'}`}>
                  <Activity className="w-3 h-3" />
                  {isLive ? 'En Vivo' : 'Fuera del Aire'}
                </div>
                {isLive && startedAt && (
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                    Desde hace {formatDistanceToNow(startedAt, { locale: es })}
                  </span>
                )}
              </div>
              <h1 className="text-4xl md:text-6xl font-display font-black tracking-tighter uppercase italic leading-tight">
                Voz Mixe <span className="text-[#ff4e00]">Radio</span>
              </h1>
              <div className="flex items-center justify-center md:justify-start gap-4 text-white/60">
                <Music className="w-5 h-5 text-[#ff4e00]" />
                <p className="text-xl font-medium italic truncate max-w-md">{currentTrack}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-8">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-white/20" />
                <span className="text-2xl font-black italic">{viewers}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-white/20">Oyentes</span>
              </div>
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-white/20" />
                <span className="text-2xl font-black italic">1.2k</span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-white/20">Likes</span>
              </div>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-6">
              <div className="flex items-center gap-4 bg-white/5 px-6 py-4 rounded-2xl border border-white/10 w-full max-w-xs">
                <button onClick={() => setIsMuted(!isMuted)}>
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-white/40" /> : <Volume2 className="w-5 h-5 text-[#ff4e00]" />}
                </button>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-[#ff4e00] h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef} 
        src={null as any} 
        muted={isMuted}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Community Section */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 glass p-8 rounded-[3rem] border-white/10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-[#ff4e00]" />
              <h2 className="text-xl font-black italic uppercase">Chat de la Cabina</h2>
            </div>
          </div>
          <div className="h-96 flex flex-col items-center justify-center text-white/20 border-2 border-dashed border-white/5 rounded-[2rem]">
            <p className="text-xs font-mono uppercase tracking-widest">El chat se activará pronto</p>
          </div>
        </div>

        <div className="glass p-8 rounded-[3rem] border-white/10">
          <h2 className="text-xl font-black italic uppercase mb-8">Programación</h2>
          <div className="space-y-6">
            {[
              { time: '08:00', title: 'Amanecer Mixe', host: 'Juan Carlos' },
              { time: '12:00', title: 'Noticias de la Región', host: 'María Elena' },
              { time: '16:00', title: 'Tardes de Huapango', host: 'Pedro Luis' },
              { time: '20:00', title: 'Voces del Pasado', host: 'Ana Sofía' }
            ].map((prog, i) => (
              <div key={i} className="flex items-start gap-4 group cursor-pointer">
                <div className="bg-white/5 px-3 py-1 rounded-lg border border-white/10 group-hover:border-[#ff4e00]/50 transition-colors">
                  <span className="text-xs font-mono font-bold text-[#ff4e00]">{prog.time}</span>
                </div>
                <div>
                  <p className="text-sm font-bold group-hover:text-[#ff4e00] transition-colors">{prog.title}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">{prog.host}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadioPlayer;
