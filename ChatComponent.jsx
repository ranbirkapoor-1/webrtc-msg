import React, { useState, useRef, useEffect } from 'react';
import './ChatComponent.css';

const ChatComponent = () => {
  const [messages, setMessages] = useState([
    { id: 1, text: "Hey there! How are you doing?", isSent: false, timestamp: "10:30" },
    { id: 2, text: "I'm doing great, thanks for asking! How about you?", isSent: true, timestamp: "10:32" },
    { id: 3, text: "Pretty good! Just working on some projects. What have you been up to lately?", isSent: false, timestamp: "10:35" },
    { id: 4, text: "Same here! I've been learning some new web development techniques. It's been really exciting!", isSent: true, timestamp: "10:38" },
    { id: 5, text: "That sounds awesome! Which technologies are you focusing on?", isSent: false, timestamp: "10:40" }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [messageId, setMessageId] = useState(messages.length);
  const messagesEndRef = useRef(null);

  // Scroll to bottom whenever messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle sending a message
  const handleSendMessage = () => {
    if (inputValue.trim()) {
      const newMessageId = messageId + 1;
      const newMessage = {
        id: newMessageId,
        text: inputValue.trim(),
        isSent: true,
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      };

      setMessages(prev => [...prev, newMessage]);
      setInputValue('');
      setMessageId(newMessageId);

      // Simulate received message (for demo purposes)
      setTimeout(() => {
        const responseId = newMessageId + 1;
        const responseMessage = {
          id: responseId,
          text: "Thanks for your message! This is an automated response.",
          isSent: false,
          timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };

        setMessages(prev => [...prev, responseMessage]);
        setMessageId(responseId);
      }, 1000);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        Chat Demo
      </div>
      
      <div className="chat-messages">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.isSent ? 'sent' : 'received'}`}>
            <div className="message-bubble">
              {message.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input">
        <input
          type="text"
          className="message-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
        />
        <button className="send-button" onClick={handleSendMessage}>
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatComponent;