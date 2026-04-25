import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { db, collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, handleFirestoreError } from '../firebase';
import { OperationType } from '../types';
import { Send, Loader2, MessageSquare, Users, Sparkles, Image as ImageIcon, Heart } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import Toast from '../components/Toast';

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  createdAt: any;
  type?: 'text' | 'system';
}

const CommunityChat: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; isVisible: boolean }>({
    message: '',
    type: 'success',
    isVisible: false
  });

  useEffect(() => {
    const q = query(
      collection(db, 'community_chat'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as ChatMessage)).reverse();
      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'community_chat');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    const text = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      await addDoc(collection(db, 'community_chat'), {
        userId: user.uid,
        userName: user.displayName || 'Usuario',
        userPhoto: user.photoURL,
        text,
        createdAt: serverTimestamp(),
        type: 'text'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'community_chat');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-12rem)] flex flex-col glass border-white/10 rounded-[3rem] overflow-hidden shadow-2xl relative">
      {/* Header */}
      <div className="px-10 py-8 border-b border-white/10 bg-white/5 backdrop-blur-xl flex items-center justify-between z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[#ff4e00]/10 rounded-2xl flex items-center justify-center border border-[#ff4e00]/20 shadow-lg shadow-[#ff4e00]/5">
            <MessageSquare className="w-8 h-8 text-[#ff4e00]" />
          </div>
          <div className="space-y-1">
            <h2 className="text-3xl font-display font-black tracking-tighter uppercase italic leading-none">
              Chat <span className="text-[#ff4e00]">Comunitario</span>
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-5 h-5 rounded-full border-2 border-[#0a0502] bg-white/10 overflow-hidden">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i * 123}`} alt="" />
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                <span className="text-emerald-400 animate-pulse mr-2">●</span>
                En vivo ahora
              </span>
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <div className="glass px-6 py-3 rounded-2xl border-white/10 flex items-center gap-3">
            <Users className="w-4 h-4 text-white/40" />
            <span className="text-xs font-bold text-white/60">124 Miembros</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-10 py-12 space-y-10 custom-scrollbar bg-gradient-to-b from-transparent to-white/[0.02]">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-[#ff4e00] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-8 opacity-20">
            <Sparkles className="w-20 h-20" />
            <div className="space-y-2">
              <p className="font-display text-3xl font-black uppercase italic tracking-tighter">Sé el primero</p>
              <p className="text-lg italic">Rompe el hielo y saluda a la comunidad</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.userId === user?.uid;
            return (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                key={msg.id}
                className={`flex gap-4 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-12 h-12 rounded-2xl p-0.5 border transition-all duration-500 ${isMe ? 'border-[#ff4e00]/50' : 'border-white/10'}`}>
                    <img 
                      src={msg.userPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userId}`} 
                      alt="" 
                      className="w-full h-full object-cover rounded-[0.8rem]"
                    />
                  </div>
                </div>
                
                <div className={`flex flex-col gap-2 max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-3 px-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{msg.userName}</span>
                    <span className="text-[8px] font-mono text-white/20">
                      {msg.createdAt ? format(msg.createdAt.toDate(), 'HH:mm', { locale: es }) : 'Ahora'}
                    </span>
                  </div>
                  
                  <div className={`px-8 py-5 rounded-[2.5rem] text-sm font-medium shadow-2xl relative group ${
                    isMe 
                      ? 'bg-[#ff4e00] text-white rounded-tr-none' 
                      : 'glass text-white/80 rounded-tl-none border-white/10'
                  }`}>
                    <p className="leading-relaxed italic"><span>{msg.text}</span></p>
                    <div className={`absolute top-0 ${isMe ? '-right-2' : '-left-2'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                      <div className={`w-4 h-4 rotate-45 ${isMe ? 'bg-[#ff4e00]' : 'bg-white/10'}`} />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-10 border-t border-white/10 bg-white/5 backdrop-blur-xl">
        <form onSubmit={handleSend} className="flex gap-6 items-center max-w-4xl mx-auto">
          <button 
            type="button"
            className="p-5 glass rounded-2xl hover:bg-white/10 text-white/20 hover:text-[#ff4e00] transition-all duration-500 border-white/10 group"
          >
            <ImageIcon className="w-7 h-7 group-hover:scale-110 transition-transform" />
          </button>
          
          <div className="flex-1 relative group">
            <input 
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Escribe un mensaje para la comunidad..."
              className="w-full bg-white/5 border border-white/10 rounded-[2.5rem] px-10 py-5 text-base font-medium outline-none focus:border-[#ff4e00] focus:bg-white/10 transition-all placeholder:text-white/20"
            />
            <div className="absolute inset-0 rounded-[2.5rem] bg-[#ff4e00]/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
          </div>

          <button 
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-6 bg-[#ff4e00] text-white rounded-[2rem] hover:bg-[#ff4e00]/90 transition-all duration-500 shadow-2xl shadow-[#ff4e00]/30 disabled:opacity-50 disabled:scale-95 active:scale-90 group"
          >
            {sending ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : (
              <Send className="w-7 h-7 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            )}
          </button>
        </form>
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

export default CommunityChat;
