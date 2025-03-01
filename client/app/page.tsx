"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await fetch('http://localhost:4000/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      
      // Store token in localStorage
      localStorage.setItem('chatToken', data.token);
      localStorage.setItem('chatUsername', data.username);
      
      // Redirect to chat page
      router.push('/chat');
    } catch (err) {
      setError('Invalid credentials. Please try again.');
      console.error('Login error:', err);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-lg border border-gray-200">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Chat Login</h1>
          <p className="mt-2 text-gray-700 font-medium">Sign in to access the chat</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-800 bg-red-100 rounded border border-red-300">
            {error}
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div>
            <label htmlFor="username" className="block text-sm font-bold text-gray-800">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 mt-1 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
              placeholder="Username"
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-bold text-gray-800">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 mt-1 text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
              placeholder="Password"
            />
          </div>
          
          <div>
            <button
              type="submit"
              className="w-full px-4 py-3 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors duration-200"
            >
              Sign in
            </button>
          </div>
        </form>
        
        <div className="mt-6 text-center">
          <p className="font-semibold text-gray-800">Try these demo accounts:</p>
          <p className="mt-2 text-gray-900 font-medium">username: <span className="text-indigo-700">alice</span>, password: <span className="text-indigo-700">1234</span></p>
          <p className="text-gray-900 font-medium">username: <span className="text-indigo-700">bob</span>, password: <span className="text-indigo-700">1234</span></p>
        </div>
      </div>
    </main>
  );
}
