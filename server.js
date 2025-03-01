const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

// MongoDB 모델 가져오기
const Message = require('./models/message');
const Room = require('./models/room');

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
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key';

// MongoDB 연결 URL
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_app';

// RabbitMQ Connection
let rabbitConnection = null;
let rabbitChannel = null;

// 간단한 사용자 DB (실제로는 MongoDB 등 사용)
const users = [
  { username: 'alice', password: '1234' },
  { username: 'bob', password: '1234' },
  { username: 'charlie', password: '1234' }
];

// Connect to RabbitMQ
async function connectToRabbitMQ() {
  try {
    // RabbitMQ 연결
    const RABBIT_URL = process.env.RABBIT_URL || 'amqp://localhost';
    rabbitConnection = await amqp.connect(RABBIT_URL);
    rabbitChannel = await rabbitConnection.createChannel();
    
    console.log('Connected to RabbitMQ');
    
    // 채팅 메시지용 exchange 선언
    await rabbitChannel.assertExchange('chat_exchange', 'topic', { durable: true });
    
    return true;
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    setTimeout(connectToRabbitMQ, 5000); // 재연결 시도
    return false;
  }
}

// 토큰 검증 함수
function validateToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.username;
  } catch (err) {
    return null;
  }
}

// Connect to RabbitMQ on startup
connectToRabbitMQ();

// MongoDB에 연결
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB at:', MONGODB_URI);
    
    // 초기 설정: 필요한 컬렉션과 인덱스 확인
    return Promise.all([
      Room.createCollection(),
      Message.createCollection()
    ]);
  })
  .then(() => {
    console.log('MongoDB collections initialized');
    // 데이터베이스 목록 확인
    mongoose.connection.db.admin().listDatabases()
      .then(result => {
        console.log('Available databases:', result.databases.map(db => db.name));
      })
      .catch(err => console.error('Failed to list databases:', err));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('MongoDB 연결에 실패했습니다. MongoDB가 설치되어 있고 실행 중인지 확인하세요.');
    console.log('자동 재연결을 시도합니다...');
    
    // 재연결 시도 함수
    const retryConnection = (retries = 5, interval = 5000) => {
      if (retries === 0) {
        console.error('MongoDB 연결 재시도 실패. 서버는 계속 실행되지만 DB 기능은 제한됩니다.');
        return;
      }
      
      setTimeout(() => {
        console.log(`MongoDB 재연결 시도 (남은 시도: ${retries})...`);
        
        mongoose.connect(MONGODB_URI)
          .then(() => console.log('MongoDB에 성공적으로 연결되었습니다!'))
          .catch(err => {
            console.error('MongoDB 재연결 실패:', err.message);
            retryConnection(retries - 1, interval);
          });
      }, interval);
    };
    
    retryConnection();
  });

// 기본 라우트
app.get('/', (req, res) => {
  res.send('Real-time Chat Server with RabbitMQ is running');
});

// 로그인 엔드포인트 (JWT 발급)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, username });
});

// JWT 토큰 검증 미들웨어
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// 채팅방 정보 조회 엔드포인트
app.get('/api/rooms/:roomId', verifyToken, async (req, res) => {
  const roomId = req.params.roomId;
  
  try {
    // MongoDB에서 채팅방 정보 조회
    const room = await Room.findOne({ roomId });
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
      id: room.roomId,
      name: room.name,
      description: room.description,
      created: room.created,
      createdBy: room.createdBy
    });
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: 'Failed to get room details' });
  }
});

// 채팅방 목록 조회 엔드포인트
app.get('/api/rooms', verifyToken, async (req, res) => {
  try {
    const rooms = await Room.find().sort({ created: -1 }).lean();
    res.json(rooms.map(room => ({
      id: room.roomId,
      name: room.name,
      description: room.description,
      created: room.created,
      createdBy: room.createdBy
    })));
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to get rooms' });
  }
});

// 채팅방 생성 엔드포인트
app.post('/api/rooms', verifyToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }
    
    // 고유한 룸 ID 생성
    const roomId = `room-${Date.now()}`;
    
    if (!rabbitChannel) {
      return res.status(503).json({ error: 'Message broker unavailable' });
    }
    
    // RabbitMQ에 해당 방을 위한 큐 생성
    await rabbitChannel.assertQueue(roomId, { durable: true });
    await rabbitChannel.bindQueue(roomId, 'chat_exchange', roomId);
    
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

// WebSocket 연결 처리
wss.on('connection', (ws, req) => {
  console.log(`새 WebSocket 연결 (IP: ${req.socket.remoteAddress})`);
  
  // Add connection tracking
  ws.isAlive = true;
  
  // Ping mechanism to keep connection alive
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  let authenticated = false;
  let username = null;
  const subscriptions = new Map(); // 사용자의 구독 정보 관리
  
  ws.on('message', async (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      const { command, headers, body } = parsedMessage;
      
      // STOMP-like 프로토콜 구현
      switch (command) {
        case 'CONNECT':
          // 토큰으로 인증
          const token = headers.token;
          if (!token) {
            sendError(ws, 'Authentication required');
            return;
          }
          
          username = validateToken(token);
          if (!username) {
            sendError(ws, 'Invalid token');
            return;
          }
          
          authenticated = true;
          ws.send(JSON.stringify({
            command: 'CONNECTED',
            headers: { user: username }
          }));
          break;
          
        case 'SUBSCRIBE':
          if (!authenticated) {
            sendError(ws, 'Authentication required');
            return;
          }
          
          const { destination } = headers;
          if (!destination) {
            sendError(ws, 'Destination required');
            return;
          }
          
          // RabbitMQ에 구독 설정
          try {
            if (!rabbitChannel) {
              sendError(ws, 'Message broker unavailable');
              return;
            }
            
            // 구독 시 MongoDB에서 이전 메시지 조회 (최대 20개)
            const previousMessages = await Message.find({ roomId: destination })
              .sort({ timestamp: -1 })
              .limit(20)
              .lean();
            
            const consumerTag = await rabbitChannel.consume(
              destination,
              (msg) => {
                if (msg) {
                  const content = msg.content.toString();
                  ws.send(JSON.stringify({
                    command: 'MESSAGE',
                    headers: {
                      destination,
                      'message-id': msg.properties.messageId || Date.now().toString()
                    },
                    body: content
                  }));
                  rabbitChannel.ack(msg);
                }
              }
            );
            
            // 구독 정보 저장
            subscriptions.set(destination, consumerTag.consumerTag);
            
            // 이전 메시지 전송
            if (previousMessages.length > 0) {
              // 시간순으로 정렬
              const sortedMessages = previousMessages.reverse();
              
              for (const msg of sortedMessages) {
                ws.send(JSON.stringify({
                  command: 'MESSAGE',
                  headers: {
                    destination,
                    'message-id': `history-${msg._id}`,
                    'content-type': 'application/json'
                  },
                  body: JSON.stringify({
                    sender: msg.sender,
                    content: msg.content,
                    timestamp: msg.timestamp.toISOString()
                  })
                }));
              }
            }
            
            ws.send(JSON.stringify({
              command: 'RECEIPT',
              headers: {
                'receipt-id': headers['receipt-id'] || Date.now().toString(),
                subscription: destination
              }
            }));
          } catch (error) {
            console.error('Subscription error:', error);
            sendError(ws, 'Failed to subscribe: ' + error.message);
          }
          break;
          
        case 'SEND':
          if (!authenticated) {
            sendError(ws, 'Authentication required');
            return;
          }
          
          const { destination: dest } = headers;
          if (!dest || !body) {
            sendError(ws, 'Destination and body required');
            return;
          }
          
          // RabbitMQ로 메시지 발행
          try {
            if (!rabbitChannel) {
              sendError(ws, 'Message broker unavailable');
              return;
            }
            
            const messageData = {
              roomId: dest,
              sender: username,
              content: body,
              timestamp: new Date()
            };
            
            const newMessage = new Message(messageData);
            await newMessage.save();
            
            rabbitChannel.publish(
              'chat_exchange',
              dest,
              Buffer.from(JSON.stringify(messageData)),
              { 
                persistent: true,
                messageId: Date.now().toString()
              }
            );
            
            ws.send(JSON.stringify({
              command: 'RECEIPT',
              headers: {
                'receipt-id': headers['receipt-id'] || Date.now().toString()
              }
            }));
          } catch (error) {
            console.error('Message publishing error:', error);
            sendError(ws, 'Failed to send message: ' + error.message);
          }
          break;
          
        case 'UNSUBSCRIBE':
          if (!authenticated) {
            sendError(ws, 'Authentication required');
            return;
          }
          
          const { id } = headers;
          if (!id || !subscriptions.has(id)) {
            sendError(ws, 'Invalid subscription');
            return;
          }
          
          try {
            // RabbitMQ 구독 취소
            if (rabbitChannel) {
              await rabbitChannel.cancel(subscriptions.get(id));
            }
            
            subscriptions.delete(id);
            
            ws.send(JSON.stringify({
              command: 'RECEIPT',
              headers: {
                'receipt-id': headers['receipt-id'] || Date.now().toString()
              }
            }));
          } catch (error) {
            console.error('Unsubscribe error:', error);
            sendError(ws, 'Failed to unsubscribe: ' + error.message);
          }
          break;
          
        case 'DISCONNECT':
          // 모든 구독 정리
          cleanupSubscriptions();
          ws.close();
          break;
          
        default:
          sendError(ws, `Unknown command: ${command}`);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      sendError(ws, 'Failed to process message');
    }
  });
  
  // 에러 메시지 전송 헬퍼 함수
  function sendError(ws, message) {
    ws.send(JSON.stringify({
      command: 'ERROR',
      headers: {},
      body: message
    }));
  }
  
  // 구독 정리 함수
  function cleanupSubscriptions() {
    if (rabbitChannel) {
      for (const [destination, consumerTag] of subscriptions.entries()) {
        try {
          rabbitChannel.cancel(consumerTag);
        } catch (error) {
          console.error(`Error canceling subscription to ${destination}:`, error);
        }
      }
    }
    subscriptions.clear();
  }
  
  // 연결 종료 처리
  ws.on('close', (code, reason) => {
    console.log(`WebSocket connection closed: code=${code}, reason=${reason || 'No reason'}, user=${username || 'Unknown'}`);
    
    // 모든 구독 정리
    cleanupSubscriptions();
    
    // 디버깅 정보 출력
    if (code !== 1000) {
      console.log('비정상 종료: 연결이 예기치 않게 종료되었습니다');
    }
  });
});

// Add a ping interval to keep connections alive
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// Clean up on server close
wss.on('close', () => {
  clearInterval(interval);
});

// 서버 시작
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket endpoint available at ws://localhost:${PORT}`);
});

// 종료 시 리소스 정리
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // RabbitMQ 연결 종료
  if (rabbitChannel) await rabbitChannel.close();
  if (rabbitConnection) await rabbitConnection.close();
  
  // MongoDB 연결 종료
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
  
  process.exit(0);
});

// 서버에 uncaughtException 핸들러 추가
process.on('uncaughtException', (err) => {
  console.error('처리되지 않은 예외:', err);
  // 프로덕션 환경에서는 여기서 종료하지 않도록 주의
}); 