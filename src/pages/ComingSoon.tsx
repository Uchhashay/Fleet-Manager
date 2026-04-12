import React from 'react';
import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title: string;
}

export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-24 w-24 rounded-full bg-accent/10 flex items-center justify-center text-accent"
      >
        <Construction className="h-12 w-12 stroke-[1.5px]" />
      </motion.div>
      
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-primary tracking-tight">{title}</h2>
        <p className="text-secondary font-medium">This module is currently under development.</p>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="px-6 py-2 rounded-full bg-surface border border-border text-xs font-bold uppercase tracking-widest text-secondary"
      >
        Coming Soon
      </motion.div>
    </div>
  );
}
