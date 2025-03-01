const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { connectToMongoDB } = require('./config/db');
const { connectToRabbitMQ } = require('./services/rabbitmq');
const { setupWebSocketServer } = require('./services/websocket');
const config = require('./config');
const { router: authRoutes, login } = require('./routes/auth');
const roomRoutes = require('./routes/rooms');

// Express 앱 생성
const app = express();
const server = http.createServer(app);

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 라우트 설정
app.use('/api/auth', authRoutes);  // 원래 경로로 돌려놓습니다
app.use('/api/rooms', roomRoutes);

// 헬스 체크 엔드포인트
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Chat server is running' });
});

// 클라이언트 호환성을 위한 직접 라우트 정의
app.post('/api/login', login);

// 변경 코드:
const ENABLE_TEST_MESSAGES = false; // 테스트 메시지 비활성화

// 서비스 초기화
async function initializeServices() {
  try {
    // MongoDB 연결
    await connectToMongoDB();
    
    // RabbitMQ 연결
    await connectToRabbitMQ();
    
    // WebSocket 서버 설정
    setupWebSocketServer(server);
    
    // 서버 시작
    server.listen(config.PORT, () => {
      console.log(`Server running on port ${config.PORT}`);
      console.log(`WebSocket endpoint available at ws://localhost:${config.PORT}`);
    });

    // 변경 코드:
    if (ENABLE_TEST_MESSAGES) {
      testMessageInterval = setInterval(() => {
        sendTestMessage();
      }, 10000);
    }
  } catch (error) {
    console.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// 서버 시작
initializeServices();

// 종료 시 리소스 정리
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await require('./services/rabbitmq').shutdown();
  await require('./config/db').shutdown();
  process.exit(0);
});

// 예외 처리
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // 프로덕션 환경에서는 여기서 종료하지 않도록 주의
}); 