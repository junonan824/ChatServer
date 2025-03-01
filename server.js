const express = require('express');
const http = require('http');
const StompServer = require('stomp-broker-js');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Create STOMP server
const stompServer = new StompServer({
  server: server,
  path: '/ws',
  protocol: 'stomp'
});

// Basic route
app.get('/', (req, res) => {
  res.send('Real-time Chat Server is running');
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

// STOMP subscription authentication
stompServer.onClientConnect = (sessionId, headers) => {
  // Here you can validate the connection using JWT from headers
  console.log('Client connected:', sessionId, headers);
  return true; // Return false to reject the connection
};

// Handle chat messages
stompServer.onSubscribe = (sessionId, topic) => {
  console.log(`Client ${sessionId} subscribed to ${topic}`);
};

stompServer.onSend = (sessionId, topic, message) => {
  console.log(`Message from ${sessionId} to ${topic}:`, message);
  // You can add additional processing here
};

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket STOMP endpoint available at ws://localhost:${PORT}/ws`);
}); 