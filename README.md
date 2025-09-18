# Mariposa Scalping Bot

An AI-powered cryptocurrency scalping bot that uses Binance market data and executes trades on OKX. The system leverages 4 Together AI LLMs for market analysis and includes a real-time dashboard for monitoring performance.

## 🌟 Features

- **AI-Powered Analysis**: Uses 4 Together AI models for market analysis with consolidated recommendations
- **Real-time Market Data**: Binance WebSocket integration for live price feeds
- **Automated Trading**: OKX API integration for trade execution
- **Scalping Agents**: Create multiple agents for different trading pairs with custom configurations
- **Real-time Dashboard**: Next.js dashboard with WebSocket updates
- **Risk Management**: Built-in position sizing and stop-loss mechanisms
- **Performance Tracking**: Comprehensive analytics and trade history
- **Secure**: JWT authentication and encrypted API key storage

## 🏗️ Architecture

### Backend (Node.js/TypeScript)
- **Express API Server**: RESTful API for all operations
- **MongoDB**: Database for users, agents, trades, and analysis data
- **Agenda.js**: Job queue for scheduled market analysis and trade execution
- **WebSocket**: Real-time updates to frontend
- **Services**:
  - Binance Service: Market data retrieval
  - Together AI Service: LLM analysis pipeline
  - OKX Service: Trade execution
  - Agenda Service: Job scheduling and agent management

### Frontend (Next.js/React)
- **Dashboard**: Real-time monitoring interface
- **Agent Management**: Create and configure trading agents
- **Performance Analytics**: Charts and metrics
- **WebSocket Integration**: Live updates

## 📦 Installation

### Prerequisites
- Node.js 18+
- MongoDB
- Together AI API key
- Binance API credentials (for market data)
- OKX API credentials (for trading)

### Backend Setup

1. **Clone and install dependencies**:
```bash
git clone <repository-url>
cd mariposa-scalping
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Required environment variables**:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/mariposa-scalping

# JWT & Encryption
JWT_SECRET=your-super-secret-jwt-key-here
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Binance (for market data)
BINANCE_API_KEY=your-binance-api-key
BINANCE_API_SECRET=your-binance-api-secret

# Together AI
TOGETHER_AI_API_KEY=your-together-ai-api-key

# Server
PORT=3001
NODE_ENV=development
```

4. **Start the backend**:
```bash
npm run dev
```

### Frontend Setup

1. **Navigate to dashboard and install dependencies**:
```bash
cd dashboard
npm install
```

2. **Start the frontend**:
```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`

## 🚀 Usage

### 1. Create Account
- Register a new account on the dashboard
- Add your OKX API credentials in settings

### 2. Create Scalping Agent
- Choose a trading pair (e.g., BTCUSDT)
- Configure risk parameters:
  - Maximum position size
  - Stop loss percentage
  - Take profit percentage
  - Risk percentage per trade

### 3. Start Agent
- Activate your agent to begin automated trading
- Monitor real-time performance on the dashboard

### 4. Monitor Performance
- View live P&L, win rate, and trade history
- Receive real-time market analysis from AI models
- Track individual agent performance

## ⚙️ Configuration

### Agent Configuration
```typescript
{
  maxPositionSize: 100,        // Maximum USD position size
  stopLossPercentage: 2,       // Stop loss at 2%
  takeProfitPercentage: 4,     // Take profit at 4%
  riskPercentage: 1,           // Risk 1% of balance per trade
  timeframes: ["5m", "15m"],   // Analysis timeframes
  indicators: ["RSI", "MACD"]  // Technical indicators
}
```

### AI Analysis Pipeline
The system uses 4 Together AI models for analysis:
- Meta-Llama-3.1-8B-Instruct-Turbo
- Meta-Llama-3.1-70B-Instruct-Turbo
- Mixtral-8x7B-Instruct-v0.1
- Nous-Hermes-2-Mixtral-8x7B-DPO

Each model provides:
- Buy/Sell/Hold recommendation
- Confidence level (0-1)
- Reasoning and analysis
- Target price and stop loss suggestions

A consolidation model combines all analyses into a final recommendation.

## 🔐 Security Features

- JWT authentication for API access
- Encrypted storage of OKX API credentials
- Rate limiting on API endpoints
- Input validation and sanitization
- Secure WebSocket connections

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `PUT /api/auth/okx-keys` - Update OKX credentials

### Agents
- `GET /api/agents` - List user agents
- `POST /api/agents` - Create new agent
- `GET /api/agents/:id` - Get agent details
- `PUT /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent
- `POST /api/agents/:id/start` - Start agent
- `POST /api/agents/:id/stop` - Stop agent
- `GET /api/agents/:id/trades` - Get agent trades

### Market Data
- `GET /api/market/symbols` - Available trading pairs
- `GET /api/market/balance` - Account balance
- `GET /api/market/:symbol` - Market data for symbol
- `GET /api/market/:symbol/analysis` - AI analysis history
- `POST /api/market/analysis` - Trigger new analysis

## 🔧 Development

### Build for Production
```bash
# Backend
npm run build
npm start

# Frontend
cd dashboard
npm run build
npm start
```

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
npm run typecheck
```

## ⚠️ Disclaimer

This software is for educational and research purposes only. Cryptocurrency trading involves significant financial risk. Users are responsible for their own trading decisions and should thoroughly test the system before using real funds. The authors assume no liability for trading losses.

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests for any improvements.

## 📞 Support

For support and questions, please open an issue on GitHub.