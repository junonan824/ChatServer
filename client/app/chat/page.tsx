"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// 방 타입 정의 추가
type Room = {
  roomId?: string;
  id?: string;
  name: string;
  description?: string;
};

interface Message {
  sender: string;
  content: string;
  timestamp: string;
  roomId?: string;
  type?: string;
  _id?: string;
  _tempId?: string;
  _pending?: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [authStatus, setAuthStatus] = useState('pending'); // 'pending', 'authenticated', 'failed'
  
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedRoomRef = useRef<Room | null>(null);
  const pendingRoomRef = useRef(null);

  // subscribeToRoom 함수를 useEffect 밖으로 이동
  const subscribeToRoom = (room) => {
    console.log('🔄 Subscribing to room:', room);
    
    // 기존 메시지 초기화 - 방 변경 시 중요
    setMessages([]);
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        // 현재 방에서 나가기 (선택적)
        if (selectedRoomRef.current && selectedRoomRef.current.roomId !== room.roomId) {
          socketRef.current.send(JSON.stringify({
            type: 'LEAVE',
            roomId: selectedRoomRef.current.roomId || selectedRoomRef.current.id
          }));
          console.log('LEAVE message sent for previous room');
        }
        
        // 새 방에 입장
        socketRef.current.send(JSON.stringify({
          type: 'JOIN',
          roomId: room.roomId || room.id
        }));
        console.log('🔄 JOIN message sent for room:', room.roomId || room.id);
        
        setSelectedRoom(room);
        selectedRoomRef.current = room;
        console.log('✅ Selected room set to:', room);
        
        // 마지막 사용 방 저장
        localStorage.setItem('lastRoomId', room.roomId || room.id);
      } catch (err) {
        console.error('Error sending JOIN message:', err);
        setError('Failed to join room. Please try again.');
      }
    } else {
      console.log('⏳ WebSocket not connected, queueing room subscription');
      pendingRoomRef.current = room;
      
      setError('Connection lost. Reconnecting...');
      setTimeout(() => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          subscribeToRoom(room);
        }
      }, 2000);
    }
  };

  // sendMessage 함수 수정
  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedRoom) return;
    
    console.log('Attempting to send message:', messageText);
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        // 메시지 타입을 'NEW_MESSAGE'에서 'MESSAGE'로 변경
        const messageData = {
          type: 'MESSAGE',  // 서버가 기대하는 올바른 메시지 타입
          roomId: selectedRoom.roomId || selectedRoom.id,
          content: messageText,
          // sender는 서버에서 WebSocket 연결의 username을 사용하므로 필요 없음
          timestamp: new Date().toISOString()
        };
        
        console.log('Sending message data:', messageData);
        socketRef.current.send(JSON.stringify(messageData));
        
        // UI 업데이트를 위한 임시 메시지 추가
        const tempMessage = {
          _id: `temp-${Date.now()}`,
          roomId: selectedRoom.roomId || selectedRoom.id,
          content: messageText,
          sender: username,
          timestamp: new Date().toISOString(),
          _pending: true  // 전송 중 표시
        };
        
        setMessages(prev => [...prev, tempMessage]);
        setMessageText('');
      } catch (err) {
        console.error('Error sending message:', err);
        setError('Failed to send message. Please try again.');
      }
    } else {
      console.error('WebSocket not connected, cannot send message');
      setError('Connection lost. Please reconnect or refresh the page.');
    }
  };
  
  // createNewRoom 함수도 useEffect 밖으로 이동
  const createNewRoom = async () => {
    if (!newRoomName.trim()) {
      setError('Room name is required');
      return;
    }
    
    try {
      const token = localStorage.getItem('chatToken');
      
      const response = await fetch('http://localhost:4000/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRoomName,
          description: newRoomDescription
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create room');
      }
      
      const newRoom = await response.json();
      console.log('Room created successfully:', newRoom);
      
      // 새 방을 목록에 추가
      setAvailableRooms(prev => [newRoom, ...prev]);
      
      // 입력 필드 초기화
      setNewRoomName('');
      setNewRoomDescription('');
      
      // 새로 생성한 방으로 이동
      subscribeToRoom(newRoom);
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Failed to create room. Please try again.');
    }
  };

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('chatToken');
    const storedUsername = localStorage.getItem('chatUsername');
    const lastRoomId = localStorage.getItem('lastRoomId');
    
    if (!token) {
      router.push('/');
      return;
    }
    
    if (storedUsername) {
      setUsername(storedUsername);
    }
    
    // WebSocket 참조 및 상태 변수
    let socket = null;
    let reconnectAttempt = 0;
    const maxReconnectAttempts = 3;
    let isEstablishingConnection = false;
    let connectionTimerRef = null;
    let fetchRoomsTimerRef = null;
    
    // WebSocket 연결 함수
    const connectWebSocket = () => {
      // 이미 연결 중이면 중복 연결 방지
      if (isEstablishingConnection) return;
      isEstablishingConnection = true;
      
      console.log('Establishing WebSocket connection...');
      
      // 기존 연결 정리
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (e) {
          // 오류 무시
        }
        socketRef.current = null;
      }
      
      try {
        socket = new WebSocket('ws://localhost:4000');
        
        // 참조 저장은 연결이 완전히 열린 후에만 수행
        socket.onopen = () => {
          console.log('WebSocket connection established');
          setConnected(true);
          reconnectAttempt = 0;
          socketRef.current = socket;
          isEstablishingConnection = false;
          
          // 약간의 지연 후 인증 메시지 전송
          setTimeout(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'AUTH',
                token: token
              }));
              console.log('Authentication message sent');
            }
          }, 300);
        };
        
        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          setError('Connection error. Please try again later.');
          isEstablishingConnection = false;
        };
        
        socket.onclose = (event) => {
          console.log(`WebSocket connection closed: code=${event.code}, reason=${event.reason}`);
          setConnected(false);
          isEstablishingConnection = false;
          socketRef.current = null;
          
          // 연결이 비정상적으로 닫힌 경우 재연결 시도
          if (!event.wasClean && reconnectAttempt < maxReconnectAttempts) {
            reconnectAttempt++;
            console.log(`Attempting to reconnect (${reconnectAttempt}/${maxReconnectAttempts})...`);
            
            // 지수 백오프 방식으로 재시도 지연 증가
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempt), 10000);
            connectionTimerRef = setTimeout(connectWebSocket, delay);
          } else if (reconnectAttempt >= maxReconnectAttempts) {
            setError('Maximum reconnection attempts reached. Please refresh the page.');
          }
        };
        
        // 메시지 핸들러 함수 설정
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // 서버 테스트 메시지 필터링 (SYSTEM 사용자가 보낸 메시지 무시)
            if (data.type === 'NEW_MESSAGE' && data.sender === 'SYSTEM' && data.content.includes('서버 테스트 메시지')) {
              console.log('테스트 메시지 필터링됨:', data);
              return;
            }
            
            console.log('💬 WebSocket message received:', data);
            
            if (data.type === 'AUTH_SUCCESS') {
              setUsername(data.username);
              setAuthStatus('authenticated');
              setError('');
              
              // 인증 성공 후 대기 중인 방 구독 시도
              if (pendingRoomRef.current) {
                console.log('Processing pending room subscription after authentication');
                setTimeout(() => {
                  subscribeToRoom(pendingRoomRef.current);
                  pendingRoomRef.current = null;
                }, 500);
              } else if (lastRoomId && !selectedRoomRef.current) {
                // 대기중인 구독이 없고 마지막 사용 방이 있는 경우
                // availableRooms가 아직 로드되지 않았을 수 있으므로 fetchRooms에서 처리
                fetchRooms();
              }
            } 
            else if (data.type === 'ERROR') {
              setError(data.message);
              if (data.message.includes('Not authenticated')) {
                setAuthStatus('failed');
              }
            }
            else if (data.type === 'MESSAGE_HISTORY' || data.type === 'ROOM_HISTORY') {
              // 메시지 히스토리 처리 - 이전 메시지를 모두 대체
              if (data.roomId === selectedRoomRef.current?.roomId) {
                console.log(`Received message history for room ${data.roomId}, ${data.messages.length} messages`);
                setMessages(data.messages);
              }
            } else if (data.type === 'NEW_MESSAGE') {
              // 새 메시지 처리
              if (data.roomId === selectedRoomRef.current?.roomId) {
                setMessages(prev => {
                  // 1. ID로 중복 확인
                  const existsById = prev.some(m => m._id === data._id);
                  if (existsById) return prev;
                  
                  // 2. 내용, 발신자, 타임스탬프가 비슷한 임시 메시지 찾기
                  const tempMessageIndex = prev.findIndex(m => 
                    m._pending && 
                    m.sender === data.sender && 
                    m.content === data.content &&
                    // 10초 이내의 메시지만 고려
                    Math.abs(new Date(m.timestamp).getTime() - new Date(data.timestamp).getTime()) < 10000
                  );
                  
                  // 임시 메시지를 찾았다면 대체
                  if (tempMessageIndex >= 0) {
                    const updatedMessages = [...prev];
                    updatedMessages[tempMessageIndex] = data; // 실제 메시지로 교체
                    return updatedMessages;
                  }
                  
                  // 해당 없으면 새 메시지 추가
                  return [...prev, data];
                });
              }
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      } catch (err) {
        console.error('Error creating WebSocket connection:', err);
        setError('Failed to establish connection. Please try again later.');
        isEstablishingConnection = false;
      }
    };
    
    // 채팅방 목록 가져오기
    const fetchRooms = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/rooms', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setAvailableRooms(data);
          
          // 마지막으로 사용한 방 선택 - 인증 상태일 때만 처리
          if (lastRoomId && authStatus === 'authenticated') {
            const lastRoom = data.find(room => room.roomId === lastRoomId);
            if (lastRoom) {
              console.log('Selecting last used room:', lastRoom);
              subscribeToRoom(lastRoom);
            }
          }
        } else {
          console.error('Failed to fetch rooms:', response.statusText);
        }
      } catch (error) {
        console.error('Error fetching rooms:', error);
      }
    };
    
    // 연결 순서 변경: 먼저 연결하고 rooms는 인증 후 조회
    connectionTimerRef = setTimeout(() => {
      connectWebSocket();
    }, 800);
    
    // rooms 목록은 별도 타이머로 지연 조회
    fetchRoomsTimerRef = setTimeout(() => {
      fetchRooms();
    }, 1500);
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      if (connectionTimerRef) {
        clearTimeout(connectionTimerRef);
      }
      if (fetchRoomsTimerRef) {
        clearTimeout(fetchRoomsTimerRef);
      }
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, "Component unmounted");
        } catch (e) {
          // 오류 무시
        }
        socketRef.current = null;
      }
    };
  }, [router, authStatus]);
  
  // Auto-scroll to the bottom of the message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // 선택된 방이 변경될 때마다 로그 출력 및 ref 업데이트
  useEffect(() => {
    console.log('Selected room changed to:', selectedRoom);
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);
  
  const handleLogout = () => {
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUsername');
    router.push('/');
  };

  return (
    <main className="flex flex-col h-screen bg-gray-100">
      <header className="bg-indigo-600 text-white p-4 shadow">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Real-time Chat</h1>
          {username && (
            <div className="flex items-center space-x-4">
              <span>Logged in as: {username}</span>
              <button 
                onClick={handleLogout}
                className="px-3 py-1 text-sm bg-indigo-700 rounded hover:bg-indigo-800"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
      
      {error && (
        <div className="p-3 m-4 text-sm text-red-800 bg-red-100 rounded">
          {error}
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 p-4 border-r overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-gray-800 border-b pb-2">Chat Rooms</h2>
            <ul className="space-y-1">
              {availableRooms.map(room => (
                <li key={room.roomId || room.id || Math.random().toString()}>
                  <button
                    onClick={() => subscribeToRoom(room)}
                    className={`w-full text-left px-3 py-2 rounded ${
                      selectedRoom && (selectedRoom.roomId === room.roomId || selectedRoom.id === room.id) 
                        ? 'bg-indigo-600 text-white font-medium shadow-sm' 
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100 shadow-sm'
                    }`}
                  >
                    {room.name || `Room ${room.roomId || room.id}`}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-800 border-b pb-2">Create New Room</h2>
            <div className="space-y-2">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-gray-800 bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 shadow-sm"
                placeholder="Room name"
              />
              <input
                type="text"
                value={newRoomDescription}
                onChange={(e) => setNewRoomDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-gray-800 bg-white focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 shadow-sm"
                placeholder="Room description"
              />
              <button
                onClick={createNewRoom}
                className="w-full px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium shadow-sm transition-all duration-200"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
        
        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-gray-50 border-l">
          {!selectedRoom ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 bg-white">
              Select a room to start chatting
            </div>
          ) : (
            <>
              {/* 선택한 방 이름 표시 */}
              <div className="p-3 border-b bg-indigo-50 shadow-sm flex items-center sticky top-0 z-10">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                <span className="font-semibold text-indigo-800">
                  {selectedRoom.name || `Room ${selectedRoom.roomId || selectedRoom.id}`}
                </span>
              </div>
              
              {/* 메시지 목록 영역 */}
              <div className="flex-1 p-4 overflow-y-auto bg-white">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message, index) => (
                      <div key={index} className={`mb-4 ${message.sender === username ? 'text-right' : 'text-left'}`}>
                        <div className="inline-block">
                          <div 
                            className={`px-4 py-2 rounded-lg shadow-sm max-w-xs md:max-w-md lg:max-w-lg ${
                              message.sender === username 
                                ? 'bg-indigo-500 text-white rounded-br-none' 
                                : 'bg-gray-200 text-gray-800 rounded-bl-none border border-gray-300'
                            }`}
                          >
                            {message.content}
                            {message._pending && (
                              <span className="ml-2 inline-block opacity-70">
                                <svg className="animate-spin h-3 w-3 inline" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className={`text-xs ${message.sender === username ? 'text-gray-600' : 'text-gray-500'} mt-1 font-medium`}>
                            {message.sender === username ? 'You' : message.sender} • {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
              
              {/* 메시지 입력 영역 */}
              <div className="p-3 border-t bg-gray-50 shadow-sm sticky bottom-0">
                <form onSubmit={sendMessage} className="flex">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage(e)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-l focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500 text-gray-800 bg-white shadow-sm"
                    placeholder="Type a message..."
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-r hover:bg-indigo-700 transition-all duration-200 font-medium shadow-sm"
                  >
                    Send
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
} 