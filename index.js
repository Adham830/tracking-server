const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Define a schema and model for tracking user actions
const userActionSchema = new mongoose.Schema({
  userId: String,
  action: String, // "read" or "write"
  timestamp: { type: Date, default: Date.now },
});

const UserAction = mongoose.model('UserAction', userActionSchema);

// API route to log user actions
app.post('/track', async (req, res) => {
  const { userId, action } = req.body;

  if (!userId || !action) {
    return res.status(400).json({ error: 'Missing userId or action' });
  }

  try {
    const newAction = new UserAction({ userId, action });
    await newAction.save();
    res.status(200).json({ message: 'Action logged successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log action' });
  }
});

// Health check route
app.get('/', (req, res) => {
  res.send('Tracking server is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
