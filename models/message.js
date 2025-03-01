const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  sender: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// 룸 ID와 타임스탬프에 대한 복합 인덱스 생성
messageSchema.index({ roomId: 1, timestamp: -1 });

// sender와 username 간의 가상 매핑 설정
messageSchema.virtual('displayName').get(function() {
  return this.sender;
});

// 변환 시 sender를 username으로도 노출
messageSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.username = obj.sender;  // 호환성을 위해 username 필드 추가
  return obj;
};

// 가상 속성을 JSON 변환에 포함
messageSchema.set('toJSON', { getters: true, virtuals: true });
messageSchema.set('toObject', { getters: true, virtuals: true });

module.exports = mongoose.model('Message', messageSchema); 