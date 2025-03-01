const jwt = require('jsonwebtoken');
const config = require('../config');

// 토큰 검증 미들웨어
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// 토큰 생성 함수
function generateToken(user) {
  return jwt.sign(
    { username: user.username },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRATION }
  );
}

// 토큰 검증 함수 (WebSocket용)
function validateToken(token) {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    return decoded.username;
  } catch (err) {
    return null;
  }
}

module.exports = {
  verifyToken,
  generateToken,
  validateToken
}; 