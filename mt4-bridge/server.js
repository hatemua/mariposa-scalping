const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const zmq = require('zeromq');
const winston = require('winston');
require('dotenv').config();

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Express app setup
const app = express();
const PORT = process.env.BRIDGE_PORT || 8080;

app.use(cors());
app.use(bodyParser.json());

// Basic authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Missing authentication' });
  }

  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [username, password] = credentials.split(':');

  const validUsername = process.env.BRIDGE_AUTH_USERNAME || 'admin';
  const validPassword = process.env.BRIDGE_AUTH_PASSWORD || 'changeme';

  if (username !== validUsername || password !== validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  next();
};

// ZeroMQ socket setup with request queue
const zmqHost = process.env.ZMQ_HOST || 'localhost';
const zmqPort = process.env.ZMQ_PORT || 5555;
let sock;
let requestId = 0;
let isProcessing = false;
const requestQueue = [];

async function initZMQ() {
  try {
    sock = new zmq.Request();
    sock.connect(`tcp://${zmqHost}:${zmqPort}`);
    logger.info(`ZMQ connected to tcp://${zmqHost}:${zmqPort}`);
  } catch (error) {
    logger.error('Failed to connect to ZMQ:', error);
    throw error;
  }
}

// Process queued requests sequentially
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (requestQueue.length > 0) {
    const { request, resolve, reject } = requestQueue.shift();

    try {
      logger.debug('Processing queued MT4 request:', request);

      await sock.send(JSON.stringify(request));

      const timeoutMs = 10000;
      const response = await Promise.race([
        sock.receive(),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('Request timeout')), timeoutMs)
        )
      ]);

      const result = JSON.parse(response.toString());
      logger.debug('MT4 response:', result);

      if (result.error) {
        reject(new Error(result.error));
      } else {
        resolve(result.data);
      }
    } catch (error) {
      logger.error('MT4 request failed:', error);
      reject(error);
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 10));
  }

  isProcessing = false;
}

// Send request to MT4 via ZMQ (with queuing)
async function sendMT4Request(command, params = {}) {
  const id = ++requestId;
  const request = {
    id,
    command,
    params,
    timestamp: Date.now()
  };

  return new Promise((resolve, reject) => {
    requestQueue.push({ request, resolve, reject });
    processQueue();
  });
}

// API Routes

// Health check
app.get('/api/v1/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    zmq_connected: sock !== null
  });
});

// Get account information
app.get('/api/v1/account/info', authenticate, async (req, res) => {
  try {
    const data = await sendMT4Request('GET_ACCOUNT_INFO');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available symbols
app.get('/api/v1/symbols', authenticate, async (req, res) => {
  try {
    const data = await sendMT4Request('GET_SYMBOLS');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price for symbol
app.get('/api/v1/price/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await sendMT4Request('GET_PRICE', { symbol });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get open positions
app.get('/api/v1/orders/open', authenticate, async (req, res) => {
  try {
    const data = await sendMT4Request('GET_OPEN_ORDERS');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order by ticket
app.get('/api/v1/orders/:ticket', authenticate, async (req, res) => {
  try {
    const { ticket } = req.params;
    const data = await sendMT4Request('GET_ORDER', { ticket: parseInt(ticket) });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create market order
app.post('/api/v1/orders', authenticate, async (req, res) => {
  try {
    const { symbol, side, volume, stopLoss, takeProfit, comment } = req.body;

    if (!symbol || !side || !volume) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const data = await sendMT4Request('CREATE_ORDER', {
      symbol,
      side: side.toUpperCase(),
      volume: parseFloat(volume),
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null,
      comment: comment || ''
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close position
app.post('/api/v1/orders/close', authenticate, async (req, res) => {
  try {
    const { ticket } = req.body;

    if (!ticket) {
      return res.status(400).json({ error: 'Missing ticket number' });
    }

    const data = await sendMT4Request('CLOSE_ORDER', {
      ticket: parseInt(ticket)
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close all positions
app.post('/api/v1/orders/close-all', authenticate, async (req, res) => {
  try {
    const { symbol } = req.body;

    const data = await sendMT4Request('CLOSE_ALL_ORDERS', {
      symbol: symbol || null
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modify order
app.put('/api/v1/orders/:ticket', authenticate, async (req, res) => {
  try {
    const { ticket } = req.params;
    const { stopLoss, takeProfit } = req.body;

    const data = await sendMT4Request('MODIFY_ORDER', {
      ticket: parseInt(ticket),
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    await initZMQ();

    app.listen(PORT, () => {
      logger.info(`MT4 Bridge Server running on port ${PORT}`);
      logger.info(`ZMQ endpoint: tcp://${zmqHost}:${zmqPort}`);
      logger.info('Bridge is ready to accept requests');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing connections...');
  if (sock) {
    sock.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing connections...');
  if (sock) {
    sock.close();
  }
  process.exit(0);
});

start();
