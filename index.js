const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Simplified CORS for native apps
app.use(cors({
  origin: '*', // Allow all origins (safe for mobile/desktop apps)
  methods: ['POST'], // Only needed methods
  allowedHeaders: ['Content-Type']
}));

// MongoDB connection
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

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

    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newAction = new UserAction({ userId, action });
    await newAction.save();
    
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
