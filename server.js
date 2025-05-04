const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const authRoutes = require('./routes/authRoutes');
const Message = require('./models/Message');
const User = require('./models/User');
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');
const Conversation = require('./models/Conversation');

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);


// SOCKET.IO EVENTS
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join user room for direct messages
  socket.on('join_user', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their personal room`);
  });

  // Join chat room
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User joined room: ${room}`);
  });

  // Handle room messages
  socket.on('message', async ({ content, senderId, room }) => {
    try {
      const message = await Message.create({ 
        content, 
        sender: senderId, 
        room 
      });
      
      io.to(room).emit('message', { 
        content, 
        senderId, 
        room, 
        _id: message._id, 
        createdAt: message.createdAt 
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  // Handle direct messages
  socket.on('direct_message', async ({ content, senderId, receiverId }) => {
    try {
      // Create and save the message
      const message = await Message.create({
        content,
        sender: senderId,
        receiver: receiverId
      });
      
      // Populate sender information
      const populatedMessage = await Message.findById(message._id)
        .populate('sender', 'name email');
      
      // Find or create conversation
      let conversation = await Conversation.findOne({
        participants: { $all: [senderId, receiverId] }
      });
      
      if (!conversation) {
        conversation = await Conversation.create({
          participants: [senderId, receiverId],
          lastMessage: message._id
        });
      } else {
        // Update last message
        conversation.lastMessage = message._id;
        await conversation.save();
      }
      
      // Populate conversation info
      const updatedConversation = await Conversation.findById(conversation._id)
        .populate('participants', 'name email')
        .populate('lastMessage');
      
      // Emit to sender and receiver
      io.to(senderId).emit('direct_message', populatedMessage);
      io.to(receiverId).emit('direct_message', populatedMessage);
      
      // Update conversations for both users
      io.to(senderId).emit('conversation_update', updatedConversation);
      io.to(receiverId).emit('conversation_update', updatedConversation);
    } catch (error) {
      console.error('Error processing direct message:', error);
    }
  });

  socket.on('typing', ({ userId, receiverId }) => {
    socket.to(receiverId).emit('typing', { userId });
  });

  socket.on('stop_typing', ({ receiverId }) => {
    socket.to(receiverId).emit('stop_typing');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
