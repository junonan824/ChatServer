const express = require('express');
const { generateToken } = require('../middleware/auth');
const users = require('../config/users');
const router = express.Router();

// 로그인 핸들러 함수
const login = (req, res) => {
  const { username, password } = req.body;
  
  // 사용자 인증
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // JWT 토큰 생성
  const token = generateToken(user);
  
  // 응답
  res.json({
    token,
    username: user.username
  });
};

// 로그인 라우트
router.post('/login', login);

module.exports = {
  router,
  login
}; 