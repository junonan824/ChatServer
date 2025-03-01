const amqp = require('amqplib');
const config = require('../config');

let rabbitConnection = null;
let rabbitChannel = null;

// RabbitMQ 연결 함수
async function connectToRabbitMQ() {
  try {
    // RabbitMQ 연결
    rabbitConnection = await amqp.connect(config.RABBIT_URL);
    rabbitChannel = await rabbitConnection.createChannel();
    
    console.log('Connected to RabbitMQ');
    
    // 채팅 메시지용 exchange 선언
    await rabbitChannel.assertExchange('chat_exchange', 'topic', { durable: true });
    
    return { connection: rabbitConnection, channel: rabbitChannel };
  } catch (error) {
    console.error('Error connecting to RabbitMQ:', error);
    setTimeout(connectToRabbitMQ, config.RECONNECT_INTERVAL);
    return null;
  }
}

// 채팅방 큐 생성
async function createRoomQueue(roomId) {
  if (!rabbitChannel) {
    throw new Error('RabbitMQ channel not available');
  }
  
  await rabbitChannel.assertQueue(roomId, { durable: true });
  await rabbitChannel.bindQueue(roomId, 'chat_exchange', roomId);
  
  return roomId;
}

// 메시지 발행
async function publishMessage(roomId, message) {
  if (!rabbitChannel) {
    throw new Error('RabbitMQ channel not available');
  }
  
  return rabbitChannel.publish(
    'chat_exchange',
    roomId,
    Buffer.from(JSON.stringify(message)),
    { persistent: true }
  );
}

// 메시지 구독
async function subscribeToRoom(roomId, messageCallback) {
  console.log(`Setting up RabbitMQ subscription for room ${roomId}`);
  if (!rabbitChannel) {
    throw new Error('RabbitMQ channel not available');
  }
  
  const { queue } = await rabbitChannel.assertQueue('', { exclusive: true });
  await rabbitChannel.bindQueue(queue, 'chat_exchange', roomId);
  
  const consumerTag = (await rabbitChannel.consume(queue, (msg) => {
    console.log(`RabbitMQ message received for room ${roomId}`);
    try {
      const content = JSON.parse(msg.content.toString());
      console.log(`Processing RabbitMQ message for room ${roomId}:`, content);
      messageCallback(content);
      rabbitChannel.ack(msg);
    } catch (error) {
      console.error('Error processing RabbitMQ message:', error);
    }
  })).consumerTag;
  
  console.log(`RabbitMQ subscription successful for room ${roomId}, tag: ${consumerTag}`);
  return { queue, consumerTag };
}

// 구독 취소
async function unsubscribe(consumerTag) {
  if (rabbitChannel && consumerTag) {
    await rabbitChannel.cancel(consumerTag);
  }
}

// 종료 함수
async function shutdown() {
  if (rabbitChannel) await rabbitChannel.close();
  if (rabbitConnection) await rabbitConnection.close();
  console.log('RabbitMQ disconnected');
}

// 채널 및 연결 getter
function getChannel() {
  return rabbitChannel;
}

function getConnection() {
  return rabbitConnection;
}

// 테스트 메시지 전송 함수 찾기
// 예:
function startTestMessageService() {
  // 테스트 메시지 전송을 비활성화
  return; // 함수를 조기 종료하여 테스트 메시지를 보내지 않음
  
  // 기존 코드
  setInterval(() => {
    // 테스트 메시지 전송 코드
  }, 10000);
}

module.exports = {
  connectToRabbitMQ,
  createRoomQueue,
  publishMessage,
  subscribeToRoom,
  unsubscribe,
  shutdown,
  getChannel,
  getConnection
}; 