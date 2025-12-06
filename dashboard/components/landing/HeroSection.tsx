'use client';

import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, Activity } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function HeroSection() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:14px_24px]"></div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm mb-8 backdrop-blur-sm"
        >
          <Activity className="w-4 h-4 animate-pulse" />
          <span>4 LLM Specialists • Multi-Timeframe Analysis • Professional Trading</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight"
        >
          AI-Powered Scalping Bot
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            That Never Sleeps
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto"
        >
          Powered by 4 specialized LLM experts analyzing Fibonacci, Trends, Volume, and Support/Resistance levels across multiple timeframes
        </motion.p>

        {/* Live Stats Ticker */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-6 mb-12 text-sm sm:text-base"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-gray-400">Live Trading:</span>
            <span className="text-white font-semibold">Active</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm">
            <span className="text-gray-400">Timeframes:</span>
            <span className="text-white font-semibold">1m to Weekly</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm">
            <span className="text-gray-400">Platforms:</span>
            <span className="text-white font-semibold">OKX • MT4</span>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={() => router.push('/dashboard')}
            className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white font-semibold text-lg hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105"
          >
            <span className="flex items-center gap-2">
              Enter Dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
          <button
            onClick={() => {
              document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-8 py-4 bg-white/5 border border-white/20 rounded-lg text-white font-semibold text-lg hover:bg-white/10 transition-all duration-300 backdrop-blur-sm"
          >
            Learn More
          </button>
        </motion.div>

        {/* Feature Pills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-4 text-sm"
        >
          <div className="px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full text-green-400 backdrop-blur-sm">
            ✓ 10-100x Faster with Redis
          </div>
          <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full text-blue-400 backdrop-blur-sm">
            ✓ 4-LLM Consensus System
          </div>
          <div className="px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-full text-purple-400 backdrop-blur-sm">
            ✓ Smart Money Concepts
          </div>
          <div className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 backdrop-blur-sm">
            ✓ Real-time WebSocket
          </div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
      >
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-1">
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1 h-2 bg-white/60 rounded-full"
          ></motion.div>
        </div>
      </motion.div>
    </div>
  );
}
