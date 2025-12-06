'use client';

import { motion } from 'framer-motion';
import { Activity, TrendingUp, BarChart3, Target, Vote } from 'lucide-react';

const specialists = [
  {
    id: 'fibonacci',
    name: 'Fibonacci Expert',
    icon: Activity,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    description: 'Identifies golden pockets, retracements, and extension levels for optimal entry zones',
    features: ['Golden Pocket (61.8%)', 'Fibonacci Retracements', 'Extension Targets', 'OTE Zones']
  },
  {
    id: 'trend',
    name: 'Trend & Momentum',
    icon: TrendingUp,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    description: 'Analyzes market direction, momentum strength, and trend alignment across timeframes',
    features: ['Bullish/Bearish Bias', 'Momentum Strength', 'EMA Crossovers', 'ADX Analysis']
  },
  {
    id: 'volume',
    name: 'Volume & Price Action',
    icon: BarChart3,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    description: 'Detects volume spikes, liquidity zones, and price action patterns for confirmation',
    features: ['Volume Spikes', 'Liquidity Detection', 'Breakout Confirmation', 'Price Action']
  },
  {
    id: 'support-resistance',
    name: 'Support & Resistance',
    icon: Target,
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    description: 'Maps critical support/resistance levels, order blocks, and liquidity sweeps',
    features: ['Order Blocks', 'Liquidity Sweeps', 'Key S/R Levels', 'Fair Value Gaps']
  }
];

export function LLMSpecialists() {
  return (
    <section id="llm-specialists" className="py-24 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:14px_24px]"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400 text-sm mb-4 backdrop-blur-sm">
            <Vote className="w-4 h-4" />
            <span>AI-Powered Analysis</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            4 Specialized LLM Experts
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Each AI specialist analyzes different market aspects, then votes on the optimal trade direction.
            <span className="text-white font-semibold"> Requires 3/4 consensus</span> for signal execution.
          </p>
        </motion.div>

        {/* Specialists Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {specialists.map((specialist, index) => (
            <motion.div
              key={specialist.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className={`relative group p-6 rounded-2xl ${specialist.bgColor} border ${specialist.borderColor} backdrop-blur-sm hover:shadow-2xl transition-all duration-300`}
            >
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${specialist.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <specialist.icon className="w-6 h-6 text-white" />
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-white mb-2">{specialist.name}</h3>

              {/* Description */}
              <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                {specialist.description}
              </p>

              {/* Features */}
              <ul className="space-y-2">
                {specialist.features.map((feature, i) => (
                  <li key={i} className="text-xs text-gray-500 flex items-center gap-2">
                    <span className={`w-1 h-1 rounded-full bg-gradient-to-r ${specialist.color}`}></span>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* Glow Effect on Hover */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${specialist.color} opacity-0 group-hover:opacity-10 transition-opacity blur-xl`}></div>
            </motion.div>
          ))}
        </div>

        {/* Consensus System */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative p-8 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10 backdrop-blur-sm"
        >
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white mb-3">4-Way Voting Consensus System</h3>
            <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
              All four LLM specialists analyze market conditions independently, then cast their votes (BUY, SELL, or HOLD).
              A minimum of <span className="text-blue-400 font-semibold">3 out of 4 agreement</span> is required before any signal is executed.
            </p>

            {/* Voting Examples */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="text-green-400 font-bold mb-2">✓ Unanimous (4-0-0)</div>
                <div className="text-sm text-gray-400">Full confidence - 100% position size</div>
              </div>
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <div className="text-blue-400 font-bold mb-2">✓ Strong (3-0-1)</div>
                <div className="text-sm text-gray-400">Clear direction - 100% position</div>
              </div>
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="text-red-400 font-bold mb-2">✗ Conflict (2-2-0)</div>
                <div className="text-sm text-gray-400">Rejected - no consensus</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
