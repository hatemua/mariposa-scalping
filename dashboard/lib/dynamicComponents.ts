import dynamic from 'next/dynamic';
import React from 'react';

// Loading component factory
const createLoadingComponent = (color: string, message: string) => () => React.createElement(
  'div',
  { className: 'flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200' },
  React.createElement(
    'div',
    { className: 'flex items-center gap-3' },
    React.createElement('div', { className: `animate-spin rounded-full h-6 w-6 border-b-2 border-${color}-600` }),
    React.createElement('span', { className: 'text-gray-600' }, message)
  )
);

// Lazy load all trading intelligence components with loading states
export const OpportunityScanner = dynamic(
  () => import('../components/trading-intelligence/OpportunityScanner'),
  {
    loading: createLoadingComponent('emerald', 'Loading Opportunity Scanner...'),
    ssr: false
  }
);

export const WhaleActivityMonitor = dynamic(
  () => import('../components/trading-intelligence/WhaleActivityMonitor'),
  {
    loading: createLoadingComponent('orange', 'Loading Whale Monitor...'),
    ssr: false
  }
);

export const ProfessionalSignalFeed = dynamic(
  () => import('../components/trading-intelligence/ProfessionalSignalFeed'),
  {
    loading: createLoadingComponent('blue', 'Loading Signal Feed...'),
    ssr: false
  }
);

export const SmartEntrySignals = dynamic(
  () => import('../components/trading-intelligence/SmartEntrySignals'),
  {
    loading: createLoadingComponent('blue', 'Loading Entry Signals...'),
    ssr: false
  }
);

export const OrderBookAnalyzer = dynamic(
  () => import('../components/trading-intelligence/OrderBookAnalyzer'),
  {
    loading: createLoadingComponent('purple', 'Loading Order Book Analyzer...'),
    ssr: false
  }
);

export const MultiTimeframeConfluence = dynamic(
  () => import('../components/trading-intelligence/MultiTimeframeConfluence'),
  {
    loading: createLoadingComponent('purple', 'Loading Confluence Analysis...'),
    ssr: false
  }
);

export const ConfluenceScorePanel = dynamic(
  () => import('../components/trading-intelligence/ConfluenceScorePanel'),
  {
    loading: createLoadingComponent('purple', 'Loading Confluence Score...'),
    ssr: false
  }
);

export const VaRCalculator = dynamic(
  () => import('../components/trading-intelligence/VaRCalculator'),
  {
    loading: createLoadingComponent('red', 'Loading VaR Calculator...'),
    ssr: false
  }
);

export const RiskMonitorDashboard = dynamic(
  () => import('../components/trading-intelligence/RiskMonitorDashboard'),
  {
    loading: createLoadingComponent('red', 'Loading Risk Monitor...'),
    ssr: false
  }
);

export const PositionSizingCalculator = dynamic(
  () => import('../components/trading-intelligence/PositionSizingCalculator'),
  {
    loading: createLoadingComponent('red', 'Loading Position Calculator...'),
    ssr: false
  }
);

export const ExitStrategyPanel = dynamic(
  () => import('../components/trading-intelligence/ExitStrategyPanel'),
  {
    loading: createLoadingComponent('orange', 'Loading Exit Strategy...'),
    ssr: false
  }
);

export const PortfolioHeatMap = dynamic(
  () => import('../components/trading-intelligence/PortfolioHeatMap'),
  {
    loading: createLoadingComponent('indigo', 'Loading Portfolio Heat Map...'),
    ssr: false
  }
);

export const CorrelationMatrix = dynamic(
  () => import('../components/trading-intelligence/CorrelationMatrix'),
  {
    loading: createLoadingComponent('indigo', 'Loading Correlation Matrix...'),
    ssr: false
  }
);

export const TradingAgentDashboard = dynamic(
  () => import('../components/trading-intelligence/TradingAgentDashboard'),
  {
    loading: createLoadingComponent('cyan', 'Loading Trading Agents...'),
    ssr: false
  }
);