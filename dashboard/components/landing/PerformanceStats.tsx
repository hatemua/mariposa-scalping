'use client';

import { motion, useInView } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { Zap, Database, Clock, Target } from 'lucide-react';

interface Stat {
  icon: any;
  value: string;
  label: string;
  suffix?: string;
  gradient: string;
}

const stats: Stat[] = [
  {
    icon: Zap,
    value: '100',
    label: 'Faster Data Access',
    suffix: 'x',
    gradient: 'from-yellow-500 to-orange-500'
  },
  {
    icon: Database,
    value: '95',
    label: 'Cache Hit Ratio',
    suffix: '%',
    gradient: 'from-blue-500 to-cyan-500'
  },
  {
    icon: Clock,
    value: '100',
    label: 'Real-time Updates',
    suffix: 'ms',
    gradient: 'from-green-500 to-emerald-500'
  },
  {
    icon: Target,
    value: '7',
    label: 'Timeframes Analyzed',
    suffix: '',
    gradient: 'from-purple-500 to-pink-500'
  }
];

function AnimatedCounter({ target, duration = 2, suffix = '' }: { target: number; duration?: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    let start = 0;
    const end = target;
    const increment = end / (duration * 60);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if (current >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, 1000 / 60);

    return () => clearInterval(timer);
  }, [isInView, target, duration]);

  return (
    <span ref={ref} className="inline-block">
      {count}{suffix}
    </span>
  );
}

export function PerformanceStats() {
  return (
    <section id="performance" className="py-24 bg-slate-900 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-400 text-sm mb-4 backdrop-blur-sm">
            <Zap className="w-4 h-4" />
            <span>Performance Metrics</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Lightning-Fast Performance
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Powered by Redis caching and optimized architecture for real-time trading
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group relative p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:shadow-2xl transition-all duration-300"
            >
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>

              {/* Value */}
              <div className={`text-5xl font-bold mb-3 bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
                <AnimatedCounter
                  target={parseInt(stat.value)}
                  suffix={stat.suffix}
                />
              </div>

              {/* Label */}
              <div className="text-gray-400 text-sm font-medium">
                {stat.label}
              </div>

              {/* Glow Effect */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${stat.gradient} opacity-0 group-hover:opacity-10 transition-opacity blur-xl`}></div>
            </motion.div>
          ))}
        </div>

        {/* Technical Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          {/* Redis Caching */}
          <div className="p-8 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 backdrop-blur-sm">
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <Database className="w-6 h-6 text-blue-400" />
              Redis-Powered Caching
            </h3>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>10-100x faster than traditional database queries</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>85-95% cache hit ratio for frequently accessed data</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Sub-100ms response times for market data</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Real-time pub/sub for instant updates</span>
              </li>
            </ul>
          </div>

          {/* Multi-Timeframe Analysis */}
          <div className="p-8 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 backdrop-blur-sm">
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
              <Target className="w-6 h-6 text-purple-400" />
              Multi-Timeframe Analysis
            </h3>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Analyze 7 timeframes: 1m, 5m, 15m, 30m, 4H, Daily, Weekly</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>HTF trend alignment for higher probability trades</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Confluence scoring across all timeframes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 mt-1">•</span>
                <span>Dynamic position sizing based on alignment</span>
              </li>
            </ul>
          </div>
        </motion.div>

        {/* Smart Money Concepts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-8 p-8 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 backdrop-blur-sm"
        >
          <h3 className="text-2xl font-bold text-white mb-6 text-center">Professional Smart Money Concepts</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-green-400 font-semibold mb-1">Order Blocks</div>
              <div className="text-xs text-gray-400">Institutional zones</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-green-400 font-semibold mb-1">Liquidity Sweeps</div>
              <div className="text-xs text-gray-400">Stop hunt detection</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-green-400 font-semibold mb-1">OTE Zones</div>
              <div className="text-xs text-gray-400">Optimal entries</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="text-green-400 font-semibold mb-1">Fair Value Gaps</div>
              <div className="text-xs text-gray-400">Imbalance zones</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
