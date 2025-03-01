"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }
    
    try {
      const response = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.message || 'Login failed');
        return;
      }
      
      // 로그인 성공 시 토큰 저장
      localStorage.setItem('chatToken', data.token);
      localStorage.setItem('chatUsername', username);
      
      // 채팅 페이지로 이동
      router.push('/chat');
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Login error:', err);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center mb-6">Real-time Chat Login</h1>
        
        {error && (
          <div className="mb-4 p-3 text-red-700 bg-red-100 rounded-md border border-red-200">
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block mb-2 font-medium text-gray-700">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500"
              placeholder="Username"
            />
          </div>
          
          <div>
            <label className="block mb-2 font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-500"
              placeholder="Password"
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium shadow-md transition-colors duration-200"
          >
            Login
          </button>
          
          <p className="text-center mt-6 text-gray-600">
            Don't have an account? 
            <Link href="/register" className="text-indigo-600 hover:underline ml-1 font-medium">
              Register
            </Link>
          </p>
        </form>

        <div className="mt-8 p-4 bg-gray-50 rounded-md border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Demo Accounts:</h3>
          <p className="text-xs text-gray-600">Username: <code>alice</code>, Password: <code>1234</code></p>
          <p className="text-xs text-gray-600">Username: <code>bob</code>, Password: <code>1234</code></p>
        </div>
      </div>
    </div>
  );
} 