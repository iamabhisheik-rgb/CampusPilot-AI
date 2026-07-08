import React, { useState, useEffect, useRef } from 'react';
import { 
  GraduationCap, 
  LayoutDashboard, 
  MessageSquare, 
  UploadCloud, 
  BookMarked, 
  BrainCircuit, 
  Sun, 
  Moon, 
  Menu, 
  X, 
  Send, 
  Plus, 
  Trash2, 
  FileText, 
  Loader2, 
  Copy, 
  Check, 
  CheckCircle2, 
  XCircle, 
  Award,
  AlertTriangle
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = 'http://localhost:8000/api';
const WS_BASE = 'ws://localhost:8000/ws';

export default function App() {
  // Navigation & Theme
  const [currentView, setCurrentView] = useState(() => localStorage.getItem('cp_view') || 'home');
  const [theme, setTheme] = useState(() => localStorage.getItem('cp_theme') || 'dark');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Data
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState({ total_documents: 0, total_chats: 0, notes_generated: 0, quizzes_generated: 0 });
  const [activities, setActivities] = useState([]);

  // Chat State
  const [conversations, setConversations] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatGroundingDocId, setChatGroundingDocId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Notes State
  const [notesDocId, setNotesDocId] = useState('');
  const [generatedNotes, setGeneratedNotes] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesCopied, setNotesCopied] = useState(false);

  // Quiz State
  const [quizDocId, setQuizDocId] = useState('');
  const [quizNumQuestions, setQuizNumQuestions] = useState(5);
  const [generatedQuiz, setGeneratedQuiz] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  // Sync Theme on Load
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cp_theme', theme);
  }, [theme]);

  // Sync View to local storage
  useEffect(() => {
    localStorage.setItem('cp_view', currentView);
  }, [currentView]);

  // Load Initial Data (Docs, Stats, Activities, Chats)
  useEffect(() => {
    loadDocuments();
    loadStats();
    loadActivities();
    loadConversations();
  }, []);

  // Auto Scroll Chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // WebSocket connection management when activeSessionId changes
  useEffect(() => {
    if (activeSessionId) {
      connectWebSocket(activeSessionId);
      loadHistory(activeSessionId);
    } else {
      disconnectWebSocket();
      setMessages([]);
    }
    return () => disconnectWebSocket();
  }, [activeSessionId]);

  // --- API CALLS ---

  const loadDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error('Failed to load documents', err);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats', err);
    }
  };

  const loadActivities = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/activities`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (err) {
      console.error('Failed to load activities', err);
    }
  };

  const loadConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        // Set first conversation active if none is active
        if (data.length > 0 && !activeSessionId) {
          setActiveSessionId(data[0].session_id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const loadHistory = async (sessionId) => {
    try {
      const res = await fetch(`${API_BASE}/history/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to load chat history', err);
    }
  };

  const createNewConversation = async () => {
    const newSessionId = crypto.randomUUID();
    // Optimistically select it, route to chat, add item to sidebar
    setActiveSessionId(newSessionId);
    setCurrentView('chat');
    setConversations(prev => [
      { session_id: newSessionId, title: 'New Chat', created_at: new Date().toISOString() },
      ...prev
    ]);
  };

  const deleteConversation = async (sessionId, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/conversations/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.session_id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId('');
        }
        loadStats();
        loadActivities();
      }
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  // --- WEBSOCKET CHAT ---

  const connectWebSocket = (sessionId) => {
    disconnectWebSocket();

    const wsUrl = `${WS_BASE}/chat/${sessionId}`;
    loggerLog(`Connecting to WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      loggerLog('WebSocket connected successfully');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'start') {
        setIsGenerating(true);
        setMessages(prev => [...prev, { sender: 'bot', content: '', id: Date.now() }]);
      } 
      else if (data.type === 'chunk') {
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.sender === 'bot') {
            lastMsg.content += data.content;
          }
          return updated;
        });
      } 
      else if (data.type === 'done') {
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg && lastMsg.sender === 'bot') {
            lastMsg.content = data.reply;
            if (data.timestamp) lastMsg.timestamp = data.timestamp;
          }
          return updated;
        });
        setIsGenerating(false);
        // Refresh sidebar, stats, and dashboard activities
        loadConversations();
        loadStats();
        loadActivities();
      }
      else if (data.type === 'error') {
        setIsGenerating(false);
        setMessages(prev => [...prev, { sender: 'bot', content: `⚠️ Error: ${data.message}`, id: Date.now() }]);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error', err);
      setIsGenerating(false);
    };

    ws.onclose = () => {
      loggerLog('WebSocket connection closed');
      setIsGenerating(false);
    };

    wsRef.current = ws;
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const handleSendMessage = () => {
    const text = chatInput.trim();
    if (!text || isGenerating || !activeSessionId) return;

    // 1. Optimistically add user message to layout
    const userMsg = { sender: 'user', content: text, timestamp: new Date().toISOString(), id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');

    // 2. Transmit message via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        message: text,
        document_id: chatGroundingDocId ? parseInt(chatGroundingDocId) : null
      }));
    } else {
      // Fallback in case WS is disconnected, attempt to use standard POST endpoint
      sendHTTPFallback(text);
    }
  };

  const sendHTTPFallback = async (text) => {
    setIsGenerating(true);
    // Add an empty bot message to fill typing container
    setMessages(prev => [...prev, { sender: 'bot', content: '...', id: Date.now() }]);
    
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: activeSessionId,
          document_id: chatGroundingDocId ? parseInt(chatGroundingDocId) : null
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg) {
            lastMsg.content = data.reply;
            lastMsg.timestamp = data.timestamp;
          }
          return updated;
        });
        loadConversations();
        loadStats();
        loadActivities();
      } else {
        throw new Error('HTTP request failed');
      }
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { sender: 'bot', content: `⚠️ Failed to get response. Connection error: ${err.message}`, id: Date.now() }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const loggerLog = (msg) => {
    console.log(`[CampusPilot] ${msg}`);
  };

  // --- UPLOAD HANDLERS ---

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setUploadError('');

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      uploadFile(file);
    }
  };

  const handleFileInput = (e) => {
    setUploadError('');
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(true);

    try {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        loadDocuments();
        loadStats();
        loadActivities();
      } else {
        const errorData = await res.json();
        setUploadError(errorData.detail || 'Failed to upload PDF.');
      }
    } catch (err) {
      setUploadError('Error connecting to backend server.');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteDocument = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this study material? This will remove all grounding text.")) return;
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        loadDocuments();
        loadStats();
        loadActivities();
        // Clear grounding selector if active doc deleted
        if (parseInt(chatGroundingDocId) === docId) setChatGroundingDocId('');
        if (parseInt(notesDocId) === docId) setGeneratedNotes('');
        if (parseInt(quizDocId) === docId) setGeneratedQuiz([]);
      }
    } catch (err) {
      console.error('Failed to delete document', err);
    }
  };

  // --- ACADEMIC GENERATORS ---

  const handleGenerateNotes = async () => {
    if (!notesDocId) return;
    setNotesLoading(true);
    setGeneratedNotes('');

    try {
      const res = await fetch(`${API_BASE}/notes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: parseInt(notesDocId) })
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedNotes(data.notes);
        loadStats();
        loadActivities();
      } else {
        alert('Failed to generate notes. Please check document contents.');
      }
    } catch (err) {
      alert('Error connecting to backend.');
    } finally {
      setNotesLoading(false);
    }
  };

  const handleCopyNotes = () => {
    navigator.clipboard.writeText(generatedNotes);
    setNotesCopied(true);
    setTimeout(() => setNotesCopied(false), 2000);
  };

  const handleGenerateQuiz = async () => {
    if (!quizDocId) return;
    setQuizLoading(true);
    setGeneratedQuiz([]);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);

    try {
      const res = await fetch(`${API_BASE}/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: parseInt(quizDocId),
          num_questions: parseInt(quizNumQuestions)
        })
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedQuiz(data.quiz);
        loadStats();
        loadActivities();
      } else {
        alert('Failed to generate quiz. Verify document contents.');
      }
    } catch (err) {
      alert('Error connecting to server.');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSelectQuizAnswer = (qIndex, answerVal) => {
    if (quizSubmitted) return;
    setQuizAnswers(prev => ({ ...prev, [qIndex]: answerVal }));
  };

  const handleSubmitQuiz = () => {
    let score = 0;
    generatedQuiz.forEach((q, idx) => {
      if (quizAnswers[idx] === q.answer) {
        score++;
      }
    });
    setQuizScore(score);
    setQuizSubmitted(true);
  };

  // --- SUB-RENDERERS ---

  const renderHome = () => (
    <div className="view-body home-view">
      <div className="home-illustration-container">
        <GraduationCap size={150} className="home-illustration" />
      </div>
      <div className="home-hero-text">
        <h1>
CampusPilot AI
</h1>

<h2 className="text-gradient">
Your AI Academic Companion
</h2>

<p className="home-description">
  Transform any PDF into an intelligent study partner.

  <br /><br />

  ✅ Chat with your uploaded notes

  <br />

  ✅ Generate AI-powered study notes

  <br />

  ✅ Practice smart quizzes

  <br />

  ✅ Create personalized study plans

  <br />

  ✅ Prepare faster for exams
</p>
      </div>
      <div className="home-action-buttons">
        <button className="btn-primary" onClick={() => setCurrentView('upload')}>
          <UploadCloud size={20} />
          📄 Upload Study Material
        </button>
        <button className="btn-secondary" onClick={() => {
          if (!activeSessionId && conversations.length > 0) {
            setActiveSessionId(conversations[0].session_id);
          } else if (!activeSessionId) {
            createNewConversation();
          }
          setCurrentView('chat');
        }}>
          <MessageSquare size={20} />
          💬 Start AI Chat
        </button>
      </div>
    </div>
  );
  <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: "20px",
    marginTop: "40px"
  }}
>
<div style={{ marginTop: "50px" }}>
  <h2>Why Choose CampusPilot AI?</h2>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
      gap: "20px",
      marginTop: "20px",
    }}
  >
    <div className="stat-card">
      <h3>📄 AI PDF Learning</h3>
      <p>Upload lecture notes, textbooks and study material.</p>
    </div>

    <div className="stat-card">
      <h3>💬 Context Aware Chat</h3>
      <p>Ask questions directly from uploaded documents.</p>
    </div>

    <div className="stat-card">
      <h3>📝 Smart Notes</h3>
      <p>Generate structured study notes instantly.</p>
    </div>

    <div className="stat-card">
      <h3>🧠 Quiz Generator</h3>
      <p>Create MCQs automatically for revision.</p>
    </div>
  </div>
</div>
  <div className="stat-card">
    <h3>📄 Upload PDF</h3>
    <p>Upload textbooks, notes and lecture PDFs.</p>
  </div>

  <div className="stat-card">
    <h3>💬 AI Chat</h3>
    <p>Ask questions from your uploaded documents.</p>
  </div>

  <div className="stat-card">
    <h3>📝 Smart Notes</h3>
    <p>Generate clean study notes instantly.</p>
  </div>

  <div className="stat-card">
    <h3>🧠 Quiz Generator</h3>
    <p>Create MCQs automatically for revision.</p>
  </div>

</div>

  const renderDashboard = () => (
    <div className="view-body" style={{animation: 'fadeIn 0.4s ease-out'}}>
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-icon"><FileText size={24} /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.total_documents}</span>
            <span className="stat-label">Documents</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><MessageSquare size={24} /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.total_chats}</span>
            <span className="stat-label">Total Chats</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><BookMarked size={24} /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.notes_generated}</span>
            <span className="stat-label">Notes Generated</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><BrainCircuit size={24} /></div>
          <div className="stat-info">
            <span className="stat-value">{stats.quizzes_generated}</span>
            <span className="stat-label">Quizzes Taken</span>
          </div>
        </div>
      </div>

      <div className="dashboard-feed-grid">
        <div className="feed-section">
          <h2 className="feed-title"><FileText size={20} /> Recent Documents</h2>
          <ul className="feed-list">
            {documents.length === 0 ? (
              <div className="empty-state">
                <FileText className="empty-state-icon" size={40} />
                <p>No study materials uploaded yet.</p>
              </div>
            ) : (
              documents.map(doc => (
                <li className="feed-item" key={doc.id}>
                  <div className="feed-item-icon"><FileText size={18} color="var(--primary)" /></div>
                  <div className="feed-details">
                    <span className="feed-text" style={{fontWeight: 500}}>{doc.filename}</span>
                    <span className="feed-time">Uploaded on {new Date(doc.upload_date).toLocaleDateString()}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="feed-section">
          <h2 className="feed-title"><LayoutDashboard size={20} /> Recent Activity</h2>
          <ul className="feed-list">
            {activities.length === 0 ? (
              <div className="empty-state">
                <LayoutDashboard className="empty-state-icon" size={40} />
                <p>No activities recorded.</p>
              </div>
            ) : (
              activities.map(act => (
                <li className="feed-item" key={act.id}>
                  <div className="feed-item-icon">
                    {act.activity_type === 'upload' && <UploadCloud size={16} color="var(--primary)" />}
                    {act.activity_type === 'chat' && <MessageSquare size={16} color="var(--warning)" />}
                    {act.activity_type === 'notes' && <BookMarked size={16} color="var(--success)" />}
                    {act.activity_type === 'quiz' && <BrainCircuit size={16} color="var(--danger)" />}
                    {act.activity_type === 'delete' && <Trash2 size={16} color="var(--text-muted)" />}
                  </div>
                  <div className="feed-details">
                    <span className="feed-text">{act.detail}</span>
                    <span className="feed-time">{new Date(act.timestamp).toLocaleTimeString()} - {new Date(act.timestamp).toLocaleDateString()}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );

  const renderChat = () => (
    <div className="chat-page-container">
      {/* Sessions Sub-Sidebar */}
      <div className="chat-history-sidebar">
        <button className="new-chat-btn" onClick={createNewConversation}>
          <Plus size={18} />
          New Chat
        </button>
        <div className="chat-list">
          {conversations.length === 0 ? (
            <span style={{textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem'}}>
              No previous chats
            </span>
          ) : (
            conversations.map(conv => (
              <div 
                className={`chat-list-item ${activeSessionId === conv.session_id ? 'active' : ''}`}
                key={conv.session_id}
                onClick={() => setActiveSessionId(conv.session_id)}
              >
                <span className="chat-title-text">{conv.title}</span>
                <button className="delete-chat-btn" onClick={(e) => deleteConversation(conv.session_id, e)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="chat-area">
        {/* Document grounding header */}
        <div className="chat-grounding-selector">
          <FileText size={18} color="var(--primary)" />
          <span style={{fontSize: '0.9rem', fontWeight: 500}}>Context:</span>
          <select 
            className="grounding-dropdown"
            value={chatGroundingDocId}
            onChange={(e) => setChatGroundingDocId(e.target.value)}
          >
            <option value="">No document context (General QA)</option>
            {documents.map(doc => (
              <option value={doc.id} key={doc.id}>{doc.filename}</option>
            ))}
          </select>
          {chatGroundingDocId && (
            <span style={{fontSize: '0.75rem', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem'}}>
              <Check size={12} /> grounded active
            </span>
          )}
        </div>

        {/* Message bubbles */}
        <div className="messages-list">
          {messages.length === 0 ? (
            <div className="empty-state" style={{margin: 'auto'}}>
              <MessageSquare className="empty-state-icon" size={50} />
              <h3>Start a conversation</h3>
              <p>Type a message or select a PDF study material to ground the responses.</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div className={`message-bubble ${msg.sender === 'user' ? 'user' : 'bot'}`} key={msg.id || index}>
                <div className="message-content">
                  {msg.sender === 'user' ? (
                    msg.content
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
                {msg.timestamp && (
                  <span className="message-timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                )}
              </div>
            ))
          )}

          {/* Real-time typing dot indicator */}
          {isGenerating && messages[messages.length - 1]?.content === '' && (
            <div className="message-bubble bot">
              <div className="message-content" style={{padding: '0.75rem 1.25rem'}}>
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-input-bar">
          <input 
            type="text" 
            className="chat-text-input"
            placeholder={activeSessionId ? "Ask CampusPilot AI..." : "Create a new conversation to start..."}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            disabled={!activeSessionId || isGenerating}
          />
          <button 
            className="chat-send-btn" 
            onClick={handleSendMessage}
            disabled={!chatInput.trim() || isGenerating || !activeSessionId}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderUpload = () => (
    <div className="view-body upload-container">
      <div 
        className={`drag-drop-zone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload-input').click()}
      >
        <input 
          type="file" 
          id="file-upload-input" 
          style={{display: 'none'}} 
          accept=".pdf"
          onChange={handleFileInput}
        />
        <div className="cloud-icon-wrapper">
          {isUploading ? <Loader2 size={32} className="animate-spin" /> : <UploadCloud size={32} />}
        </div>
        <div className="drag-drop-text">
          <h3>Drag & Drop your study material (PDF) here</h3>
          <span className="drag-drop-subtext">or click to browse from your device</span>
        </div>
        {uploadError && (
          <div style={{color: 'var(--danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem'}}>
            <AlertTriangle size={14} /> {uploadError}
          </div>
        )}
      </div>

      <div className="file-list-section">
        <h2 className="file-list-title"><FileText size={20} /> Uploaded Materials</h2>
        {documents.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" size={40} />
            <p>No documents uploaded yet.</p>
          </div>
        ) : (
          <table className="documents-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>File Size</th>
                <th>Upload Date</th>
                <th style={{textAlign: 'right'}}>Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td className="doc-name-cell">
                    <FileText size={18} color="var(--primary)" />
                    {doc.filename}
                  </td>
                  <td>{roundSize(doc.file_size)}</td>
                  <td>{new Date(doc.upload_date).toLocaleDateString()}</td>
                  <td style={{textAlign: 'right'}}>
                    <button className="delete-doc-btn" onClick={() => deleteDocument(doc.id)} style={{marginLeft: 'auto'}}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const roundSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const renderNotes = () => (
    <div className="view-body" style={{animation: 'fadeIn 0.4s ease-out'}}>
      <div className="academic-controls">
        <div className="control-group">
          <span className="control-label">Select Document</span>
          <select 
            className="control-select"
            value={notesDocId}
            onChange={(e) => setNotesDocId(e.target.value)}
          >
            <option value="">-- Choose Study Material --</option>
            {documents.map(doc => (
              <option value={doc.id} key={doc.id}>{doc.filename}</option>
            ))}
          </select>
        </div>
        <button 
          className="btn-primary" 
          onClick={handleGenerateNotes}
          disabled={!notesDocId || notesLoading}
          style={{height: '42px'}}
        >
          {notesLoading ? <Loader2 size={18} className="animate-spin" /> : <BookMarked size={18} />}
          Generate Notes
        </button>
      </div>

      <div className="notes-output-container">
        {notesLoading ? (
          <div className="empty-state" style={{margin: 'auto'}}>
            <Loader2 size={40} className="animate-spin" color="var(--primary)" />
            <p>CampusPilot AI is studying the document and drafting notes...</p>
          </div>
        ) : generatedNotes ? (
          <div style={{position: 'relative'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem'}}>
              <h2 style={{fontSize: '1.25rem', fontFamily: 'var(--font-heading)'}}>Generated Summary Notes</h2>
              <button className="btn-secondary" onClick={handleCopyNotes} style={{padding: '0.4rem 1rem', borderRadius: '8px', fontSize: '0.85rem'}}>
                {notesCopied ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
                {notesCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {generatedNotes}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{margin: 'auto'}}>
            <BookMarked size={50} className="empty-state-icon" />
            <h3>Select a PDF above to create notes</h3>
            <p>The AI will extract headings, key concepts, bullet lists, and code blocks into study cards.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="view-body" style={{animation: 'fadeIn 0.4s ease-out'}}>
      <div className="academic-controls">
        <div className="control-group">
          <span className="control-label">Select Document</span>
          <select 
            className="control-select"
            value={quizDocId}
            onChange={(e) => setQuizDocId(e.target.value)}
          >
            <option value="">-- Choose Study Material --</option>
            {documents.map(doc => (
              <option value={doc.id} key={doc.id}>{doc.filename}</option>
            ))}
          </select>
        </div>
        <div className="control-group" style={{maxWidth: '120px', minWidth: '100px'}}>
          <span className="control-label">Questions</span>
          <select 
            className="control-select"
            value={quizNumQuestions}
            onChange={(e) => setQuizNumQuestions(parseInt(e.target.value))}
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <button 
          className="btn-primary" 
          onClick={handleGenerateQuiz}
          disabled={!quizDocId || quizLoading}
          style={{height: '42px'}}
        >
          {quizLoading ? <Loader2 size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
          Generate Quiz
        </button>
      </div>

      <div className="quiz-output-container">
        {quizLoading ? (
          <div className="empty-state" style={{margin: 'auto'}}>
            <Loader2 size={40} className="animate-spin" color="var(--primary)" />
            <p>Analyzing text content and formatting test questions...</p>
          </div>
        ) : generatedQuiz.length > 0 ? (
          <div>
            {quizSubmitted && (
              <div className="quiz-result-summary">
                <Award size={48} color="var(--primary)" />
                <div>
                  <h3>Quiz Finished!</h3>
                  <span className="quiz-score-badge">{quizScore} / {generatedQuiz.length}</span>
                  <p style={{color: 'var(--text-secondary)', marginTop: '0.25rem'}}>
                    {quizScore === generatedQuiz.length ? 'Perfect Score! 🌟 Excellent understanding.' : 
                     quizScore >= generatedQuiz.length / 2 ? 'Good job! Review incorrect answers below.' : 
                     'Keep studying! Try rereading the document notes.'}
                  </p>
                </div>
              </div>
            )}

            <div style={{marginTop: quizSubmitted ? '2rem' : '0'}}>
              {generatedQuiz.map((q, qIdx) => {
                const selectedAns = quizAnswers[qIdx];
                return (
                  <div className="quiz-question-container" key={qIdx}>
                    <h3 className="quiz-question-title">Q{qIdx + 1}. {q.question}</h3>
                    <div className="quiz-options-grid">
                      {q.options.map((opt, optIdx) => {
                        // Option letter is typically the first character, e.g. "a" from "a) Option text"
                        const optLetter = opt.trim().charAt(0).toLowerCase();
                        
                        let cardClass = 'quiz-option-card';
                        let icon = null;
                        
                        if (selectedAns === optLetter) {
                          cardClass += ' selected';
                        }
                        
                        if (quizSubmitted) {
                          if (optLetter === q.answer) {
                            cardClass += ' correct';
                            icon = <CheckCircle2 size={18} color="var(--success)" />;
                          } else if (selectedAns === optLetter) {
                            cardClass += ' incorrect';
                            icon = <XCircle size={18} color="var(--danger)" />;
                          }
                        }
                        
                        return (
                          <div 
                            className={cardClass}
                            key={optIdx}
                            onClick={() => handleSelectQuizAnswer(qIdx, optLetter)}
                          >
                            <span style={{flex: 1}}>{opt}</span>
                            {icon}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {!quizSubmitted ? (
              <button 
                className="btn-primary" 
                onClick={handleSubmitQuiz}
                disabled={Object.keys(quizAnswers).length < generatedQuiz.length}
                style={{marginTop: '1.5rem', marginLeft: 'auto', display: 'flex'}}
              >
                Submit Answers
              </button>
            ) : (
              <button 
                className="btn-secondary" 
                onClick={handleGenerateQuiz}
                style={{marginTop: '1.5rem', marginLeft: 'auto', display: 'flex'}}
              >
                Restart Quiz
              </button>
            )}
          </div>
        ) : (
          <div className="empty-state" style={{margin: 'auto'}}>
            <BrainCircuit size={50} className="empty-state-icon" />
            <h3>Select a PDF above to generate a quiz</h3>
            <p>Our academic assistant will build interactive multiple choice questions to test your knowledge.</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {/* Primary Sidebar Nav */}
      <div className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-icon"><GraduationCap size={24} /></div>
          <span className="logo-text">CampusPilot AI</span>
        </div>
        <div className="sidebar-menu">
          <div 
            className={`menu-item ${currentView === 'home' ? 'active' : ''}`}
            onClick={() => { setCurrentView('home'); setMobileMenuOpen(false); }}
          >
            <GraduationCap size={18} /> Home
          </div>
          <div 
            className={`menu-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setCurrentView('dashboard'); setMobileMenuOpen(false); }}
          >
            <LayoutDashboard size={18} /> Dashboard
          </div>
          <div 
            className={`menu-item ${currentView === 'chat' ? 'active' : ''}`}
            onClick={() => { setCurrentView('chat'); setMobileMenuOpen(false); }}
          >
            <MessageSquare size={18} /> Chat Room
          </div>
          <div 
            className={`menu-item ${currentView === 'upload' ? 'active' : ''}`}
            onClick={() => { setCurrentView('upload'); setMobileMenuOpen(false); }}
          >
            <UploadCloud size={18} /> Upload PDF
          </div>
          <div 
            className={`menu-item ${currentView === 'notes' ? 'active' : ''}`}
            onClick={() => { setCurrentView('notes'); setMobileMenuOpen(false); }}
          >
            <BookMarked size={18} /> Notes Generator
          </div>
          <div 
            className={`menu-item ${currentView === 'quiz' ? 'active' : ''}`}
            onClick={() => { setCurrentView('quiz'); setMobileMenuOpen(false); }}
          >
            <BrainCircuit size={18} /> Quiz Generator
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="theme-toggle-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>
      </div>

      {/* Main Panel */}
      <div className="main-content">
        <div className="top-header">
          <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          
          <div className="view-title-container">
            <h1 className="view-title">
              {currentView === 'home' && 'Welcome to CampusPilot'}
              {currentView === 'dashboard' && 'Academic Dashboard'}
              {currentView === 'chat' && 'AI Chat Grounding'}
              {currentView === 'upload' && 'Upload Study Material'}
              {currentView === 'notes' && 'Smart Notes Summary'}
              {currentView === 'quiz' && 'Interactive Academic Quiz'}
            </h1>
            <span className="view-subtitle">
              {currentView === 'home' && 'Smart Academic Assistant'}
              {currentView === 'dashboard' && 'Learning activity & analytics'}
              {currentView === 'chat' && 'Converse with AI models grounded by study context'}
              {currentView === 'upload' && 'Upload PDF lecture notes or textbooks'}
              {currentView === 'notes' && 'Generate structured markdown notes'}
              {currentView === 'quiz' && 'Test your knowledge with multiple choice quiz cards'}
            </span>
          </div>
        </div>

        {/* View body rendering */}
        {currentView === 'home' && renderHome()}
        {currentView === 'dashboard' && renderDashboard()}
        {currentView === 'chat' && renderChat()}
        {currentView === 'upload' && renderUpload()}
        {currentView === 'notes' && renderNotes()}
        {currentView === 'quiz' && renderQuiz()}
      </div>
    </div>
  );
}
