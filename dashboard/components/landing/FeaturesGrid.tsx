'use client';

import { motion } from 'framer-motion';
import {
  Layers,
  Brain,
  Zap,
  Shield,
  GitBranch,
  Crosshair
} from 'lucide-react';

const features = [
  {
    icon: Layers,
    title: 'Multi-Timeframe Confluence',
    description: 'Analyze market structure across 1m, 5m, 15m, 30m, 4H, Daily, and Weekly charts for ultimate precision',
    gradient: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/20'
  },
  {
    icon: Brain,
    title: 'Smart Money Concepts',
    description: 'Professional order flow analysis including order blocks, liquidity sweeps, FVG, and OTE zones',
    gradient: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/5',
    borderColor: 'border-purple-500/20'
  },
  {
    icon: Zap,
    title: 'Redis Real-Time Data',
    description: '10-100x faster data access with Redis caching. Sub-100ms real-time updates via WebSocket',
    gradient: 'from-yellow-500 to-orange-500',
    bgColor: 'bg-yellow-500/5',
    borderColor: 'border-yellow-500/20'
  },
  {
    icon: GitBranch,
    title: 'Dual Platform Trading',
    description: 'Execute trades on OKX exchange and MT4/MT5 brokers with advanced order management',
    gradient: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/5',
    borderColor: 'border-green-500/20'
  },
  {
    icon: Shield,
    title: 'Advanced Risk Management',
    description: 'Dynamic position sizing, HTF trend alignment, counter-trend filters, and LLM-powered exits',
    gradient: 'from-red-500 to-rose-500',
    bgColor: 'bg-red-500/5',
    borderColor: 'border-red-500/20'
  },
  {
    icon: Crosshair,
    title: 'LLM-Powered Exits',
    description: 'AI continuously monitors open positions and recommends optimal exits based on market conditions',
    gradient: 'from-indigo-500 to-violet-500',
    bgColor: 'bg-indigo-500/5',
    borderColor: 'border-indigo-500/20'
  }
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-24 bg-slate-950 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-sm mb-4 backdrop-blur-sm">
            <Zap className="w-4 h-4" />
            <span>Powerful Features</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Everything You Need to Trade Like a Pro
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Combining cutting-edge AI analysis with professional trading infrastructure
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8 }}
              className="group relative"
            >
              {/* Glassmorphism Card */}
              <div className={`relative h-full p-8 rounded-2xl ${feature.bgColor} border ${feature.borderColor} backdrop-blur-xl transition-all duration-300 hover:shadow-2xl hover:border-opacity-50`}>
                {/* Icon */}
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 transition-all">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-gray-400 leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover Glow Effect */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity blur-xl`}></div>
              </div>

              {/* Border Glow */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${feature.gradient} opacity-0 group-hover:opacity-20 blur-md transition-opacity -z-10`}></div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6"
        >
          <div className="text-center p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-3xl font-bold text-white mb-2">4</div>
            <div className="text-gray-400 text-sm">LLM Specialists</div>
          </div>
          <div className="text-center p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-3xl font-bold text-white mb-2">7</div>
            <div className="text-gray-400 text-sm">Timeframes</div>
          </div>
          <div className="text-center p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-3xl font-bold text-white mb-2">24/7</div>
            <div className="text-gray-400 text-sm">Market Analysis</div>
          </div>
          <div className="text-center p-6 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-3xl font-bold text-white mb-2">&lt;100ms</div>
            <div className="text-gray-400 text-sm">Update Speed</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
