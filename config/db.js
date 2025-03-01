const mongoose = require('mongoose');
const config = require('./index');
const Room = require('../models/room');
const Message = require('../models/message');

// MongoDB 연결 함수
async function connectToMongoDB() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB at:', config.MONGODB_URI);
    
    // 컬렉션 초기화
    await Promise.all([
      Room.createCollection(),
      Message.createCollection()
    ]);
    console.log('MongoDB collections initialized');
    
    // 데이터베이스 목록 확인 (개발 환경에서만)
    if (process.env.NODE_ENV !== 'production') {
      const result = await mongoose.connection.db.admin().listDatabases();
      console.log('Available databases:', result.databases.map(db => db.name));
    }
    
    return mongoose.connection;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    console.log('MongoDB 연결에 실패했습니다. MongoDB가 설치되어 있고 실행 중인지 확인하세요.');
    await retryConnection();
  }
}

// 재연결 시도 함수
async function retryConnection(retries = 5, interval = config.RECONNECT_INTERVAL) {
  if (retries === 0) {
    console.error('MongoDB 연결 재시도 실패. 서버는 계속 실행되지만 DB 기능은 제한됩니다.');
    return;
  }
  
  console.log(`MongoDB 재연결 시도 (남은 시도: ${retries})...`);
  
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('MongoDB에 성공적으로 연결되었습니다!');
  } catch (err) {
    console.error('MongoDB 재연결 실패:', err.message);
    setTimeout(() => retryConnection(retries - 1, interval), interval);
  }
}

// 종료 함수
async function shutdown() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
}

module.exports = {
  connectToMongoDB,
  retryConnection,
  shutdown
}; 