import React from 'react';
import { motion } from 'motion/react';
import { Shield, Star, Award, Linkedin, Twitter, Mail, ExternalLink } from 'lucide-react';

const admins = [
  {
    name: "Jonatan García Díaz",
    role: "Gerente General y Creador de Plataforma",
    image: "https://i.postimg.cc/85v2mX3C/jonatan-garcia.jpg", // Placeholder or user can update
    bio: "Visionario y líder tecnológico dedicado a la preservación y difusión de la cultura Mixe a través de la innovación digital. Fundador de Voz Mixe Live.",
    specialties: ["Liderazgo", "Estrategia Digital", "Desarrollo de Plataformas"],
    social: {
      linkedin: "#",
      twitter: "#",
      email: "jonyoax95@gmail.com"
    }
  }
];

export default function Admins() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="text-center mb-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 border border-brand/20 text-brand text-[10px] font-black uppercase tracking-widest mb-6"
        >
          <Shield className="w-3 h-3" />
          <span>Nuestro Equipo</span>
        </motion.div>
        <h1 className="text-5xl md:text-7xl font-display font-black tracking-tighter uppercase italic mb-6">
          Administradores <span className="text-brand">y Creadores</span>
        </h1>
        <p className="text-white/40 text-sm font-mono max-w-2xl mx-auto uppercase tracking-widest leading-relaxed">
          Las mentes detrás de la plataforma digital que conecta a la nación Mixe con el mundo.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {admins.map((admin, index) => (
          <motion.div
            key={admin.name}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.2 }}
            className="group relative"
          >
            <div className="absolute inset-0 bg-brand/20 blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            
            <div className="relative glass rounded-[3rem] border-white/10 overflow-hidden hover:border-brand/30 transition-all duration-500 h-full flex flex-col">
              <div className="aspect-[4/5] relative overflow-hidden">
                <img 
                  src={admin.image} 
                  alt={admin.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${admin.name}`;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0502] via-transparent to-transparent opacity-60" />
                
                <div className="absolute top-6 right-6">
                  <div className="w-12 h-12 rounded-2xl bg-brand/20 backdrop-blur-md border border-white/20 flex items-center justify-center">
                    <Award className="w-6 h-6 text-brand" />
                  </div>
                </div>
              </div>

              <div className="p-10 flex-1 flex flex-col">
                <div className="mb-6">
                  <h3 className="text-2xl font-display font-black tracking-tight uppercase italic mb-2 group-hover:text-brand transition-colors">
                    {admin.name}
                  </h3>
                  <p className="text-brand text-[10px] font-black uppercase tracking-widest">
                    {admin.role}
                  </p>
                </div>

                <p className="text-white/60 text-sm leading-relaxed mb-8 italic">
                  "{admin.bio}"
                </p>

                <div className="flex flex-wrap gap-2 mb-8">
                  {admin.specialties.map(spec => (
                    <span key={spec} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/40">
                      {spec}
                    </span>
                  ))}
                </div>

                <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <a href={admin.social.linkedin} className="text-white/20 hover:text-brand transition-colors">
                      <Linkedin className="w-4 h-4" />
                    </a>
                    <a href={admin.social.twitter} className="text-white/20 hover:text-brand transition-colors">
                      <Twitter className="w-4 h-4" />
                    </a>
                    <a href={`mailto:${admin.social.email}`} className="text-white/20 hover:text-brand transition-colors">
                      <Mail className="w-4 h-4" />
                    </a>
                  </div>
                  <button className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-brand flex items-center gap-2 transition-all">
                    <span>Ver Perfil</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-32 p-12 glass rounded-[3rem] border-white/10 text-center relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-brand/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-brand/5 rounded-full blur-[100px]" />
        
        <div className="relative z-10">
          <Star className="w-12 h-12 text-brand mx-auto mb-8 animate-pulse" />
          <h2 className="text-3xl md:text-5xl font-display font-black tracking-tighter uppercase italic mb-6">
            ¿Quieres formar parte <br /> <span className="text-brand">de nuestro equipo?</span>
          </h2>
          <p className="text-white/40 text-sm font-mono max-w-xl mx-auto uppercase tracking-widest leading-relaxed mb-10">
            Buscamos personas apasionadas por la cultura y la tecnología que quieran contribuir al crecimiento de Voz Mixe Live.
          </p>
          <button className="bg-brand px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand/90 hover:scale-105 active:scale-95 transition-all duration-500 shadow-2xl shadow-brand/30">
            Contactar con Administración
          </button>
        </div>
      </div>
    </div>
  );
}
