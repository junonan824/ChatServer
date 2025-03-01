module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'my_super_secret_key',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_app',
  RABBIT_URL: process.env.RABBIT_URL || 'amqp://localhost',
  
  // 추가 설정
  JWT_EXPIRATION: '24h',
  RECONNECT_INTERVAL: 5000,
  MESSAGE_HISTORY_LIMIT: 20
}; 