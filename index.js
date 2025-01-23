const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// ======================
// Security Middleware
// ======================
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-flutter-app.com'] 
    : '*',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'X-API-Key']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// ======================
// Database Setup
// ======================
mongoose.connect(process.env.MONGO_URI, {
  autoIndex: process.env.NODE_ENV !== 'production'
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  });

// ======================
// Data Models
// ======================
const userActionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    minlength: 4,
    maxlength: 100,
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

// Add indexes for common queries
userActionSchema.index({ userId: 1, action: 1 });
userActionSchema.index({ timestamp: -1 });

const UserAction = mongoose.model('UserAction', userActionSchema);

// ======================
// Middleware
// ======================
app.use(express.json({ limit: '10kb' }));

const validateAPIKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (process.env.NODE_ENV === 'production' && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// ======================
// API Endpoints
// ======================

// Track User Action (POST)
app.post('/v1/actions', validateAPIKey, async (req, res) => {
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
      message: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
});

// Get User Analytics (GET)
app.get('/v1/analytics/:userId', validateAPIKey, async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30d' } = req.query;

    // Date calculations
    const dateFilter = {};
    const periodDays = parseInt(period) || 30;
    
    if (periodDays) {
      dateFilter.$gte = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    }

    // Aggregation pipeline
    const stats = await UserAction.aggregate([
      {
        $match: {
          userId,
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

    // Format response
    const result = {
      read: { count: 0, lastActivity: null },
      write: { count: 0, lastActivity: null }
    };

    stats.forEach(stat => {
      result[stat.action] = {
        count: stat.count,
        lastActivity: stat.lastActivity
      };
    });

    res.status(200).json({
      status: 'success',
      data: result
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Health Check Endpoint
app.get('/v1/status', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.json({
    status: 'operational',
    version: process.env.npm_package_version,
    uptime: process.uptime(),
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// ======================
// Error Handling
// ======================
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// ======================
// Server Initialization
// ======================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
