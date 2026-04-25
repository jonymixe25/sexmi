import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { db, collection, addDoc, serverTimestamp, handleFirestoreError } from '../firebase';
import { OperationType } from '../types';
import { Youtube, Music, Plus, Loader2, Play, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Toast from '../components/Toast';

interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  duration: number;
  videoId: string;
  url: string;
}

const YoutubeConverter: React.FC = () => {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  const fetchVideoInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setVideoInfo(null);

    try {
      const response = await fetch(`/api/yt/info?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al obtener información del video');
      }

      setVideoInfo({ ...data, url });
    } catch (err: any) {
      console.error('Error fetching YT info:', err);
      setError(err.message);
      setToast({ message: err.message, type: 'error', isVisible: true });
    } finally {
      setLoading(false);
    }
  };

  const addToPlaylist = async () => {
    if (!user || !videoInfo) return;

    setLoading(true);
    try {
      // The stream URL will be our proxy endpoint
      const streamUrl = `${window.location.origin}/api/yt/stream?url=${encodeURIComponent(videoInfo.url)}`;
      
      await addDoc(collection(db, 'radio_playlist'), {
        title: videoInfo.title,
        artist: videoInfo.author,
        url: streamUrl,
        duration: videoInfo.duration,
        addedBy: user.uid,
        createdAt: serverTimestamp()
      });

      setToast({ message: '¡Canción añadida a la radio!', type: 'success', isVisible: true });
      setVideoInfo(null);
      setUrl('');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'radio_playlist');
      setToast({ message: 'Error al añadir a la lista', type: 'error', isVisible: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-[3rem] border-white/10 p-8 md:p-12 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#ff4e00]/5 rounded-full blur-[100px]" />
        
        <div className="relative z-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/20">
              <Youtube className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-black tracking-tighter uppercase italic">
                YouTube <span className="text-[#ff4e00]">Radio</span>
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">Convertidor de Audio para la Cabina</p>
            </div>
          </div>

          <form onSubmit={fetchVideoInfo} className="space-y-4">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Pega el link de YouTube aquí..." 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pl-14 text-sm outline-none focus:border-[#ff4e00] transition-all"
                required
              />
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
            </div>
            <button 
              type="submit"
              disabled={loading || !url}
              className="w-full h-16 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-[#ff4e00] hover:text-white transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>
                  <Search className="w-5 h-5" />
                  Buscar Video
                </>
              )}
            </button>
          </form>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-500 text-sm"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            {videoInfo && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group"
              >
                <div className="aspect-video relative overflow-hidden">
                  <img 
                    src={videoInfo.thumbnail} 
                    alt={videoInfo.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-4 left-6 right-6">
                    <p className="text-xs font-mono text-[#ff4e00] uppercase tracking-widest mb-1">{videoInfo.author}</p>
                    <h3 className="text-xl font-black italic uppercase leading-tight line-clamp-2">{videoInfo.title}</h3>
                  </div>
                </div>
                
                <div className="p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-white/40">
                    <span>Duración: {Math.floor(videoInfo.duration / 60)}:{(videoInfo.duration % 60).toString().padStart(2, '0')}</span>
                    <span>ID: {videoInfo.videoId}</span>
                  </div>
                  
                  <button 
                    onClick={addToPlaylist}
                    disabled={loading}
                    className="w-full h-14 bg-[#ff4e00] text-white font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      <>
                        <Plus className="w-5 h-5" />
                        Añadir a la Radio
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-6 border-t border-white/5">
            <div className="flex items-start gap-4 text-white/40">
              <CheckCircle2 className="w-5 h-5 text-[#ff4e00] shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-white/60">¿Cómo funciona?</p>
                <p className="text-[10px] leading-relaxed">
                  Pega cualquier enlace de YouTube. Nuestro sistema extraerá el audio y lo preparará para ser transmitido en la radio de Voz Mixe. Las canciones se añadirán automáticamente a la lista de reproducción de la cabina.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <Toast 
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast({ ...toast, isVisible: false })}
      />
    </div>
  );
};

export default YoutubeConverter;
