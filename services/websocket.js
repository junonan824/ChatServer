const WebSocket = require('ws');
const { validateToken } = require('../middleware/auth');
const { subscribeToRoom, unsubscribe, publishMessage } = require('./rabbitmq');
const Message = require('../models/message');
const Room = require('../models/room');
const config = require('../config');

// 클라이언트 맵 (WebSocket 연결 관리)
const clients = new Map();

// 구독 정보 (사용자별 구독 채널 관리)
const subscriptions = new Map();

/**
 * WebSocket 서버 설정
 * @param {Object} server - HTTP 서버 인스턴스
 */
function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', handleConnection);
  
  // 연결 유지를 위한 Ping 간격 설정
  const interval = setInterval(() => {
    wss.clients.forEach(pingClient);
  }, 30000);
  
  // 서버 종료 시 정리
  wss.on('close', () => {
    clearInterval(interval);
  });
  
  console.log('WebSocket server initialized');
  return wss;
}

/**
 * 클라이언트 연결 처리
 * @param {WebSocket} ws - WebSocket 연결
 * @param {Object} req - HTTP 요청 객체
 */
function handleConnection(ws, req) {
  console.log('New WebSocket connection');
  
  // 연결 상태 설정
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  // 메시지 처리
  ws.on('message', async (message) => {
    try {
      await handleMessage(ws, message);
    } catch (error) {
      console.error('Error handling message:', error);
      sendErrorToClient(ws, 'Failed to process message');
    }
  });
  
  // 연결 종료 처리
  ws.on('close', (code) => {
    handleDisconnection(ws, code);
  });
}

/**
 * 메시지 처리 함수
 * @param {WebSocket} ws - WebSocket 연결
 * @param {Buffer} message - 클라이언트 메시지
 */
async function handleMessage(ws, message) {
  const data = JSON.parse(message.toString());
  
  // 메시지 유형에 따른 처리
  switch (data.type) {
    case 'AUTH':
      handleAuth(ws, data);
      break;
      
    case 'JOIN':
      await handleJoin(ws, data);
      break;
      
    case 'LEAVE':
      handleLeave(ws, data);
      break;
      
    case 'MESSAGE':
      await handleChatMessage(ws, data);
      break;
      
    default:
      console.warn('Unknown message type:', data.type);
      sendErrorToClient(ws, 'Unknown message type');
  }
}

/**
 * 인증 메시지 처리
 * @param {WebSocket} ws - WebSocket 연결
 * @param {Object} data - 메시지 데이터
 */
function handleAuth(ws, data) {
  const username = validateToken(data.token);
  
  if (username) {
    ws.username = username;
    clients.set(username, ws);
    
    // 인증 성공 응답
    ws.send(JSON.stringify({
      type: 'AUTH_SUCCESS',
      username
    }));
    
    console.log(`User authenticated: ${username}`);
  } else {
    // 인증 실패 응답
    sendErrorToClient(ws, 'Authentication failed');
    ws.close();
  }
}

/**
 * 채팅방 참여 처리
 * @param {WebSocket} ws - WebSocket 연결
 * @param {Object} data - 메시지 데이터
 */
async function handleJoin(ws, data) {
  if (!ws.username) {
    return sendErrorToClient(ws, 'Not authenticated');
  }
  
  const { roomId } = data;
  
  try {
    // 방 존재 여부 확인
    const room = await Room.findOne({ roomId });
    if (!room) {
      return sendErrorToClient(ws, 'Room not found');
    }
    
    // RabbitMQ 구독 설정
    const subscription = await subscribeToRoom(roomId, (message) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
    
    // 구독 정보 저장
    if (!subscriptions.has(ws.username)) {
      subscriptions.set(ws.username, new Map());
    }
    subscriptions.get(ws.username).set(roomId, subscription);
    
    // 방 참여 응답
    ws.send(JSON.stringify({
      type: 'JOIN_SUCCESS',
      roomId,
      roomName: room.name
    }));
    
    // 최근 메시지 조회 및 전송
    const recentMessages = await Message.find({ roomId })
      .sort({ timestamp: -1 })
      .limit(config.MESSAGE_HISTORY_LIMIT);
    
    if (recentMessages.length > 0) {
      ws.send(JSON.stringify({
        type: 'MESSAGE_HISTORY',
        roomId,
        messages: recentMessages.reverse()
      }));
    }
    
    console.log(`User ${ws.username} joined room ${roomId}`);
  } catch (error) {
    console.error('Error joining room:', error);
    sendErrorToClient(ws, 'Failed to join room');
  }
}

/**
 * 채팅방 퇴장 처리
 * @param {WebSocket} ws - WebSocket 연결
 * @param {Object} data - 메시지 데이터
 */
function handleLeave(ws, data) {
  if (!ws.username) {
    return sendErrorToClient(ws, 'Not authenticated');
  }
  
  const { roomId } = data;
  
  try {
    // 구독 취소
    const userSubscriptions = subscriptions.get(ws.username);
    if (userSubscriptions && userSubscriptions.has(roomId)) {
      const subscription = userSubscriptions.get(roomId);
      unsubscribe(subscription.consumerTag);
      userSubscriptions.delete(roomId);
      
      ws.send(JSON.stringify({
        type: 'LEAVE_SUCCESS',
        roomId
      }));
      
      console.log(`User ${ws.username} left room ${roomId}`);
    }
  } catch (error) {
    console.error('Error leaving room:', error);
    sendErrorToClient(ws, 'Failed to leave room');
  }
}

/**
 * 채팅 메시지 처리
 * @param {WebSocket} ws - WebSocket 연결
 * @param {Object} data - 메시지 데이터
 */
async function handleChatMessage(ws, data) {
  if (!ws.username) {
    return sendErrorToClient(ws, 'Not authenticated');
  }
  
  const { roomId, content } = data;
  
  if (!content || !roomId) {
    return sendErrorToClient(ws, 'Invalid message format');
  }
  
  try {
    // 메시지 생성
    const messageData = {
      type: 'NEW_MESSAGE',
      roomId,
      username: ws.username,
      content,
      timestamp: new Date().toISOString()
    };
    
    // 데이터베이스에 메시지 저장
    const message = new Message({
      roomId,
      username: ws.username,
      content,
      timestamp: new Date()
    });
    
    await message.save();
    
    // RabbitMQ에 메시지 발행
    await publishMessage(roomId, messageData);
  } catch (error) {
    console.error('Error handling chat message:', error);
    sendErrorToClient(ws, 'Failed to send message');
  }
}

/**
 * 연결 종료 처리
 * @param {WebSocket} ws - WebSocket 연결
 * @param {number} code - 종료 코드
 */
function handleDisconnection(ws, code) {
  if (ws.username) {
    // 클라이언트 맵에서 제거
    clients.delete(ws.username);
    
    // 사용자의 모든 구독 취소
    const userSubscriptions = subscriptions.get(ws.username);
    if (userSubscriptions) {
      for (const [roomId, subscription] of userSubscriptions.entries()) {
        unsubscribe(subscription.consumerTag);
        console.log(`Unsubscribed ${ws.username} from room ${roomId}`);
      }
      subscriptions.delete(ws.username);
    }
    
    console.log(`User disconnected: ${ws.username}, code: ${code}`);
  }
  
  if (code !== 1000) {
    console.log('비정상 종료: 연결이 예기치 않게 종료되었습니다');
  }
}

/**
 * 클라이언트에 오류 메시지 전송
 * @param {WebSocket} ws - WebSocket 연결
 * @param {string} message - 오류 메시지
 */
function sendErrorToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      message
    }));
  }
}

/**
 * 클라이언트 Ping 확인
 * @param {WebSocket} ws - WebSocket 연결
 */
function pingClient(ws) {
  if (ws.isAlive === false) return ws.terminate();
  
  ws.isAlive = false;
  ws.ping(() => {});
}

module.exports = {
  setupWebSocketServer
}; 