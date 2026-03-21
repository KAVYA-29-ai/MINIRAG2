
/**
 * StudentDashboard - Main dashboard page for student users.
 *
 * Features:
 * - RAG search and results
 * - User profile management
 * - Buddy system
 * - Feedback submission
 * - Animated background
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedBackground from '../components/AnimatedBackground';
import { authAPI, ragAPI, usersAPI, studentFeedbackAPI } from '../services/api';
import { handleError } from '../services/errorHandler';
import { avatarSource, imageFallbackHandler } from '../utils/media';
import './StudentDashboard.css';

/**
 * StudentDashboard component
 * Handles student interactions, search, profile, buddies, and feedback.
 */
const StudentDashboard = () => {
  // Placeholder image paths
  const AVATAR_PLACEHOLDER = '/images/avatar-placeholder.svg';
  const LOGO_PLACEHOLDER = '/images/flavcoin.png';

  const navigate = useNavigate();

  // --- State variables ---

  /**
   * Current active tab (rag-search, profile, etc.)
   * @type {[string, Function]}
   */
  const [activeTab, setActiveTab] = useState('rag-search');

  /**
   * Search query input by user
   * @type {[string, Function]}
   */
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * Results returned from RAG search
   * @type {[Array, Function]}
   */
  const [searchResults, setSearchResults] = useState([]);

  /**
   * Generated answer from RAG
   * @type {[string, Function]}
   */
  const [generatedAnswer, setGeneratedAnswer] = useState('');

  /**
   * Loading and UI state
   */
  const [searching, setSearching] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [operationStatus, setOperationStatus] = useState('');

  // --- User profile state ---
  const [currentUser, setCurrentUser] = useState(null); // User object from API
  const [userName, setUserName] = useState(''); // Display name
  const [editName, setEditName] = useState(''); // Name being edited
  const [selectedAvatar, setSelectedAvatar] = useState('male'); // Avatar selection

  // --- Buddies system ---
  const [buddies, setBuddies] = useState([]); // List of buddies
  const [buddySearch, setBuddySearch] = useState(""); // Buddy search input

  // --- Search history ---
  const [searchHistory, setSearchHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [studyPlan, setStudyPlan] = useState('');
  const [studyPlanLoading, setStudyPlanLoading] = useState(false);

  // --- Feedback ---
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);

  /**
   * Get avatar image source by gender
   * @param {string} avatar - 'male' or 'female'
   * @returns {string} image path
   */
  const getAvatarSrc = avatarSource;

  /**
   * Handle avatar image load error
   * @param {Event} event
   */
  const handleAvatarError = imageFallbackHandler(AVATAR_PLACEHOLDER);

  /**
   * Handle logo image load error
   * @param {Event} event
   */
  const handleLogoError = imageFallbackHandler(LOGO_PLACEHOLDER);

  // --- Effects ---
  useEffect(() => {
    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load user data from API and initialize dashboard state.
   * Redirects to /auth if not logged in.
   */
  const loadUserData = async () => {
    try {
      const user = authAPI.getCurrentUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setCurrentUser(user);
      setUserName(user.name);
      setEditName(user.name);
      setSelectedAvatar(user.avatar || 'male');

      // Load all data independently
      setLoadingRecommendations(true);
      const recommendationPromise = typeof ragAPI.getRecommendations === 'function'
        ? ragAPI.getRecommendations()
        : Promise.resolve({ recommendations: [] });

      const results = await Promise.allSettled([
        usersAPI.getStudents(),
        ragAPI.getSearchHistory(50),
        recommendationPromise,
      ]);

      if (results[0].status === 'fulfilled') {
        const students = results[0].value || [];
        setBuddies(students.filter(s => s.id !== user.id));
      }
      if (results[1].status === 'fulfilled') {
        setSearchHistory(results[1].value || []);
      }
      if (results[2].status === 'fulfilled') {
        setRecommendations(results[2].value?.recommendations || []);
      }
    } catch (error) {
      handleError(error, 'Failed to load dashboard data.');
    } finally {
      setLoadingRecommendations(false);
      setLoading(false);
    }
  };

  /**
   * Run the RAG query and refresh local search history.
   */
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await ragAPI.search(searchQuery);
      setSearchResults(results.results || []);
      setGeneratedAnswer(results.generated_answer || '');
      const history = await ragAPI.getSearchHistory(50);
      setSearchHistory(history || []);
      setOperationStatus(`Found ${results.total_results || 0} results.`);
    } catch (error) {
      handleError(error, 'Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  /**
   * Submit student feedback with anonymous/identified mode.
   */
  const handleSendFeedback = async () => {
    if (!feedbackMessage.trim()) return;
    try {
      await studentFeedbackAPI.send(feedbackMessage, isAnonymous);
      setOperationStatus('Feedback sent successfully.');
      setFeedbackMessage('');
    } catch (error) {
      handleError(error, 'Failed to send feedback.');
    }
  };

  const handleLogout = () => {
    authAPI.logout();
    navigate('/');
  };

  /**
   * Build an adaptive 7-day study plan from current query context.
   */
  const handleGenerateStudyPlan = async () => {
    if (!searchQuery.trim()) {
      setOperationStatus('Type a topic first to generate a study plan.');
      return;
    }
    setStudyPlanLoading(true);
    try {
      const planResponse = await ragAPI.generateStudyPlan(searchQuery, 'english');
      setStudyPlan(planResponse?.study_plan || 'No plan generated.');
      setOperationStatus('Study plan generated successfully.');
    } catch (error) {
      handleError(error, 'Failed to generate study plan.');
      setOperationStatus('Study plan generation failed.');
    } finally {
      setStudyPlanLoading(false);
    }
  };

  const fetchChatMessages = async () => {
    try {
      const res = await fetch('/api/chat/messages', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('edurag_token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (err) {
      // ignore errors for polling
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('edurag_token')}`
        },
        body: JSON.stringify({ message: chatInput })
      });
      if (res.ok) {
        setChatInput("");
        fetchChatMessages();
      }
    } catch (err) {
      handleError(err, 'Failed to send chat message.');
    }
  };

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);

  const filteredBuddies = useMemo(() => {
    const q = buddySearch.trim().toLowerCase();
    if (!q) return buddies;
    return buddies.filter((buddy) => (
      buddy.name.toLowerCase().includes(q) ||
      buddy.institution_id.toLowerCase().includes(q)
    ));
  }, [buddies, buddySearch]);

  const filteredHistory = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) return searchHistory;
    return searchHistory.filter((item) => (
      (item.query || '').toLowerCase().includes(q) ||
      (item.language || '').toLowerCase().includes(q)
    ));
  }, [searchHistory, historyFilter]);

  useEffect(() => {
    if (activeTab !== 'chatroom') return undefined;

    fetchChatMessages();
    const poller = setInterval(fetchChatMessages, 7000);
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsToken = encodeURIComponent(localStorage.getItem('edurag_token') || '');
    const wsUrl = `${wsProtocol}://${window.location.host}/api/ws/chat?token=${wsToken}`;
    const socket = new WebSocket(wsUrl);
    socket.onmessage = () => fetchChatMessages();

    return () => {
      clearInterval(poller);
      socket.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (loading) {
    return (
      <div className="dashboard loading-screen">
        <AnimatedBackground />
        <div className="loading-content">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <AnimatedBackground />
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/images/logo.png" alt="EduRag Logo" className="sidebar-logo" onError={handleLogoError} />
          <h2>EduRag</h2>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'rag-search' ? 'active' : ''}`}
            onClick={() => setActiveTab('rag-search')}
          >
            <span className="nav-icon">🔍</span>
            <span>RAG Search</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'buddies' ? 'active' : ''}`}
            onClick={() => setActiveTab('buddies')}
          >
            <span className="nav-icon">👥</span>
            <span>Buddies</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'feedback' ? 'active' : ''}`}
            onClick={() => setActiveTab('feedback')}
          >
            <span className="nav-icon">💬</span>
            <span>Feedback</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            <span className="nav-icon">📊</span>
            <span>Analysis</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <span className="nav-icon">🕘</span>
            <span>Search History</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'chatroom' ? 'active' : ''}`}
            onClick={() => setActiveTab('chatroom')}
          >
            <span className="nav-icon">💬</span>
            <span>Chatroom</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <img
              src={getAvatarSrc(selectedAvatar)}
              alt={selectedAvatar}
              className="avatar-image"
              onError={handleAvatarError}
            />
            <div className="user-info">
              <p className="user-name">{userName}</p>
              <p className="user-id">{currentUser?.institution_id || ''}</p>
            </div>
          </div>
          <button
            className="edit-profile-btn"
            onClick={() => setShowProfileModal(true)}
          >
            Edit Profile
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Your Profile</h3>

            <div className="profile-form">
              <div className="form-group-modal">
                <label>Your Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter your name"
                  className="profile-input"
                />
              </div>

              <div className="form-group-modal">
                <label>Choose Avatar</label>
                <div className="avatar-options-modal">
                  <button
                    className={`avatar-option ${selectedAvatar === 'male' ? 'selected' : ''}`}
                    onClick={() => setSelectedAvatar('male')}
                  >
                    <img src="/images/male.png" alt="Male" className="modal-avatar-img" onError={handleAvatarError} />
                    <p>Male</p>
                  </button>
                  <button
                    className={`avatar-option ${selectedAvatar === 'female' ? 'selected' : ''}`}
                    onClick={() => setSelectedAvatar('female')}
                  >
                    <img src="/images/female.png" alt="Female" className="modal-avatar-img" onError={handleAvatarError} />
                    <p>Female</p>
                  </button>
                </div>
              </div>
            </div>

            <div className="profile-modal-buttons">
              <button
                className="save-profile-btn"
                onClick={async () => {
                  try {
                    await usersAPI.update(currentUser.id, {
                      name: editName,
                      avatar: selectedAvatar
                    });
                    setUserName(editName);
                    setCurrentUser({ ...currentUser, name: editName, avatar: selectedAvatar });
                  } catch (err) {
                    handleError(err, 'Failed to update profile');
                  }
                  setShowProfileModal(false);
                }}
              >
                Save Changes
              </button>
              <button
                className="close-modal-btn"
                onClick={() => {
                  setEditName(userName);
                  setShowProfileModal(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="main-content">
        <header className="top-bar">
          <h1>Student Dashboard</h1>
          <div className="top-bar-actions">
            <input
              type="text"
              placeholder="Quick search..."
              className="search-input"
              value={buddySearch}
              onChange={e => setBuddySearch(e.target.value)}
            />
            <button className="help-btn" title="Help">
              ?
            </button>
          </div>
        </header>

        <div className="content-area">
          {operationStatus && <div className="operation-status">{operationStatus}</div>}
          {/* RAG Search Tab */}
          {activeTab === 'rag-search' && (
            <section className="tab-content rag-search-section">
              <h2>RAG Search</h2>
              <div className="search-container">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Ask a question about your PDFs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="large-search-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button className="search-btn" onClick={handleSearch} disabled={searching}>
                    <span>🔍</span> {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>

                <div className="language-selector">
                  <label>Language Preference:</label>
                  <select>
                    <option>English</option>
                    <option>Hindi</option>
                    <option>Hinglish</option>
                  </select>
                </div>
              </div>

              <div className="search-results">
                {generatedAnswer ? (
                  <>
                    <div className="ai-answer-card">
                      <div className="ai-answer-header">
                        <span className="ai-icon">✨</span>
                        <h3>AI Generated Answer</h3>
                      </div>
                      <div className="ai-answer-text">
                        {generatedAnswer.split('\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    </div>

                    {searchResults.length > 0 && (
                      <div className="sources-section">
                        <h4>📚 Sources — Where this answer came from</h4>
                        <div className="sources-list">
                          {searchResults.map((result, idx) => (
                            <div key={idx} className="source-chip">
                              <span className="source-name">📄 {result.source}</span>
                              <span className="source-page">Page {result.page_number}</span>
                              <span className="source-score">{Math.round(result.relevance_score * 100)}% match</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h3>Quick Tips</h3>
                    <div className="tips-grid">
                      <div className="tip-card">
                        <span className="tip-icon">💡</span>
                        <p>Use specific keywords for better results</p>
                      </div>
                      <div className="tip-card">
                        <span className="tip-icon">📚</span>
                        <p>Search across all your uploaded PDFs</p>
                      </div>
                      <div className="tip-card">
                        <span className="tip-icon">🎯</span>
                        <p>Get AI-powered answers instantly</p>
                      </div>
                      <div className="tip-card">
                        <span className="tip-icon">🌍</span>
                        <p>Support for multiple languages</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* Buddies Tab */}
          {activeTab === 'buddies' && (
            <section className="tab-content buddies-section">
              <h2>Student Buddies</h2>
              <div className="buddies-grid">
                {filteredBuddies.length > 0 ? filteredBuddies.map((buddy) => (
                  <div key={buddy.id} className="buddy-card">
                    <img
                      src={getAvatarSrc(buddy.avatar)}
                      alt={buddy.avatar || 'male'}
                      className="buddy-avatar-img"
                      onError={handleAvatarError}
                    />
                    <h3>{buddy.name}</h3>
                    <p className="buddy-id">ID: {buddy.institution_id}</p>
                    <p className="buddy-status">{buddy.status === 'active' ? 'Active' : 'Inactive'}</p>
                  </div>
                )) : (
                  <p className="no-data">No other students found</p>
                )}
              </div>
            </section>
          )}

          {/* Feedback Tab */}
          {activeTab === 'feedback' && (
            <section className="tab-content feedback-section">
              <h2>Share Feedback</h2>
              <div className="feedback-form">
                <div className="form-group">
                  <label>Feedback Message</label>
                  <textarea
                    placeholder="Share your feedback with teachers..."
                    rows="6"
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                  ></textarea>
                </div>

                <div className="form-group">
                  <label>Show your name to teacher/admin?</label>
                  <div className="toggle-switch">
                    <input
                      type="checkbox"
                      id="identity-toggle"
                      checked={!isAnonymous}
                      onChange={(e) => setIsAnonymous(!e.target.checked)}
                    />
                    <label htmlFor="identity-toggle">{!isAnonymous ? 'Show my name' : 'Send anonymously'}</label>
                    <span className="toggle-slider"></span>
                  </div>
                </div>

                <button className="submit-feedback-btn" onClick={handleSendFeedback}>Send Feedback</button>
              </div>

              <div className="feedback-history">
                <h3>Feedback Privacy</h3>
                <p className="section-desc">Your feedback can be anonymous or identified based on the toggle above.</p>
              </div>
            </section>
          )}

          {/* Search History Tab */}
          {activeTab === 'history' && (
            <section className="tab-content history-section">
              <h2>Search History</h2>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Filter by query or language..."
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="large-search-input"
                />
              </div>
              <div className="feedback-list">
                {filteredHistory.length > 0 ? filteredHistory.map((item) => (
                  <div key={item.id} className="feedback-item">
                    <p className="feedback-text">{item.query}</p>
                    <p className="feedback-time">
                      {new Date(item.created_at).toLocaleString()} | {item.language || 'english'} | {item.results_count || 0} results
                    </p>
                  </div>
                )) : (
                  <p className="no-data">No matching search history found.</p>
                )}
              </div>
            </section>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <section className="tab-content analysis-section">
              <h2>Learning Analytics</h2>
              {loadingRecommendations && <p className="section-desc">Loading smart recommendations...</p>}
              <div className="analytics-grid">
                <div className="analytics-card">
                  <h3>Search Activity</h3>
                  <div className="metric">
                    <p className="metric-label">Total Searches</p>
                    <p className="metric-value">{searchHistory.length}</p>
                  </div>
                  <p className="metric-description">Your recent searches</p>
                </div>

                <div className="analytics-card">
                  <h3>Study Buddies</h3>
                  <div className="metric">
                    <p className="metric-label">Connected</p>
                    <p className="metric-value">{buddies.length}</p>
                  </div>
                  <p className="metric-description">Fellow students</p>
                </div>

                <div className="analytics-card">
                  <h3>Your Profile</h3>
                  <div className="metric">
                    <p className="metric-label">Account Status</p>
                    <p className="metric-value">{currentUser?.status || 'Active'}</p>
                  </div>
                  <p className="metric-description">Member since joining</p>
                </div>

                <div className="analytics-card">
                  <h3>Role</h3>
                  <div className="metric">
                    <p className="metric-label">Access Level</p>
                    <p className="metric-value">{currentUser?.role || 'Student'}</p>
                  </div>
                  <p className="metric-description">Your account type</p>
                </div>
              </div>

              <div className="insights-section">
                <h3>Tips</h3>
                <div className="insight-card">
                  <span>💡</span>
                  <p>Use RAG Search to find answers from your course materials</p>
                </div>
                <div className="insight-card">
                  <span>👥</span>
                  <p>Connect with {buddies.length} other students in your class</p>
                </div>
                <div className="insight-card">
                  <span>📝</span>
                  <p>Share anonymous feedback with your teachers anytime</p>
                </div>
              </div>

              <div className="insights-section" style={{ marginTop: '1.25rem' }}>
                <h3>Smart Recommendations</h3>
                {recommendations.length > 0 ? recommendations.map((item, idx) => (
                  <div className="insight-card" key={`rec-${idx}`}>
                    <span>🎯</span>
                    <p><strong>{item.topic}</strong> - {item.reason}</p>
                  </div>
                )) : (
                  <p className="section-desc">No personalized recommendations yet. Do a few searches first.</p>
                )}
              </div>

              <div className="insights-section" style={{ marginTop: '1.25rem' }}>
                <h3>Adaptive Study Plan</h3>
                <button className="search-btn" onClick={handleGenerateStudyPlan} disabled={studyPlanLoading}>
                  {studyPlanLoading ? 'Generating Plan...' : 'Generate 7-Day Plan'}
                </button>
                {studyPlan && (
                  <div className="ai-answer-card" style={{ marginTop: '1rem' }}>
                    <div className="ai-answer-header">
                      <span className="ai-icon">🧠</span>
                      <h3>Your Study Plan</h3>
                    </div>
                    <div className="ai-answer-text">
                      {studyPlan.split('\n').map((line, idx) => <p key={`plan-${idx}`}>{line}</p>)}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Chatroom Tab */}
          {activeTab === 'chatroom' && (
            <section className="tab-content chatroom-section">
              <h2>Student Chatroom</h2>
              <div className="chatroom-box">
                <div className="chat-messages">
                  {chatMessages.length === 0 ? (
                    <div className="no-data">No messages yet. Start the conversation!</div>
                  ) : (
                    chatMessages.map(msg => (
                      <div
                        key={msg.id}
                        className={`chat-bubble ${msg.sender_id === currentUser.id ? 'own' : 'other'}`}
                      >
                        <div className="chat-header">
                          <span className="chat-sender">{msg.sender_name}</span>
                          <span className="chat-time">{new Date(msg.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="chat-text">{msg.message}</div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef}></div>
                </div>
                <div className="chat-input-row">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Type your message..."
                    className="chat-input"
                    onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                  />
                  <button className="send-chat-btn" onClick={sendChatMessage}>Send</button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
