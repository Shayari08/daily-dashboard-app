import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../styles/Chatbot.css';

const WELCOME_MESSAGE = `Hey, I'm glad you're here. 🌿

I'm not just a task manager — think of me as someone sitting with you while you work. You can vent, celebrate, think out loud, or ask for help when you're stuck.

What's going on today?`;

function formatInlineText(text) {
  if (!text) return text;
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={index} style={{ opacity: 0.88 }}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          style={{
            background: 'var(--bg-surface-hover)',
            padding: '0.15rem 0.35rem',
            borderRadius: '4px',
            fontSize: '0.85em',
            border: '1px solid var(--border-subtle)'
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function Chatbot({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesContainerRef = useRef(null);

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
        setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }]);
    }
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const handleNewChat = () => {
    setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }]);
  };

  const handleDeleteChat = async () => {
    if (!window.confirm('Delete all chat history? This cannot be undone.')) return;

    try {
      await axios.delete('/api/chat/history', { withCredentials: true });
      setMessages([{ role: 'assistant', content: WELCOME_MESSAGE }]);
    } catch (error) {
      console.error('Failed to delete chat history:', error);
    }
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
        timeout: 180000 // local AI (Ollama) can take a while on first load
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
        content: error.response
          ? `Something went wrong: ${error.response.data?.details || error.response.data?.error || error.message}`
          : "I can't reach the backend right now. Make sure the backend server is running (start-dashboard.bat)."
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatbot-panel-warm">
      <div className="chatbot-header-warm">
        <div className="header-left-chat">
          <span className="chat-bot-icon">🌿</span>
          <div>
            <h3>Your Companion</h3>
            <span className="chat-status">Here with you</span>
          </div>
        </div>
        <div className="chat-controls">
          <button className="btn-chat-control" onClick={handleNewChat} title="New Chat">
            ➕
          </button>
          <button className="btn-chat-control" onClick={handleDeleteChat} title="Delete History">
            🗑️
          </button>
          <button className="btn-close-chat" onClick={onClose} title="Close Assistant" aria-label="Close Assistant">
            ✕
          </button>
        </div>
      </div>

      <div className="chatbot-messages-warm" ref={messagesContainerRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-warm ${msg.role}`}>
            <div className="message-icon-warm">
              {msg.role === 'user' ? '👤' : '🌿'}
            </div>
            <div className="message-bubble-warm message-content-warm">
              {msg.content.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {formatInlineText(line)}
                  {i < msg.content.split('\n').length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message-warm assistant">
            <div className="message-icon-warm">🌿</div>
            <div className="message-bubble-warm message-content-warm">
              <div className="typing-warm">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="chatbot-input-form-warm chatbot-input-warm">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
          className="chat-input-warm chat-input-field"
        />
        <button 
          type="submit" 
          disabled={loading || !input.trim()}
          className="btn-send-chat chat-send-btn"
        >
          {loading ? '⏳' : '➤'}
        </button>
      </form>
    </div>
  );
}

export default Chatbot;