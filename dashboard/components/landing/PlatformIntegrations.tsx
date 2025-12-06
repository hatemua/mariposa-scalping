'use client';

import { motion } from 'framer-motion';
import { Check, ExternalLink } from 'lucide-react';

const platforms = [
  {
    name: 'OKX Exchange',
    logo: '🔷',
    description: 'Leading cryptocurrency exchange with high liquidity and low latency execution',
    features: [
      'Spot & Futures Trading',
      'High-Frequency Execution',
      'Advanced Order Types',
      'Real-time Market Data',
      'Low Fees & Deep Liquidity',
      'Secure API Integration'
    ],
    gradient: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/20'
  },
  {
    name: 'MetaTrader 4/5',
    logo: '📊',
    description: 'Industry-standard trading platform with multi-broker support and professional charting',
    features: [
      'Multi-Broker Support',
      'Expert Advisor (EA) Integration',
      'Professional Charting Tools',
      'Forex & CFD Trading',
      'Custom Indicators',
      'Automated Trading'
    ],
    gradient: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/5',
    borderColor: 'border-green-500/20'
  }
];

export function PlatformIntegrations() {
  return (
    <section id="platforms" className="py-24 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-sm mb-4 backdrop-blur-sm">
            <ExternalLink className="w-4 h-4" />
            <span>Trading Platforms</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Seamless Platform Integration
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Trade on your preferred platform with professional-grade execution and reliability
          </p>
        </motion.div>

        {/* Platforms Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {platforms.map((platform, index) => (
            <motion.div
              key={platform.name}
              initial={{ opacity: 0, x: index === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              whileHover={{ y: -8 }}
              className="group relative"
            >
              {/* Card */}
              <div className={`relative p-8 rounded-2xl ${platform.bgColor} border ${platform.borderColor} backdrop-blur-xl hover:shadow-2xl transition-all duration-300`}>
                {/* Logo */}
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${platform.gradient} flex items-center justify-center mb-6 text-4xl group-hover:scale-110 transition-transform shadow-lg`}>
                  {platform.logo}
                </div>

                {/* Platform Name */}
                <h3 className="text-3xl font-bold text-white mb-3">{platform.name}</h3>

                {/* Description */}
                <p className="text-gray-400 mb-6 leading-relaxed">
                  {platform.description}
                </p>

                {/* Features List */}
                <ul className="space-y-3">
                  {platform.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-gray-300">
                      <div className={`mt-1 w-5 h-5 rounded-full bg-gradient-to-r ${platform.gradient} flex items-center justify-center flex-shrink-0`}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Hover Glow */}
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${platform.gradient} opacity-0 group-hover:opacity-5 transition-opacity blur-xl`}></div>
              </div>

              {/* Border Glow */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${platform.gradient} opacity-0 group-hover:opacity-20 blur-md transition-opacity -z-10`}></div>
            </motion.div>
          ))}
        </div>

        {/* Architecture Flow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative p-8 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10 backdrop-blur-sm"
        >
          <h3 className="text-2xl font-bold text-white mb-6 text-center">Trading Architecture</h3>

          {/* Flow Diagram */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm sm:text-base">
            <div className="px-4 py-3 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 font-semibold backdrop-blur-sm">
              Binance Data
            </div>
            <div className="text-gray-500">→</div>
            <div className="px-4 py-3 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-300 font-semibold backdrop-blur-sm">
              4 LLM Specialists
            </div>
            <div className="text-gray-500">→</div>
            <div className="px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 font-semibold backdrop-blur-sm">
              Consensus
            </div>
            <div className="text-gray-500">→</div>
            <div className="px-4 py-3 bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-300 font-semibold backdrop-blur-sm">
              Risk Filter
            </div>
            <div className="text-gray-500">→</div>
            <div className="px-4 py-3 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 font-semibold backdrop-blur-sm">
              OKX / MT4
            </div>
          </div>

          <div className="mt-6 text-center text-gray-400 text-sm">
            <div className="mb-2">↓</div>
            <div className="inline-block px-4 py-2 bg-white/5 border border-white/10 rounded-lg backdrop-blur-sm">
              Redis Cache (10-100x faster) → Real-time Dashboard
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
