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
  
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedRoomRef = useRef<Room | null>(null);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('chatToken');
    const storedUsername = localStorage.getItem('chatUsername');
    const lastRoomId = localStorage.getItem('lastRoomId'); // 마지막 선택 방 기억
    
    if (!token) {
      router.push('/');
      return;
    }
    
    if (storedUsername) {
      setUsername(storedUsername);
    }
    
    // Connect to WebSocket server
    let socket;
    let reconnectAttempt = 0;
    const maxReconnectAttempts = 3;
    
    const connectWebSocket = () => {
      socket = new WebSocket('ws://localhost:4000');
      socketRef.current = socket;
      
      socket.onopen = () => {
        console.log('WebSocket connection established');
        reconnectAttempt = 0; // 연결 성공 시 재시도 카운터 초기화
        
        // 메시지 전송 전 약간의 지연 시간 추가
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'AUTH',
              token: token
            }));
          }
        }, 100);
      };
      
      // 메시지 핸들러 함수 분리
      socket.onmessage = handleWebSocketMessage;
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error. Please try again later.');
      };
      
      socket.onclose = (event) => {
        console.log(`WebSocket connection closed: code=${event.code}, reason=${event.reason}`);
        setConnected(false);
        
        // 연결이 비정상적으로 닫힌 경우 재연결 시도
        if (!event.wasClean && reconnectAttempt < maxReconnectAttempts) {
          reconnectAttempt++;
          console.log(`Attempting to reconnect (${reconnectAttempt}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, 1000 * reconnectAttempt); // 지수 백오프 방식
        }
      };
    };
    
    connectWebSocket();
    
    // 사용 가능한 채팅방 목록 가져오기
    const fetchRooms = async () => {
      try {
        const token = localStorage.getItem('chatToken');
        const response = await fetch('http://localhost:4000/api/rooms', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const rooms = await response.json();
          setAvailableRooms(rooms);
          
          // 마지막 선택 방이 있으면 해당 방을 선택, 없으면 첫 번째 방 선택
          if (rooms.length > 0 && !selectedRoom) {
            if (lastRoomId) {
              const lastRoom = rooms.find(room => (room.roomId === lastRoomId || room.id === lastRoomId));
              if (lastRoom) {
                console.log('Selecting last used room:', lastRoom);
                subscribeToRoom(lastRoom);
                return;
              }
            }
            console.log('Auto-selecting first room:', rooms[0]);
            subscribeToRoom(rooms[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching rooms:', error);
      }
    };
    
    fetchRooms();
    
    return () => {
      // 정리 함수에서 연결 상태 확인 후 정상적으로 종료
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        // 정상 연결 종료 확인을 위한 플래그 설정
        socketRef.current.onclose = null; // 연결 종료 이벤트 핸들러 제거
        
        socketRef.current.send(JSON.stringify({
          type: 'DISCONNECT'
        }));
        
        socketRef.current.close(1000, "페이지 이동"); // 정상 종료 코드 사용
      }
    };
  }, [router]);
  
  // Auto-scroll to the bottom of the message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // 선택된 방이 변경될 때마다 로그 출력 및 ref 업데이트
  useEffect(() => {
    console.log('Selected room changed to:', selectedRoom);
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);
  
  const subscribeToRoom = (room: Room) => {
    console.log('🔄 Subscribing to room:', room);
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError('Connection not available');
      return;
    }
    
    // 순서 변경: 먼저 선택된 방 설정 후 메시지 초기화
    setSelectedRoom(room);
    selectedRoomRef.current = room; // ref 즉시 업데이트
    setMessages([]);
    console.log('✅ Selected room set to:', room);
    
    // Subscribe to the selected room
    const roomId = room.roomId || room.id;
    
    // 선택한 방 ID를 localStorage에 저장
    localStorage.setItem('lastRoomId', roomId);
    
    socketRef.current.send(JSON.stringify({
      type: 'JOIN',
      roomId: roomId
    }));
    console.log('🔄 JOIN message sent for room:', roomId);
  };
  
  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Sending message in room:', selectedRoom);
    
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError('Connection not available');
      return;
    }
    
    if (!selectedRoom) {
      setError('Please select a room first');
      return;
    }
    
    if (!messageText.trim()) return;
    
    // Send message to the selected room
    socketRef.current.send(JSON.stringify({
      type: 'MESSAGE',
      roomId: selectedRoom.roomId || selectedRoom.id,
      content: messageText,
      sender: localStorage.getItem('chatUsername')
    }));
    
    // 로컬에서 메시지 추가 - 에코가 작동하지 않을 경우를 대비한 예비 조치
    // 서버에서 에코가 제대로 동작하지 않는 동안 임시로 활성화
    const localMessage = {
      sender: localStorage.getItem('chatUsername'),
      content: messageText,
      type: 'NEW_MESSAGE',
      timestamp: new Date().toISOString(),
      roomId: selectedRoom?.roomId || selectedRoom?.id || ''
    };
    setMessages(prev => {
      // 중복 방지를 위한 검사
      const duplicate = prev.some(msg => 
        msg.content === localMessage.content && 
        msg.sender === localMessage.sender &&
        Math.abs(new Date(msg.timestamp).getTime() - new Date(localMessage.timestamp).getTime()) < 1000
      );
      return duplicate ? prev : [...prev, localMessage];
    });
    
    setMessageText('');
  };
  
  const createNewRoom = async () => {
    if (!newRoomName.trim()) {
      setError('Please enter a room name');
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
      
      const roomData = await response.json();
      setAvailableRooms(prev => [...prev, roomData]);
      setNewRoomName('');
      setNewRoomDescription('');
      
      // Auto-select the newly created room
      subscribeToRoom(roomData);
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Failed to create room. Please try again.');
    }
  };
  
  const handleLogout = () => {
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUsername');
    router.push('/');
  };

  // WebSocket 인증
  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && localStorage.getItem('chatToken')) {
      socketRef.current.send(JSON.stringify({ type: 'AUTH', token: localStorage.getItem('chatToken') }));
    }
  }, []);

  // WebSocket 메시지 핸들러 함수
  function handleWebSocketMessage(event) {
    const data = JSON.parse(event.data);
    console.log('💬 WebSocket message received:', data);
    
    // 현재 선택된 방 상태 가져오기 (함수가 호출되는 시점의 최신 값)
    const currentRoom = selectedRoomRef.current;
    
    switch (data.type) {
      case 'AUTH_SUCCESS':
        setConnected(true);
        setError('');
        break;
      
      case 'JOIN_SUCCESS':
        console.log('✅ Successfully joined room:', data.roomId);
        console.log('Current selectedRoom state:', selectedRoom);
        console.log('Current selectedRoomRef value:', selectedRoomRef.current);
        
        if (selectedRoom === null || (selectedRoom.roomId !== data.roomId && selectedRoom.id !== data.roomId)) {
          // 서버로부터 방 정보 수신 시 selectedRoom 업데이트
          const matchedRoom = availableRooms.find(room => room.roomId === data.roomId || room.id === data.roomId);
          if (matchedRoom) {
            console.log('Updating selected room to:', matchedRoom);
            setSelectedRoom(matchedRoom);
            selectedRoomRef.current = matchedRoom;
          } else {
            // 방 목록에 없는 경우 임시 객체 생성
            console.log('Creating temporary room object:', data.roomId);
            const tempRoom = {
              roomId: data.roomId,
              name: data.roomName || `Room ${data.roomId}`
            };
            setSelectedRoom(tempRoom);
            console.log('Selected room updated to temporary object:', tempRoom);
            // 방 목록에 임시 방 추가하여 일관성 유지
            setAvailableRooms(prev => {
              if (prev.some(r => r.roomId === data.roomId)) return prev;
              return [...prev, tempRoom];
            });
          }
        }
        break;
      
      case 'NEW_MESSAGE':
        console.log('📨 Processing NEW_MESSAGE:', data);
        const targetRoomId = data.roomId;
        console.log('Current room:', currentRoom, 'Message room ID:', targetRoomId);
        
        if (currentRoom && (currentRoom.roomId === targetRoomId || currentRoom.id === targetRoomId)) {
          console.log('✅ Message is for current room, updating UI');
          if (data._id) {
            console.log('Message has ID, checking for duplicates');
            setMessages(prev => {
              const exists = prev.some(msg => msg._id === data._id);
              console.log('Message exists?', exists);
              if (exists) return prev;
              return [...prev, data];
            });
          } else {
            console.log('Message has no ID, adding directly');
            setMessages(prev => [...prev, data]);
          }
        } else {
          console.log('❌ Message is for different room, ignoring');
        }
        break;
      
      case 'MESSAGE_HISTORY':
        setMessages(data.messages);
        break;
      
      case 'ERROR':
        setError(data.message);
        break;
      
      default:
        console.log('Unhandled message type:', data.type);
    }
  }

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
        <div className="w-64 bg-white p-4 border-r overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Chat Rooms</h2>
            <ul className="space-y-1">
              {availableRooms.map(room => (
                <li key={room.roomId || room.id || Math.random().toString()}>
                  <button
                    onClick={() => subscribeToRoom(room)}
                    className={`w-full text-left px-3 py-2 rounded ${
                      selectedRoom && (selectedRoom.roomId === room.roomId || selectedRoom.id === room.id) 
                        ? 'bg-indigo-100 text-indigo-800' 
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {room.name || `Room ${room.roomId || room.id}`}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h2 className="text-lg font-semibold mb-2">Create New Room</h2>
            <div className="space-y-2">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                placeholder="Room name"
              />
              <input
                type="text"
                value={newRoomDescription}
                onChange={(e) => setNewRoomDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                placeholder="Room description"
              />
              <button
                onClick={createNewRoom}
                className="w-full px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
        
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {!selectedRoom ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a room to start chatting
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 p-4 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`max-w-xs md:max-w-md p-3 rounded-lg ${
                          msg.sender === username 
                            ? 'ml-auto bg-indigo-100 text-indigo-900' 
                            : 'bg-white border'
                        }`}
                      >
                        <div className="font-semibold text-sm">
                          {msg.sender === username ? 'You' : msg.sender}
                        </div>
                        <div className="mt-1">{msg.content}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
              
              {/* Message Input */}
              <div className="p-4 border-t">
                <form onSubmit={sendMessage} className="flex space-x-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Type a message..."
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
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