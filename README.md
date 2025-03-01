# 실시간 채팅 애플리케이션

MongoDB, RabbitMQ 및 WebSocket을 활용한 멀티룸 지원 실시간 채팅 애플리케이션입니다. 이 프로젝트는 메시지 브로커를 통한 확장 가능한 아키텍처와 영구 메시지 저장을 제공합니다.

## 기술 스택

### 백엔드
- **Node.js** & **Express**: 서버 런타임 및 API 프레임워크
- **WebSocket**: 실시간 양방향 통신
- **STOMP 프로토콜**: 메시지 형식 및 채널 관리
- **RabbitMQ**: 메시지 브로커링 및 큐 관리
- **MongoDB**: 메시지 및 채팅방 영구 저장
- **Mongoose**: MongoDB ODM(Object Data Modeling)
- **JWT**: 사용자 인증

### 프론트엔드
- **Next.js**: React 기반 프론트엔드 프레임워크
- **React**: UI 컴포넌트 라이브러리
- **WebSocket API**: 서버와의 실시간 통신

## 설치 및 설정

### 필수 요구 사항
- Node.js (v14 이상)
- MongoDB (v4.4 이상)
- RabbitMQ (v3.8 이상)

### 서버 설치

```bash
# 저장소 복제
git clone https://github.com/yourusername/realtime-chat-app.git
cd realtime-chat-app

# 서버 종속성 설치
npm install

# 서버 실행
npm start
```

### 클라이언트 설치

```bash
# 클라이언트 디렉토리로 이동
cd client

# 클라이언트 종속성 설치
npm install

# 개발 모드로 실행
npm run dev
```

### 환경 변수 (선택 사항)

다음 환경 변수를 설정하여 기본 구성을 변경할 수 있습니다:

```
PORT=4000
JWT_SECRET=your_jwt_secret
MONGODB_URI=mongodb://localhost:27017/chat_app
RABBIT_URL=amqp://localhost
```

## 기능

- **사용자 인증**: JWT 기반 인증 시스템
- **멀티룸 채팅**: 여러 채팅방 생성 및 참여
- **실시간 메시징**: WebSocket을 통한 즉각적인 메시지 전송
- **메시지 히스토리**: 사용자가 방에 입장할 때 최근 20개 메시지 자동 로드
- **자동 재연결**: 네트워크 문제 발생 시 자동 재연결 시도
- **확장 가능한 구조**: RabbitMQ를 통한 메시지 브로커링으로 수평 확장 가능

## API 엔드포인트

### 인증
- `POST /api/login` - 사용자 로그인 및 JWT 토큰 발급

### 채팅방
- `GET /api/rooms` - 사용 가능한 채팅방 목록 조회
- `GET /api/rooms/:roomId` - 특정 채팅방 정보 조회
- `POST /api/rooms` - 새 채팅방 생성

### WebSocket 프로토콜
채팅 기능은 WebSocket을 통해 STOMP 프로토콜 기반으로 구현되었습니다:

- `CONNECT` - 사용자 인증 및 연결 수립
- `SUBSCRIBE` - 특정 채팅방 구독
- `SEND` - 메시지 전송
- `UNSUBSCRIBE` - 채팅방 구독 취소
- `DISCONNECT` - 연결 종료

## 프로젝트 구조

```
.
├── client/                 # Next.js 클라이언트
│   ├── app/                # 페이지 및 레이아웃
│   │   ├── chat/           # 채팅 페이지
│   │   └── page.tsx        # 로그인 페이지
│   └── next.config.js      # Next.js 설정
├── models/                 # MongoDB 모델
│   ├── message.js          # 메시지 스키마
│   └── room.js             # 채팅방 스키마
├── server.js               # Express 서버 및 WebSocket 핸들러
├── package.json            # 서버 종속성
└── README.md               # 프로젝트 문서
```

## 기여 방법

1. 이 저장소를 포크합니다
2. 새 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경 사항을 커밋합니다 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성합니다

## 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.
```
