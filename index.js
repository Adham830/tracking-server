const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS Configuration
app.use(cors({
  origin: '*',
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

// Middleware
app.use(express.json());

// MongoDB Connection (modern configuration)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  });

// User Action Schema
const userActionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ['read', 'write'],
    required: true
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

const UserAction = mongoose.model('UserAction', userActionSchema);

// Tracking endpoint
app.post('/track', async (req, res) => {
  try {
    const { userId, action } = req.body;

    // Validation
    if (!userId || !action) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['userId', 'action']
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
      success: true,
      actionId: newAction._id
    });

  } catch (error) {
    console.error('Tracking error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced health check
app.get('/', (req, res) => {
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  }[mongoose.connection.readyState];

  res.json({
    status: 'active',
    version: '1.0.0',
    database: dbStatus
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
