import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedBackground from '../components/AnimatedBackground';
import { authAPI, ragAPI, usersAPI, studentFeedbackAPI } from '../services/api';
import { handleError } from '../services/errorHandler';
import './StudentDashboard.css';

const StudentDashboard = () => {
  const AVATAR_PLACEHOLDER = '/images/avatar-placeholder.svg';
  const LOGO_PLACEHOLDER = '/images/flavcoin.png';

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('rag-search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [generatedAnswer, setGeneratedAnswer] = useState('');
  const [searching, setSearching] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // User data from API
  const [currentUser, setCurrentUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [editName, setEditName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('male');
  
  // Buddies from API
  const [buddies, setBuddies] = useState([]);
  const [buddySearch, setBuddySearch] = useState("");
  
  // Search history
  const [searchHistory, setSearchHistory] = useState([]);
  
  // Feedback
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);

  const getAvatarSrc = (avatar) => (avatar === 'female' ? '/images/female.png' : '/images/male.png');

  const handleAvatarError = (event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = AVATAR_PLACEHOLDER;
  };

  const handleLogoError = (event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = LOGO_PLACEHOLDER;
  };

  useEffect(() => {
    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const results = await Promise.allSettled([
        usersAPI.getStudents(),
        ragAPI.getSearchHistory(5),
      ]);

      if (results[0].status === 'fulfilled') {
        const students = results[0].value || [];
        setBuddies(students.filter(s => s.id !== user.id));
      }
      if (results[1].status === 'fulfilled') setSearchHistory(results[1].value || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await ragAPI.search(searchQuery);
      setSearchResults(results.results || []);
      setGeneratedAnswer(results.generated_answer || '');
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!feedbackMessage.trim()) return;
    try {
      await studentFeedbackAPI.send(feedbackMessage, isAnonymous);
      alert('Feedback sent successfully!');
      setFeedbackMessage('');
    } catch (error) {
      alert('Failed to send feedback');
    }
  };

  const handleLogout = () => {
    authAPI.logout();
    navigate('/');
  };

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
                {buddies.filter(buddy => {
                  if (!buddySearch.trim()) return true;
                  const q = buddySearch.trim().toLowerCase();
                  return (
                    buddy.name.toLowerCase().includes(q) ||
                    buddy.institution_id.toLowerCase().includes(q)
                  );
                }).length > 0 ? buddies.filter(buddy => {
                  if (!buddySearch.trim()) return true;
                  const q = buddySearch.trim().toLowerCase();
                  return (
                    buddy.name.toLowerCase().includes(q) ||
                    buddy.institution_id.toLowerCase().includes(q)
                  );
                }).map((buddy) => (
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
                  <label>Send as Anonymous?</label>
                  <div className="toggle-switch">
                    <input 
                      type="checkbox" 
                      id="identity-toggle" 
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                    />
                    <label htmlFor="identity-toggle">{isAnonymous ? 'Anonymous' : 'With Name'}</label>
                    <span className="toggle-slider"></span>
                  </div>
                </div>

                <button className="submit-feedback-btn" onClick={handleSendFeedback}>Send Feedback</button>
              </div>

              <div className="feedback-history">
                <h3>Recent Search History</h3>
                <div className="feedback-list">
                  {searchHistory.length > 0 ? searchHistory.map((item, idx) => (
                    <div key={idx} className="feedback-item">
                      <p className="feedback-text">{item.query}</p>
                      <p className="feedback-time">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                  )) : (
                    <p className="no-data">No search history yet</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Analysis Tab */}
          {activeTab === 'analysis' && (
            <section className="tab-content analysis-section">
              <h2>Learning Analytics</h2>
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
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
