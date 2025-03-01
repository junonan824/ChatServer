const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const stompit = require('stompit');

// Create Express app
const app = express();
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// RabbitMQ Connection
let rabbitConnection = null;
let rabbitChannel = null;

// STOMP configurations
const stompConnections = new Map();
const stompServers = [];

// Connect to RabbitMQ
async function connectToRabbitMQ() {
  try {
    rabbitConnection = await amqp.connect('amqp://localhost');
    rabbitChannel = await rabbitConnection.createChannel();
    
    console.log('Connected to RabbitMQ');
    
    // Declare exchange for chat messages
    await rabbitChannel.assertExchange('chat_exchange', 'topic', { durable: false });
    
    // Set up STOMP broker connection to RabbitMQ
    const stompConnectOptions = {
      host: 'localhost',
      port: 61613, // Default STOMP port for RabbitMQ
      connectHeaders: {
        login: 'guest',
        passcode: 'guest'
      }
    };
    
    stompit.connect(stompConnectOptions, (error, client) => {
      if (error) {
        console.error('STOMP connection error:', error);
        return;
      }
      console.log('STOMP connection to RabbitMQ established');
      stompServers.push(client);
    });
    
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    setTimeout(connectToRabbitMQ, 5000); // Retry connection
  }
}

// Connect to RabbitMQ on startup
connectToRabbitMQ();

// Basic route
app.get('/', (req, res) => {
  res.send('Real-time Chat Server with RabbitMQ is running');
});

// User authentication route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  // In a real application, you'd verify credentials against a database
  // This is a simplified example
  if (username && password) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Chat room endpoint to get room information
app.get('/api/rooms/:roomId', verifyToken, (req, res) => {
  const roomId = req.params.roomId;
  
  // In a real app, we'd fetch room details from a database
  res.json({
    id: roomId,
    name: `Chat Room ${roomId}`,
    description: 'A sample chat room',
    participants: ['user1', 'user2'] // Example data
  });
});

// Create a new chat room
app.post('/api/rooms', verifyToken, async (req, res) => {
  const { name, description } = req.body;
  const roomId = `room_${Date.now()}`;
  
  try {
    // Create a queue for this room in RabbitMQ
    await rabbitChannel.assertQueue(roomId, { durable: true });
    await rabbitChannel.bindQueue(roomId, 'chat_exchange', roomId);
    
    // In a real app, we'd store room details in a database
    res.status(201).json({
      id: roomId,
      name,
      description,
      created: new Date().toISOString(),
      createdBy: req.user.username
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create chat room' });
  }
});

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  let authenticated = false;
  let username = null;
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle authentication
      if (data.type === 'authenticate') {
        try {
          const decoded = jwt.verify(data.token, JWT_SECRET);
          authenticated = true;
          username = decoded.username;
          ws.send(JSON.stringify({ type: 'auth_success', username }));
          console.log(`User ${username} authenticated`);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }));
        }
        return;
      }
      
      // All other messages require authentication
      if (!authenticated) {
        ws.send(JSON.stringify({ type: 'error', error: 'Authentication required' }));
        return;
      }
      
      // Handle subscribing to a room
      if (data.type === 'subscribe') {
        const roomId = data.roomId;
        console.log(`User ${username} subscribing to room ${roomId}`);
        
        // Set up consumer for this room
        rabbitChannel.consume(roomId, (msg) => {
          if (msg) {
            const content = msg.content.toString();
            ws.send(JSON.stringify({ 
              type: 'message', 
              roomId,
              content: JSON.parse(content)
            }));
            rabbitChannel.ack(msg);
          }
        });
        
        ws.roomSubscriptions = ws.roomSubscriptions || [];
        ws.roomSubscriptions.push(roomId);
        
        ws.send(JSON.stringify({ type: 'subscribed', roomId }));
        return;
      }
      
      // Handle sending a message to a room
      if (data.type === 'message') {
        const { roomId, text } = data;
        console.log(`Message from ${username} to room ${roomId}: ${text}`);
        
        const messageData = {
          sender: username,
          text,
          timestamp: new Date().toISOString()
        };
        
        // Publish message to RabbitMQ
        rabbitChannel.publish(
          'chat_exchange', 
          roomId, 
          Buffer.from(JSON.stringify(messageData)),
          { persistent: true }
        );
        
        return;
      }
      
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Failed to process message' }));
    }
  });
  
  ws.on('close', () => {
    console.log(`WebSocket connection closed${username ? ` for user ${username}` : ''}`);
    // Clean up any subscriptions
    if (ws.roomSubscriptions && ws.roomSubscriptions.length > 0) {
      // In a real implementation, you might need to clean up RabbitMQ consumers here
    }
  });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint available at ws://localhost:${PORT}`);
}); 