// ======================
// Data Model
// ======================
const getUserActionCollection = (userId) => {
  // Dynamically access collection based on userId
  return mongoose.connection.collection(`user_actions_${userId}`);
};

// ======================
// API Routes
// ======================
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

    // Get the user-specific collection dynamically
    const userActionCollection = getUserActionCollection(userId);

    // Save to user-specific collection
    const newAction = {
      userId,
      action,
      timestamp: new Date()
    };
    await userActionCollection.insertOne(newAction);

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

// Get user analytics from the user-specific collection
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

    // Get the user-specific collection dynamically
    const userActionCollection = getUserActionCollection(userId);

    const stats = await userActionCollection.aggregate([
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
