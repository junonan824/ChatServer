const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getChannel, createRoomQueue } = require('../services/rabbitmq');
const Room = require('../models/room');
const Message = require('../models/message');
const config = require('../config');

const router = express.Router();

// 인증 미들웨어 적용
router.use(verifyToken);

// 모든 채팅방 조회
router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 });
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// 특정 채팅방 조회
router.get('/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json(room);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: 'Failed to fetch room details' });
  }
});

// 채팅방 생성
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }
    
    // 고유한 룸 ID 생성
    const roomId = `room-${Date.now()}`;
    
    const rabbitChannel = getChannel();
    if (!rabbitChannel) {
      return res.status(503).json({ error: 'Message broker unavailable' });
    }
    
    // RabbitMQ에 해당 방을 위한 큐 생성
    await createRoomQueue(roomId);
    
    // MongoDB에 채팅방 저장
    const newRoom = new Room({
      roomId,
      name,
      description,
      createdBy: req.user.username,
    });
    
    console.log('Creating room with data:', {
      roomId,
      name,
      description,
      createdBy: req.user.username,
    });
    
    await newRoom.save();
    console.log('Room created successfully:', roomId);
    
    res.status(201).json({
      id: roomId,
      name,
      description
    });
  } catch (error) {
    console.error('Room creation error details:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// 채팅방 메시지 조회
router.get('/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { before } = req.query;
    
    // 쿼리 구성
    const query = { roomId };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }
    
    // 메시지 조회
    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(config.MESSAGE_HISTORY_LIMIT);
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router; 