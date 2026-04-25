import React, { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, orderBy, limit, doc } from '../firebase';
import { StreamSession } from '../types';
import { Video, Users, Play, Radio, Newspaper, ArrowRight, Folder, Sparkles, Languages, Clock, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const Home: React.FC = () => {
  const { user } = useAuth();
  const [streams, setStreams] = useState<StreamSession[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mixeWord, setMixeWord] = useState({ mixe: 'Määy', spanish: 'Buenos días', pronunciation: 'Ma-ai' });
  const [globalSettings, setGlobalSettings] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setGlobalSettings(snapshot.data());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const words = [
      { mixe: 'Määy', spanish: 'Buenos días', pronunciation: 'Ma-ai' },
      { mixe: 'Tsä’äm', spanish: 'Fruta', pronunciation: 'Tsa-am' },
      { mixe: 'Poj', spanish: 'Viento', pronunciation: 'Poj' },
      { mixe: 'Kääw', spanish: 'Caballo', pronunciation: 'Ka-aw' },
      { mixe: 'Mëj', spanish: 'Grande', pronunciation: 'Mej' }
    ];
    setMixeWord(words[Math.floor(Math.random() * words.length)]);
  }, []);

  useEffect(() => {
    const streamsQuery = query(
      collection(db, 'streams'), 
      where('status', '==', 'live'),
      where('privacy', '==', 'public')
    );
    const unsubscribeStreams = onSnapshot(streamsQuery, (snapshot) => {
      const liveStreams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StreamSession));
      setStreams(liveStreams);
    }, (error) => {
      console.error('Error fetching live streams:', error);
    });

    const newsQuery = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(3));
    const unsubscribeNews = onSnapshot(newsQuery, (snapshot) => {
      setNews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error('Error fetching news:', error);
      setLoading(false);
    });

    return () => {
      unsubscribeStreams();
      unsubscribeNews();
    };
  }, []);

  return (
    <div className="space-y-20 md:space-y-32">
      {/* Hero Section */}
      <section className="relative h-[90vh] rounded-[4rem] overflow-hidden flex items-center justify-center group shadow-2xl shadow-black/50">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0502]/40 to-[#0a0502] z-10" />
        <motion.img
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ duration: 20, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
          src="https://picsum.photos/seed/mixe-culture/1920/1080?blur=2"
          alt="Voz Mixe Hero"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          referrerPolicy="no-referrer"
        />
        
        {/* Background Text Effect (Recipe 2) */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none">
          <motion.span 
            initial={{ opacity: 0, scale: 1.2 }}
            animate={{ opacity: 0.03, scale: 1 }}
            transition={{ duration: 2 }}
            className="text-[40vw] font-display font-black uppercase italic tracking-tighter leading-none whitespace-nowrap"
          >
            {globalSettings?.appName?.split(' ')[0] || 'VOZ'}
          </motion.span>
        </div>

        <div className="relative z-20 text-center max-w-6xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-brand/10 border border-brand/30 text-brand text-[10px] md:text-xs font-black uppercase tracking-[0.4em] mb-12 backdrop-blur-md shadow-[0_0_20px_rgba(255,78,0,0.1)]"
          >
            <Sparkles className="w-3 h-3 animate-pulse" />
            <span>Cultura • Tradición • Comunidad</span>
          </motion.div>
          
          <div className="space-y-4">
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="text-7xl sm:text-9xl md:text-[12rem] font-display font-black tracking-tighter uppercase italic leading-[0.75]"
            >
              <span className="block text-white drop-shadow-2xl">{globalSettings?.appName?.split(' ')[0] || 'La Voz'}</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand via-brand/80 to-brand bg-[length:200%_auto] animate-gradient drop-shadow-[0_0_30px_rgba(255,78,0,0.3)]">
                {globalSettings?.appName?.split(' ').slice(1).join(' ') || 'Mixe'}
              </span>
            </motion.h1>
          </div>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 1 }}
            className="mt-12 text-xl sm:text-2xl md:text-3xl text-white/40 font-medium italic max-w-3xl mx-auto leading-tight"
          >
            <span>"La región de los jamás conquistados" — Conectando al pueblo Mixe a través de la tecnología.</span>
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="mt-20 flex flex-wrap justify-center gap-8"
          >
            <Link 
              to="/news"
              className="w-full sm:w-auto bg-white text-black px-14 py-7 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-brand hover:text-white transition-all duration-500 transform hover:-translate-y-2 active:scale-95 shadow-2xl shadow-white/5 group"
            >
              <Newspaper className="w-6 h-6 group-hover:rotate-12 transition-transform" />
              <span>Explorar Noticias</span>
            </Link>
            {streams.length > 0 && (
              <Link 
                to={`/stream/${streams[0].id}`}
                className="w-full sm:w-auto glass text-white px-14 py-7 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-white/10 transition-all duration-500 transform hover:-translate-y-2 active:scale-95 group"
              >
                <Radio className="w-6 h-6 text-brand animate-pulse group-hover:scale-110 transition-transform" />
                <span>En Vivo Ahora</span>
              </Link>
            )}
            <Link 
              to="/web"
              className="w-full sm:w-auto bg-brand text-white px-14 py-7 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-4 hover:bg-brand-light transition-all duration-500 transform hover:-translate-y-2 active:scale-95 shadow-2xl shadow-brand/20 group"
            >
              <Folder className="w-6 h-6 group-hover:rotate-12 transition-transform" />
              <span>Segunda Plataforma</span>
            </Link>
          </motion.div>
        </div>
        
        {/* Scroll Indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-4"
        >
          <span className="text-[8px] font-black uppercase tracking-[0.5em] text-white/20">Deslizar</span>
          <div className="w-px h-12 bg-gradient-to-b from-brand to-transparent" />
        </motion.div>
      </section>

      {/* Welcome Message Section */}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 px-2">
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-2"
          >
            <div className="glass p-10 md:p-16 rounded-[4rem] flex flex-col md:flex-row items-center justify-between gap-12 border-white/10 shadow-2xl h-full relative overflow-hidden group">
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-brand/5 rounded-full blur-[100px] group-hover:bg-brand/10 transition-all duration-700" />
              <div className="space-y-6 text-center md:text-left relative z-10">
                <div className="flex items-center justify-center md:justify-start gap-4 text-brand">
                  <div className="w-8 h-px bg-brand/30" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em]">Bienvenido de nuevo</span>
                </div>
                <h2 className="text-5xl md:text-7xl font-display font-black tracking-tighter uppercase italic leading-none">
                  <span>¡Hola, {user.displayName}!</span>
                </h2>
                <p className="text-white/40 text-xl italic max-w-xl leading-relaxed">
                  <span>Es un gusto tenerte de vuelta en la comunidad. Explora las últimas noticias y transmisiones en vivo de nuestra región.</span>
                </p>
              </div>
              <Link 
                to="/profile"
                className="group relative flex items-center gap-6 bg-white/5 hover:bg-white/10 p-6 pr-10 rounded-[2.5rem] transition-all duration-500 border border-white/10 shadow-xl"
              >
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-brand/30 group-hover:border-brand transition-colors shadow-2xl">
                  <img 
                    src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                    alt={user.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Tu Perfil</p>
                  <p className="text-xl font-bold text-white group-hover:text-brand transition-colors">Ver mi cuenta</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-all">
                  <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            </div>
          </motion.section>

          {/* Mixe Word of the Day (Recipe 3: Hardware feel) */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="h-full"
          >
            <div className="bg-[#151619] p-10 md:p-12 rounded-[4rem] border border-white/5 shadow-2xl h-full flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8">
                <div className="w-32 h-32 border border-dashed border-white/5 rounded-full animate-[spin_20s_linear_infinite]" />
              </div>
              
              <div className="space-y-8 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-brand">
                    <Languages className="w-5 h-5" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.4em]">Ayuujk Jää</span>
                  </div>
                  <div className="px-3 py-1 bg-brand/10 rounded-full border border-brand/20">
                    <span className="text-[8px] font-mono uppercase tracking-widest text-brand">Daily Word</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-6xl font-display font-black text-white italic tracking-tighter uppercase leading-none group-hover:text-brand transition-colors">
                    {mixeWord.mixe}
                  </h3>
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-4 h-4 text-white/20" />
                    <p className="text-white/40 text-xs font-mono uppercase tracking-widest">
                      Pronunciación: <span className="text-white/80">{mixeWord.pronunciation}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-12 pt-10 border-t border-dashed border-white/10 relative z-10">
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/20 mb-4">Traducción</p>
                <p className="text-4xl font-display font-bold text-white italic tracking-tight">
                  "{mixeWord.spanish}"
                </p>
              </div>
            </div>
          </motion.section>
        </div>
      )}

      {/* Live Streams Grid */}
      <section className="space-y-16">
        <div className="flex items-end justify-between px-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-brand">
              <div className="w-12 h-px bg-brand/30" />
              <span className="text-xs font-black uppercase tracking-[0.4em]">Transmisiones</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-display font-black tracking-tighter uppercase italic leading-none">
              <span>En Vivo <span className="text-brand">Ahora</span></span>
            </h2>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-2">
            <span className="text-brand text-2xl font-display font-black italic tracking-tighter">{streams.length}</span>
            <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">Canales Activos</span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 px-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="aspect-video glass rounded-[3rem] animate-pulse" />
            ))}
          </div>
        ) : streams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 px-4">
            {streams.map((stream, idx) => (
              <motion.div
                key={stream.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
              >
                <Link
                  to={`/stream/${stream.id}`}
                  className="group relative block aspect-video rounded-[3rem] overflow-hidden glass glass-hover shadow-2xl"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-brand/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  
                  <div className="absolute inset-0 flex items-center justify-center z-20">
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center scale-0 group-hover:scale-100 transition-all duration-500 shadow-2xl border border-white/20">
                      <Play className="w-10 h-10 text-white fill-current translate-x-1" />
                    </div>
                  </div>
                  
                  <div className="absolute top-8 left-8 z-20">
                    <div className="bg-red-600 px-4 py-2 rounded-full flex items-center gap-3 text-[10px] font-black uppercase tracking-widest shadow-2xl border border-white/10">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span>Live</span>
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-[#0a0502] via-[#0a0502]/80 to-transparent z-10">
                    <h3 className="text-2xl font-display font-bold truncate group-hover:text-brand transition-colors duration-500 tracking-tight">
                      {stream.title}
                    </h3>
                    <div className="flex items-center justify-between mt-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-white/10 p-0.5 border border-white/10 shadow-xl group-hover:border-brand/50 transition-colors">
                          <img 
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${stream.userId}`} 
                            alt="avatar" 
                            className="w-full h-full rounded-[0.8rem] bg-[#0a0502] object-cover"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-0.5">Streamer</span>
                          <span className="text-xs font-bold tracking-widest uppercase text-white/80">{stream.userName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-black text-white/60 tracking-widest uppercase bg-white/5 px-4 py-2 rounded-full border border-white/5">
                        <Users className="w-3.5 h-3.5 text-brand" />
                        <span>{stream.viewerCount}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-32 text-center glass rounded-[4rem] border-dashed border-white/10 mx-4">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/10">
              <Video className="w-12 h-12 text-white/10" />
            </div>
            <p className="text-white/40 font-display text-2xl italic mb-10"><span>No hay transmisiones en vivo en este momento.</span></p>
            <Link to="/admin" className="inline-flex bg-brand px-12 py-6 rounded-2xl font-black uppercase tracking-widest hover:scale-105 hover:bg-brand-light transition-all shadow-2xl shadow-brand/20 active:scale-95">
              <span>¡Sé el primero en transmitir!</span>
            </Link>
          </div>
        )}
      </section>

      {/* Mixe Radio Section (Recipe 3: Hardware feel) */}
      <section className="space-y-16">
        <div className="flex items-center justify-between px-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-brand">
              <Volume2 className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-[0.4em]">Radio en Línea</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-display font-black tracking-tighter uppercase italic leading-none">
              <span>Radio <span className="text-brand">Ayuujk</span></span>
            </h2>
          </div>
        </div>
        <div className="bg-[#151619] p-10 md:p-20 rounded-[4rem] border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-16 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity duration-1000">
            <Radio className="w-[30rem] h-[30rem] text-brand" />
          </div>
          
          <div className="absolute left-0 top-0 bottom-0 w-1 border-l border-dashed border-white/10" />
          <div className="absolute right-0 top-0 bottom-0 w-1 border-r border-dashed border-white/10" />
          
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24 relative z-10">
            <div className="relative">
              <div className="w-64 h-64 bg-brand rounded-[3.5rem] flex items-center justify-center shadow-[0_0_50px_rgba(255,78,0,0.4)] group-hover:rotate-6 transition-all duration-700 relative z-10">
                <Radio className="w-32 h-32 text-white" />
              </div>
              <div className="absolute -inset-4 border border-dashed border-brand/30 rounded-[4rem] animate-[spin_15s_linear_infinite]" />
            </div>
            
            <div className="flex-1 space-y-10 text-center lg:text-left">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-brand/10 rounded-full border border-brand/20 mb-2">
                  <div className="w-2 h-2 bg-brand rounded-full animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-brand">On Air</span>
                </div>
                <h3 className="text-4xl md:text-6xl font-display font-black uppercase italic tracking-tight leading-none">Sintonía Directa</h3>
                <p className="text-white/40 text-xl italic max-w-2xl leading-relaxed">Escucha la música y las voces de nuestra tierra en cualquier parte del mundo. Un puente sonoro hacia nuestras raíces.</p>
              </div>
              
              <div className="flex flex-wrap justify-center lg:justify-start gap-6">
                <button className="bg-white text-black px-14 py-6 rounded-2xl font-black uppercase tracking-widest flex items-center gap-4 hover:bg-brand hover:text-white transition-all duration-500 shadow-2xl shadow-white/5 active:scale-95 group">
                  <Play className="w-6 h-6 fill-current group-hover:scale-110 transition-transform" />
                  <span>Escuchar Ahora</span>
                </button>
                <div className="bg-black/40 backdrop-blur-md px-10 py-6 rounded-2xl border border-white/5 flex items-center gap-6 group hover:border-brand/30 transition-colors">
                  <div className="flex flex-col items-end">
                    <span className="text-brand text-2xl font-display font-black italic tracking-tighter">124</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/20">Oyentes</span>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex -space-x-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-[#151619] overflow-hidden bg-white/5">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stream Schedule Section */}
      <section className="space-y-16">
        <div className="flex items-center gap-4 text-brand px-6">
          <Clock className="w-5 h-5" />
          <span className="text-xs font-black uppercase tracking-[0.4em]">Programación Semanal</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 px-4">
          {[
            { day: 'Lunes', time: '18:00', title: 'Música Tradicional', host: 'Juan P.', color: 'from-brand/20' },
            { day: 'Miércoles', time: '19:30', title: 'Historias Ayuujk', host: 'María G.', color: 'from-blue-500/10' },
            { day: 'Viernes', time: '20:00', title: 'Noticias de la Región', host: 'Pedro S.', color: 'from-emerald-500/10' },
            { day: 'Domingo', time: '10:00', title: 'Misa y Comunidad', host: 'Padre Luis', color: 'from-purple-500/10' }
          ].map((item, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`group relative glass p-8 rounded-[3rem] border-white/10 hover:border-brand/30 transition-all duration-500 overflow-hidden`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${item.color} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-8">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand px-3 py-1 bg-brand/10 rounded-full">{item.day}</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">{item.time}</span>
                </div>
                <h4 className="text-xl font-display font-bold group-hover:text-brand transition-colors mb-3 tracking-tight leading-tight">{item.title}</h4>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-px bg-white/10 group-hover:w-10 group-hover:bg-brand/30 transition-all duration-500" />
                  <p className="text-[10px] text-white/20 font-black uppercase tracking-widest italic">{item.host}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Latest News Section */}
      <section className="space-y-16">
        <div className="flex items-end justify-between px-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-brand">
              <Newspaper className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-[0.4em]">Actualidad</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-display font-black tracking-tighter uppercase italic leading-none">
              <span>Noticias <span className="text-brand">Recientes</span></span>
            </h2>
          </div>
          <Link to="/news" className="group flex items-center gap-4 text-brand text-xs font-black uppercase tracking-[0.4em] hover:text-brand-light transition-all">
            <span>Ver todas</span>
            <div className="w-12 h-12 rounded-full border border-brand/20 flex items-center justify-center group-hover:bg-brand group-hover:text-white transition-all">
              <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 px-4">
          {news.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={index === 0 ? 'md:col-span-2 lg:col-span-2' : ''}
            >
              <Link
                to="/news"
                className="group block glass rounded-[4rem] overflow-hidden glass-hover h-full shadow-2xl border-white/5"
              >
                <div className={`relative overflow-hidden ${index === 0 ? 'aspect-[21/9]' : 'aspect-[4/3]'}`}>
                  <img
                    src={article.imageUrl || `https://picsum.photos/seed/${article.id}/800/600`}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0502] via-[#0a0502]/40 to-transparent opacity-80" />
                  
                  <div className="absolute top-8 right-8">
                    <div className="glass px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest backdrop-blur-md border-white/10">
                      {new Date(article.createdAt?.seconds * 1000).toLocaleDateString() || 'Reciente'}
                    </div>
                  </div>
                </div>
                <div className="p-10 md:p-14 space-y-6">
                  <h3 className={`font-display font-black leading-[0.9] group-hover:text-brand transition-colors duration-500 tracking-tighter uppercase italic ${index === 0 ? 'text-5xl md:text-7xl' : 'text-3xl md:text-4xl'}`}>
                    {article.title}
                  </h3>
                  <p className={`text-white/40 italic leading-relaxed line-clamp-2 ${index === 0 ? 'text-xl max-w-2xl' : 'text-lg'}`}>
                    {article.content}
                  </p>
                  <div className="pt-6 flex items-center gap-4 group/btn">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-brand">Leer Artículo</span>
                    <div className="flex-1 h-px bg-brand/20 group-hover/btn:bg-brand/50 transition-all duration-500" />
                    <ArrowRight className="w-5 h-5 text-brand transform group-hover/btn:translate-x-2 transition-transform" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
          {news.length === 0 && !loading && (
            <div className="col-span-full py-32 text-center glass rounded-[4rem] border-dashed border-white/10">
              <p className="text-white/40 font-display text-2xl italic"><span>No hay noticias recientes.</span></p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
};

export default Home;
