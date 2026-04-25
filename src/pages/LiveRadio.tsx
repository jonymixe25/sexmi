import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db, doc, getDoc, updateDoc } from '../firebase';
import { Play, Pause, Volume2, Youtube, Radio } from 'lucide-react';

const LiveRadio = () => {
  const { user } = useAuth();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('offline');
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleStartRadio = async () => {
    if (!youtubeUrl) return;
    // Aquí iría la lógica para enviar la URL al backend para transmitir
    setStatus('live');
    setIsPlaying(true);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-4xl font-black uppercase italic tracking-tighter">Radio en Vivo</h1>
      
      <div className="glass p-8 rounded-3xl space-y-6">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Pega el enlace de YouTube aquí..."
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-brand"
          />
          <button
            onClick={handleStartRadio}
            className="bg-brand text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-brand/90"
          >
            Transmitir
          </button>
        </div>

        <div className="flex items-center justify-between p-6 bg-white/5 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${status === 'live' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="font-bold uppercase tracking-widest">{status === 'live' ? 'En vivo' : 'Fuera de aire'}</span>
          </div>
          {status === 'live' && (
            <button onClick={() => setIsPlaying(!isPlaying)} className="p-4 bg-white/10 rounded-full hover:bg-white/20">
              {isPlaying ? <Pause /> : <Play />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveRadio;
