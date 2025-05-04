const express = require('express');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// Get messages between two users
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user.id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user.id }
      ]
    }).sort({ createdAt: 1 }).populate('sender', 'name email');
    
    res.json(messages);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// Get all conversations for current user
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: { $in: [req.user.id] }
    })
    .populate('participants', 'name email')
    .populate('lastMessage')
    .sort({ updatedAt: -1 });
    
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});
module.exports = router;