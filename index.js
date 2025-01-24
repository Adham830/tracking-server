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
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
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
// Dynamic Model Creation
// ======================
function createUserModel(userId) {
  const collectionName = `user_${userId}_actions`;
  const actionSchema = new mongoose.Schema({
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
  }, { versionKey: false });

  return mongoose.models[collectionName] || 
         mongoose.model(collectionName, actionSchema, collectionName);
}

// ======================
// API Routes
// ======================
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'operational',
    version: '1.1.0',
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

    if (!userId || !action) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: { userId: 'string', action: "'read'|'write'" }
      });
    }

    const UserAction = createUserModel(userId);
    const newAction = new UserAction({ action });
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

// Get user analytics (simplified version)
app.get('/v1/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30' } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'User ID required'
      });
    }

    const UserAction = createUserModel(userId);
    const days = parseInt(period) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Aggregation pipeline
    const results = await UserAction.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          action: "$_id",
          count: 1
        }
      }
    ]);

    // Format the response
    const response = {
      read: 0,
      write: 0
    };

    results.forEach(item => {
      response[item.action] = item.count;
    });

    res.json({
      status: 'success',
      userId,
      periodDays: days,
      actions: response
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
app.use((req, res) => res.status(404).json({ status: 'error', message: 'Endpoint not found' }));
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

// ======================
// Server Initialization
// ======================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
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
