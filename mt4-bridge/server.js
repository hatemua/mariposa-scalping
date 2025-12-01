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

// Error handling for JSON parsing errors
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    logger.error('JSON parse error in request body:', error.message, 'Body:', req.body);
    return res.status(400).json({
      error: 'Invalid JSON in request body',
      details: error.message
    });
  }
  next();
});

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
const ZMQ_TIMEOUT_MS = parseInt(process.env.ZMQ_TIMEOUT_MS) || 10000;  // 10s default (was 5s)
const ZMQ_MAX_RETRIES = parseInt(process.env.ZMQ_MAX_RETRIES) || 2;    // 2 retries = 3 total attempts
const ZMQ_RECONNECT_THRESHOLD = 5;  // Reconnect after 5 consecutive failures

let sock;
let requestId = 0;
let isProcessing = false;
const requestQueue = [];

// Health tracking
let lastSuccessfulRequest = Date.now();
let consecutiveFailures = 0;

async function initZMQ() {
  try {
    sock = new zmq.Request();
    sock.connect(`tcp://${zmqHost}:${zmqPort}`);
    logger.info(`ZMQ connected to tcp://${zmqHost}:${zmqPort}`);
    logger.info(`ZMQ timeout: ${ZMQ_TIMEOUT_MS}ms, max retries: ${ZMQ_MAX_RETRIES}`);
  } catch (error) {
    logger.error('Failed to connect to ZMQ:', error);
    throw error;
  }
}

// Reconnect ZMQ socket after persistent failures
async function reconnectZMQ() {
  logger.warn('Attempting ZMQ socket reconnection due to persistent failures...');
  try {
    if (sock) {
      sock.close();
    }
    sock = new zmq.Request();
    sock.connect(`tcp://${zmqHost}:${zmqPort}`);
    consecutiveFailures = 0;
    logger.info('ZMQ socket reconnected successfully');
  } catch (error) {
    logger.error('Failed to reconnect ZMQ socket:', error);
  }
}

// Process queued requests sequentially with retry logic
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (requestQueue.length > 0) {
    const { request, resolve, reject } = requestQueue.shift();
    let lastError = null;
    let success = false;

    // Retry loop
    for (let attempt = 0; attempt <= ZMQ_MAX_RETRIES && !success; attempt++) {
      try {
        if (attempt > 0) {
          logger.warn(`Retry attempt ${attempt}/${ZMQ_MAX_RETRIES} for request ${request.id} (${request.command})`);
          // Small delay before retry
          await new Promise(r => setTimeout(r, 500 * attempt));
        }

        logger.debug('Processing MT4 request:', { id: request.id, command: request.command, attempt });

        await sock.send(JSON.stringify(request));

        const response = await Promise.race([
          sock.receive(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('Request timeout')), ZMQ_TIMEOUT_MS)
          )
        ]);

        const rawResponse = response.toString();
        logger.info('Raw MT4 response:', rawResponse);

        let result;
        try {
          result = JSON.parse(rawResponse);
        } catch (parseError) {
          logger.error('JSON parse error. Raw response:', rawResponse);
          logger.error('Parse error details:', parseError.message);
          lastError = new Error('Invalid JSON from MT4: ' + parseError.message);
          continue; // Retry on parse error
        }

        logger.debug('Parsed MT4 response:', result);

        // Success! Update health tracking
        lastSuccessfulRequest = Date.now();
        consecutiveFailures = 0;
        success = true;

        if (result.error) {
          // Return errors as structured response (don't reject to avoid HTTP 500)
          resolve({ success: false, data: null, error: result.error, errorType: 'MT4_ERROR' });
        } else {
          // Wrap successful response with standardized format
          resolve({ success: true, data: result.data, error: null });
        }

      } catch (error) {
        lastError = error;
        logger.warn(`MT4 request attempt ${attempt + 1}/${ZMQ_MAX_RETRIES + 1} failed:`, error.message);

        // Track consecutive failures
        consecutiveFailures++;

        // Check if we need to reconnect
        if (consecutiveFailures >= ZMQ_RECONNECT_THRESHOLD) {
          logger.error(`${consecutiveFailures} consecutive failures - triggering ZMQ reconnection`);
          await reconnectZMQ();
        }
      }
    }

    // If all retries failed, resolve with error (don't reject to avoid unhandled promise)
    if (!success) {
      logger.error(`MT4 request ${request.id} (${request.command}) failed after ${ZMQ_MAX_RETRIES + 1} attempts:`, lastError?.message);

      const errorType = lastError?.message?.includes('timeout') ? 'TIMEOUT' : 'ZMQ_ERROR';
      resolve({
        success: false,
        data: null,
        error: lastError?.message || 'Unknown error after retries',
        errorType: errorType,
        retries: ZMQ_MAX_RETRIES + 1
      });
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

// Health check (no auth - for quick status check)
app.get('/api/v1/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    zmq_connected: sock !== null
  });
});

// Detailed health endpoint (with auth - for monitoring)
app.get('/api/v1/health', authenticate, (req, res) => {
  const timeSinceLastSuccess = Date.now() - lastSuccessfulRequest;
  const healthy = timeSinceLastSuccess < 30000; // Healthy if success within 30s

  res.json({
    status: healthy ? 'healthy' : 'degraded',
    zmq_connected: sock !== null,
    last_success_ms: timeSinceLastSuccess,
    last_success_ago: `${Math.round(timeSinceLastSuccess / 1000)}s ago`,
    consecutive_failures: consecutiveFailures,
    queue_depth: requestQueue.length,
    config: {
      timeout_ms: ZMQ_TIMEOUT_MS,
      max_retries: ZMQ_MAX_RETRIES,
      reconnect_threshold: ZMQ_RECONNECT_THRESHOLD
    }
  });
});

// Get account information
app.get('/api/v1/account/info', authenticate, async (req, res) => {
  try {
    const data = await sendMT4Request('GET_ACCOUNT_INFO');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

// Get available symbols
app.get('/api/v1/symbols', authenticate, async (req, res) => {
  try {
    const data = await sendMT4Request('GET_SYMBOLS');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

// Get price for symbol
app.get('/api/v1/price/:symbol', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await sendMT4Request('GET_PRICE', { symbol });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

// Get open positions
app.get('/api/v1/orders/open', authenticate, async (req, res) => {
  try {
    const data = await sendMT4Request('GET_OPEN_ORDERS');
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

// Get order by ticket
app.get('/api/v1/orders/:ticket', authenticate, async (req, res) => {
  try {
    const { ticket } = req.params;
    const data = await sendMT4Request('GET_ORDER', { ticket: parseInt(ticket) });
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

// Diagnostic endpoint - check trading permissions
app.get('/api/v1/diagnose/:symbol?', authenticate, async (req, res) => {
  try {
    const { symbol } = req.params;
    logger.info('Running trading diagnostics' + (symbol ? ' for symbol: ' + symbol : ''));
    const data = await sendMT4Request('DIAGNOSE', { symbol: symbol || '' });
    res.json(data);
  } catch (error) {
    logger.error('Diagnostic request failed:', error);
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

// Create market order
app.post('/api/v1/orders', authenticate, async (req, res) => {
  try {
    const { symbol, side, volume, stopLoss, takeProfit, comment } = req.body;

    if (!symbol || !side || !volume) {
      return res.status(400).json({ success: false, error: 'Missing required fields', data: null });
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
    res.status(500).json({ success: false, error: error.message, data: null });
  }
});

// Close position
app.post('/api/v1/orders/close', authenticate, async (req, res) => {
  try {
    logger.info('Close order request received:', JSON.stringify(req.body));
    const { ticket } = req.body;

    if (!ticket) {
      logger.error('Missing ticket number in request body');
      return res.status(400).json({ success: false, error: 'Missing ticket number', data: null });
    }

    const ticketNum = parseInt(ticket);
    if (isNaN(ticketNum) || ticketNum <= 0) {
      logger.error('Invalid ticket number:', ticket);
      return res.status(400).json({ success: false, error: 'Invalid ticket number. Must be a positive integer', data: null });
    }

    logger.info('Sending CLOSE_ORDER request to MT4 for ticket:', ticketNum);
    const data = await sendMT4Request('CLOSE_ORDER', {
      ticket: ticketNum
    });

    logger.info('Close order response from MT4:', JSON.stringify(data));
    res.json(data);
  } catch (error) {
    logger.error('Close order error:', error.message, error.stack);
    res.status(500).json({ success: false, error: error.message, data: null });
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
    res.status(500).json({ success: false, error: error.message, data: null });
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
    res.status(500).json({ success: false, error: error.message, data: null });
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
