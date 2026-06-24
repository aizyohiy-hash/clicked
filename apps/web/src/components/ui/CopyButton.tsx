'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CopyButtonProps {
  value: string;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ value, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevents triggering click events on parent elements (like wallet cards)

    if (copied) return;

    try {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <button
      onClick={handleCopy}
      type="button"
      className={`relative flex items-center justify-center p-2 rounded-xl border border-gray-100 hover:border-gray-200 bg-slate-50/50 hover:bg-slate-50 text-[#0C3F51] transition-colors focus:outline-none focus:ring-2 focus:ring-[#0C3F51]/20 active:scale-95 duration-200 ${className}`}
      aria-label={copied ? 'Copied address' : 'Copy address'}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.div
            key="check"
            initial={{ scale: 0.6, opacity: 0, rotate: -45 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0, rotate: 45 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="text-emerald-600 dark:text-emerald-500"
          >
            <Check size={16} strokeWidth={2.5} />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <Copy size={16} strokeWidth={2} />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
};

export default CopyButton;
