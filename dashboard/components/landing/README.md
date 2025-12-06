# Mariposa AI Scalping Bot - Landing Page

## Overview

A modern, animated landing page showcasing the Mariposa AI-powered cryptocurrency scalping bot. The landing page highlights the platform's key features including 4 LLM specialists, multi-timeframe analysis, and professional trading integrations.

## Components

### 1. HeroSection.tsx
The hero section features:
- Animated gradient background with pulsing orbs
- Main headline with gradient text effect
- Live stats ticker showing platform features
- Primary CTA button to enter the dashboard
- Scroll indicator animation
- Responsive design with mobile-first approach

### 2. LLMSpecialists.tsx
Showcases the 4 specialized LLM experts:
- **Fibonacci Expert**: Golden pocket and retracement detection
- **Trend & Momentum**: Market direction and strength analysis
- **Volume & Price Action**: Liquidity and breakout detection
- **Support & Resistance**: Key levels and order blocks

Features:
- Interactive cards with hover effects
- Gradient backgrounds unique to each specialist
- 4-way voting consensus system explanation
- Visual examples of different consensus patterns (4-0-0, 3-0-1, 2-2-0)

### 3. FeaturesGrid.tsx
Glassmorphism-styled feature cards highlighting:
- Multi-Timeframe Confluence (7 timeframes)
- Smart Money Concepts (SMC)
- Redis Real-Time Data (10-100x faster)
- Dual Platform Trading (OKX & MT4)
- Advanced Risk Management
- LLM-Powered Exits

Features:
- 3-column grid layout (responsive)
- Hover animations (lift & scale)
- Gradient icons for each feature
- Bottom stats row showing key metrics

### 4. PlatformIntegrations.tsx
Displays trading platform integrations:
- **OKX Exchange**: Spot & futures, high-frequency execution
- **MetaTrader 4/5**: Multi-broker support, EA integration

Features:
- Side-by-side platform comparison
- Feature lists with checkmarks
- Architecture flow diagram showing data flow
- Redis caching visualization

### 5. PerformanceStats.tsx
Animated performance metrics:
- 100x faster data access (Redis)
- 95% cache hit ratio
- <100ms real-time updates
- 7 timeframes analyzed

Features:
- Animated number counters using Framer Motion
- Gradient stat cards
- Technical details sections (Redis caching, multi-timeframe analysis)
- Smart Money Concepts highlight grid

### 6. CTASection.tsx
Final call-to-action section:
- Large, prominent headline
- "Enter Dashboard" button
- Security badges (JWT, Encryption, Rate Limiting)
- Fine print with no credit card required message

## Technology Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe code
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Smooth animations and transitions
- **Lucide React**: Icon library

## Design Features

### Color Palette
- **Background**: Dark blue/black gradients (#0a0e27, #1a1f3a, slate-950)
- **Accents**:
  - Blue (#3b82f6)
  - Purple (#8b5cf6)
  - Cyan (#06b6d4)
  - Green (#10b981)
  - Orange (#f97316)

### Animations
- Fade-in on scroll (viewport detection)
- Slide-up for cards
- Pulsing background orbs
- Hover scale effects
- Number counter animations
- Smooth scroll behavior

### Glassmorphism Effects
- Backdrop blur on cards
- Transparent backgrounds with borders
- Gradient overlays on hover
- Glow effects around elements

## Key Features Highlighted

### 4 LLM Specialists
1. **FIB** - Fibonacci Pattern Detection
2. **TREND** - Trend & Momentum Analysis
3. **VOL** - Volume & Price Action
4. **S/R** - Support & Resistance Levels

### Consensus System
- Requires 3/4 LLM agreement for signal execution
- Different voting patterns trigger different position sizes:
  - Unanimous (4-0-0): 100% position
  - Strong (3-0-1): 100% position
  - Moderate (3-1-0): 75% position
  - Rejected (2-2-0, 2-1-1): No trade

### Smart Money Concepts (SMC)
- Order Block Detection
- Liquidity Sweep Identification
- OTE (Optimal Trade Entry) Zones
- Fair Value Gaps (FVG)
- HTF Trend Alignment

### Performance Metrics
- 10-100x faster with Redis caching
- 85-95% cache hit ratio
- Sub-100ms real-time updates
- Multi-timeframe confluence (1m to Weekly)

### Platform Integrations
- **OKX**: Crypto exchange for spot & futures
- **MT4/MT5**: Professional forex/CFD trading

## Responsive Design

All components are fully responsive with breakpoints:
- Mobile: `sm:` (640px)
- Tablet: `md:` (768px)
- Desktop: `lg:` (1024px)

## Animation Triggers

- `initial`: Component's initial state
- `whileInView`: Triggers when component enters viewport
- `viewport={{ once: true }}`: Animate only once
- `whileHover`: Hover state animations
- `transition`: Animation duration and delays

## Usage

The landing page is now the default home page at `/`. Users can:
1. View all features and capabilities
2. Click "Enter Dashboard" to access the trading interface
3. Scroll through sections using smooth scroll
4. Interact with animated elements

## Development

To run the dashboard with the landing page:

```bash
cd dashboard
npm install
npm run dev
```

The landing page will be available at `http://localhost:3000`

## Future Enhancements

Potential improvements:
- Add testimonials section
- Include live trading statistics (if available)
- Video demo/walkthrough
- FAQ section
- Pricing tiers (if applicable)
- Newsletter signup
- Social proof (user count, trades executed, etc.)
