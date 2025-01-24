const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// ======================
// Security Configuration
// ======================
app.set('trust proxy', 1); // Trust Vercel's proxy
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});
app.use(limiter);

// ======================
// Database Setup
// ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  });

// ======================
// Data Model
// ======================
const userActionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['read', 'write'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

const UserAction = mongoose.model('UserAction', userActionSchema);

// ======================
// API Routes
// ======================
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'operational',
    version: '1.0.1',
    endpoints: {
      trackAction: 'POST /v1/actions',
      getAnalytics: 'GET /v1/analytics/:userId',
      healthCheck: 'GET /v1/status'
    }
  });
});

// Track user action
app.post('/v1/actions', async (req, res) => {
  try {
    const { userId, action } = req.body;

    // Validation
    if (!userId || !action) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: { userId: 'string', action: "'read'|'write'" }
      });
    }

    if (!['read', 'write'].includes(action)) {
      return res.status(400).json({
        error: 'Invalid action type',
        validActions: ['read', 'write']
      });
    }

    // Save to database
    const newAction = new UserAction({ userId, action });
    await newAction.save();

    res.status(201).json({
      status: 'success',
      data: {
        actionId: newAction._id,
        timestamp: newAction.timestamp
      }
    });

  } catch (error) {
    console.error('Tracking error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Get user analytics
app.get('/v1/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30' } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'User ID required'
      });
    }

    const periodDays = parseInt(period) || 30;
    const dateFilter = {
      $gte: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)
    };

    const stats = await UserAction.aggregate([
      {
        $match: {
          userId: userId,
          timestamp: dateFilter
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          lastActivity: { $max: '$timestamp' }
        }
      },
      {
        $project: {
          _id: 0,
          action: '$_id',
          count: 1,
          lastActivity: 1
        }
      }
    ]);

    const result = stats.reduce((acc, curr) => ({
      ...acc,
      [curr.action]: {
        count: curr.count,
        lastActivity: curr.lastActivity
      }
    }), {
      read: { count: 0, lastActivity: null },
      write: { count: 0, lastActivity: null }
    });

    res.json({
      status: 'success',
      data: result
    });

  } catch (error) {
    console.error('Analytics error:', error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch analytics'
    });
  }
});

// Health check
app.get('/v1/status', (req, res) => {
  res.json({
    status: 'operational',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ======================
// Error Handling
// ======================
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

// ======================
// Server Initialization
// ======================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(🚀 Server running on port ${PORT});
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('🔌 All connections closed');
      process.exit(0);
    });
  });
});
