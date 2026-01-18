import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../styles/Chatbot.css';

function Chatbot({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadHistory = async () => {
    try {
      const response = await axios.get('/api/chat/history?limit=20', {
        withCredentials: true,
        timeout: 5000
      });
      
      if (response.data && response.data.messages && response.data.messages.length > 0) {
        setMessages(response.data.messages);
      } else {
        setMessages([{
          role: 'assistant',
          content: "Hi! I'm your productivity assistant. 👋\n\nI can help you:\n• Break down tasks into steps\n• Prioritize your work\n• Build better habits\n• Stay motivated\n\nWhat would you like help with?"
        }]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm your productivity assistant. How can I help you today?"
      }]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Add user message immediately
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);

    try {
      console.log('📤 Sending to backend:', userMessage);
      
      const response = await axios.post('/api/chat/message', {
        message: userMessage
      }, { 
        withCredentials: true,
        timeout: 30000
      });

      console.log('📥 Backend response:', response.data);

      // Check response format
      if (response.data && response.data.response) {
        const aiResponse = response.data.response;
        console.log('✅ AI Response received:', aiResponse);
        
        setMessages([...newMessages, {
          role: 'assistant',
          content: aiResponse
        }]);
      } else {
        console.error('❌ Invalid response format:', response.data);
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('❌ Chat error:', error);
      
      // Show error message instead of fallback
      setMessages([...newMessages, {
        role: 'assistant',
        content: "I'm having trouble connecting right now. The backend received your message but there was an error processing the response. Please check the backend terminal for details."
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatbot-panel-warm">
      <div className="chatbot-header-warm">
        <div className="header-left-chat">
          <span className="chat-bot-icon">🤖</span>
          <div>
            <h3>AI Assistant</h3>
            <span className="chat-status">Powered by Ollama</span>
          </div>
        </div>
        <button className="btn-close-chat" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="chatbot-messages-warm">
        {messages.length === 0 && (
          <div className="chat-welcome-warm">
            <div className="welcome-icon">💬</div>
            <p>Hi! I'm your productivity assistant.</p>
            <span>Ask me anything!</span>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message-warm ${msg.role}`}>
            <div className="message-icon-warm">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-content-warm">
              {msg.content.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < msg.content.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message-warm assistant">
            <div className="message-icon-warm">🤖</div>
            <div className="message-content-warm typing-warm">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chatbot-input-warm">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
          className="chat-input-field"
        />
        <button 
          type="submit" 
          disabled={loading || !input.trim()}
          className="chat-send-btn"
        >
          {loading ? '⏳' : '➤'}
        </button>
      </form>
    </div>
  );
}

export default Chatbot;