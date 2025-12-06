'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Shield, Lock, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function CTASection() {
  const router = useRouter();

  return (
    <section className="py-24 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:14px_24px]"></div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Main Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            Ready to Trade
            <span className="block mt-2 bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Like a Professional?
            </span>
          </h2>
        </motion.div>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto"
        >
          Access the power of 4 LLM specialists, multi-timeframe analysis, and professional trading tools.
          Start making smarter trading decisions today.
        </motion.p>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-12"
        >
          <button
            onClick={() => router.push('/dashboard')}
            className="group relative inline-flex items-center gap-3 px-12 py-5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl text-white font-bold text-xl hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105"
          >
            <span>Enter Dashboard</span>
            <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
          </button>
        </motion.div>

        {/* Security Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-6 mb-8"
        >
          <div className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-lg backdrop-blur-sm">
            <Lock className="w-5 h-5 text-green-400" />
            <span className="text-gray-300 font-medium">JWT Authentication</span>
          </div>
          <div className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-lg backdrop-blur-sm">
            <Shield className="w-5 h-5 text-blue-400" />
            <span className="text-gray-300 font-medium">Encrypted API Keys</span>
          </div>
          <div className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-lg backdrop-blur-sm">
            <Zap className="w-5 h-5 text-purple-400" />
            <span className="text-gray-300 font-medium">Rate Limited</span>
          </div>
        </motion.div>

        {/* Fine Print */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-sm text-gray-500"
        >
          No credit card required to explore • Professional trading tools • Enterprise-grade security
        </motion.p>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
    </section>
  );
}
