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

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('chatToken');
    const storedUsername = localStorage.getItem('chatUsername');
    
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
      
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received: ', data);
        
        switch (data.type) {
          case 'AUTH_SUCCESS':
            setConnected(true);
            setError('');
            break;
          
          case 'NEW_MESSAGE':
            if (data.roomId === selectedRoom?.roomId || data.roomId === selectedRoom?.id) {
              setMessages(prev => [...prev, data]);
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
      };
      
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
  
  const subscribeToRoom = (room: Room) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError('Connection not available');
      return;
    }
    
    // Clear previous messages when changing rooms
    setMessages([]);
    setSelectedRoom(room);
    
    // Subscribe to the selected room
    const roomId = room.roomId || room.id;
    socketRef.current.send(JSON.stringify({
      type: 'JOIN',
      roomId: roomId
    }));
  };
  
  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
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
      content: messageText
    }));
    
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