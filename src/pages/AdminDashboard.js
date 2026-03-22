/**
 * AdminDashboard.js - Dashboard page for admins in MINI-RAG frontend.
 *
 * Handles user management, analytics, feedback, and PDF management for admins.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AnimatedBackground from '../components/AnimatedBackground';
import { authAPI, usersAPI, feedbackAPI, studentFeedbackAPI, analyticsAPI, ragAPI } from '../services/api';
import { handleError } from '../services/errorHandler';
import { avatarSource, imageFallbackHandler } from '../utils/media';
import { matchesQuery } from '../utils/search';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const AVATAR_PLACEHOLDER = '/images/avatar-placeholder.svg';
  const LOGO_PLACEHOLDER = '/images/flavcoin.png';

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLanguage, setSearchLanguage] = useState('auto');
  const [searchResults, setSearchResults] = useState([]);
  const [generatedAnswer, setGeneratedAnswer] = useState('');
  const [searching, setSearching] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // User data
  const [currentUser, setCurrentUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [editName, setEditName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('male');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [userFilter, setUserFilter] = useState('all');

  // Users from API
  const [users, setUsers] = useState([]);

  // Feedback from API
  const [teacherFeedback, setTeacherFeedback] = useState([]);
  const [studentFeedbackList, setStudentFeedbackList] = useState([]);

  // Analytics from API
  const [analytics, setAnalytics] = useState(null);
  const [languageUsage, setLanguageUsage] = useState([]);

  // PDFs from API
  const [pdfs, setPdfs] = useState([]);
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [indexingPDF, setIndexingPDF] = useState(null);

  const getPreferenceStorageKey = (user) => {
    const role = user?.role || 'admin';
    const id = user?.id || 'current';
    return `edurag_language_pref_${role}_${id}`;
  };

  const getAvatarSrc = avatarSource;
  const handleAvatarError = imageFallbackHandler(AVATAR_PLACEHOLDER);
  const handleLogoError = imageFallbackHandler(LOGO_PLACEHOLDER);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
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
      const savedLanguage = localStorage.getItem(getPreferenceStorageKey(user));
      if (savedLanguage) {
        setSearchLanguage(savedLanguage);
      }

      // Load all data independently — one failure must not block others
      const results = await Promise.allSettled([
        usersAPI.getAll(),
        feedbackAPI.getAll(),
        analyticsAPI.getSummary(),
        analyticsAPI.getLanguageUsage(),
        ragAPI.getPDFs(),
        studentFeedbackAPI.getAll(),
      ]);

      if (results[0].status === 'fulfilled') setUsers(results[0].value || []);
      else toast.error('Unable to load users right now.');

      if (results[1].status === 'fulfilled') setTeacherFeedback(results[1].value || []);
      else toast.error('Unable to load teacher feedback right now.');

      if (results[2].status === 'fulfilled') setAnalytics(results[2].value);
      else toast.error('Unable to load analytics right now.');

      if (results[3].status === 'fulfilled') setLanguageUsage(results[3].value || []);
      else setLanguageUsage([]);

      if (results[4].status === 'fulfilled') setPdfs(results[4].value || []);
      else toast.error('Unable to load PDFs right now.');

      if (results[5].status === 'fulfilled') setStudentFeedbackList(results[5].value || []);
      else toast.error('Unable to load student feedback right now.');
    } catch (error) {
      handleError(error, 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await ragAPI.search(searchQuery, searchLanguage);
      setSearchResults(results.results || []);
      setGeneratedAnswer(results.generated_answer || '');
      toast.success(`Search complete: ${results.total_results || 0} matches. Language: ${(results.language || searchLanguage).toUpperCase()}`);
    } catch (error) {
      toast.error('Search failed. Please retry.');
      handleError(error, 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleLogout = () => {
    authAPI.logout();
    navigate('/');
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await usersAPI.updateRole(userId, newRole);
      setUsers(users.map(user =>
        user.id === userId ? { ...user, role: newRole } : user
      ));
      toast.success(`Role updated to ${newRole}.`);
    } catch (error) {
      handleError(error, 'Failed to update role.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await usersAPI.delete(userId);
        setUsers(users.filter(user => user.id !== userId));
        toast.success('User deleted successfully.');
      } catch (error) {
        handleError(error, 'Failed to delete user.');
      }
    }
  };

  const handleRespondFeedback = async (feedbackId, response) => {
    try {
      await feedbackAPI.respond(feedbackId, response);
      const feedback = await feedbackAPI.getAll();
      setTeacherFeedback(feedback);
      toast.success('Feedback response sent.');
    } catch (error) {
      handleError(error, 'Failed to send response.');
    }
  };

  const filteredUsers = users.filter(user => {
    // Filter by role
    if (userFilter !== 'all' && user.role !== userFilter) return false;
    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return matchesQuery(q, [user.name, user.institution_id, user.email]);
    }
    return true;
  });

  const roleDistributionData = [
    { name: 'Students', value: users.filter(u => u.role === 'student').length },
    { name: 'Teachers', value: users.filter(u => u.role === 'teacher').length },
    { name: 'Admins', value: users.filter(u => u.role === 'admin').length },
  ];

  const systemMetricsData = [
    { name: 'Users', value: analytics?.total_users || 0 },
    { name: 'Searches', value: analytics?.total_searches || 0 },
    { name: 'PDFs', value: analytics?.total_pdfs || 0 },
    { name: 'Indexed', value: analytics?.indexed_pdfs || 0 },
  ];

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(getPreferenceStorageKey(currentUser), searchLanguage);
  }, [currentUser, searchLanguage]);

  const totalLanguageQueries = languageUsage.reduce((sum, item) => sum + (item.count || 0), 0);
  const languagePercent = (language) => {
    if (!totalLanguageQueries) return '--';
    const match = languageUsage.find((item) => (item.language || '').toLowerCase() === language);
    if (!match) return '0%';
    return `${Math.round((match.count / totalLanguageQueries) * 100)}%`;
  };

  const handleUploadPDF = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPDF(true);
    try {
      await ragAPI.uploadPDF(file);
      toast.success(`Uploaded: ${file.name}. Click Index to make it searchable.`);
      const pdfList = await ragAPI.getPDFs();
      setPdfs(pdfList);
    } catch (error) {
      toast.error('Upload failed: ' + error.message);
    } finally {
      setUploadingPDF(false);
      e.target.value = '';
    }
  };

  const handleIndexPDF = async (pdfId) => {
    setIndexingPDF(pdfId);
    try {
      const result = await ragAPI.indexPDF(pdfId);
      toast.success(result.message || 'PDF indexed successfully.');
      const pdfList = await ragAPI.getPDFs();
      setPdfs(pdfList);
    } catch (error) {
      toast.error('Indexing failed: ' + error.message);
    } finally {
      setIndexingPDF(null);
    }
  };

  const handleDeletePDF = async (pdfId, filename) => {
    if (!window.confirm(`Delete "${filename}" and all its indexed data?`)) return;
    try {
      await ragAPI.deletePDF(pdfId);
      setPdfs(pdfs.filter(p => p.id !== pdfId));
      toast.success(`Deleted: ${filename}`);
    } catch (error) {
      toast.error('Delete failed: ' + error.message);
    }
  };

  // Refetch users when switching to User Management tab
  useEffect(() => {
    if (activeTab === 'users') {
      setLoading(true);
      usersAPI.getAll().then(data => {
        setUsers(data || []);
        setLoading(false);
      }).catch(err => {
        setUsers([]);
        setLoading(false);
        console.error('Error reloading users:', err);
      });
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="admin-dashboard loading-screen">
        <AnimatedBackground />
        <div className="loading-content">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <AnimatedBackground />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/images/logo.png" alt="EduRag Logo" className="sidebar-logo" onError={handleLogoError} />
          <h2>EduRag</h2>
        </div>

        <div className="role-badge admin">
          <span>👑</span> Admin Portal
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <span className="nav-icon">👥</span>
            <span>User Management</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'feedback' ? 'active' : ''}`}
            onClick={() => setActiveTab('feedback')}
          >
            <span className="nav-icon">💬</span>
            <span>Teacher Feedback</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'student-feedback' ? 'active' : ''}`}
            onClick={() => setActiveTab('student-feedback')}
          >
            <span className="nav-icon">📩</span>
            <span>Student Feedback</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'rag-search' ? 'active' : ''}`}
            onClick={() => setActiveTab('rag-search')}
          >
            <span className="nav-icon">🔍</span>
            <span>RAG Search</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'pdf-manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('pdf-manage')}
          >
            <span className="nav-icon">📄</span>
            <span>PDF Management</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <span className="nav-icon">📊</span>
            <span>System Analytics</span>
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
              <p className="user-id">Admin ID: {currentUser?.institution_id || ''}</p>
            </div>
          </div>
          <button
            className="edit-profile-btn"
            onClick={() => {
              setCurrentPassword('');
              setNewPassword('');
              setConfirmNewPassword('');
              setShowProfileModal(true);
            }}
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

              <div className="form-group-modal">
                <label>Current Password (optional)</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="profile-input"
                />
              </div>

              <div className="form-group-modal">
                <label>New Password (optional)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="profile-input"
                />
              </div>

              <div className="form-group-modal">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="profile-input"
                />
              </div>
            </div>

            <div className="profile-modal-buttons">
              <button
                className="save-profile-btn"
                onClick={async () => {
                  setProfileSaving(true);
                  try {
                    if (newPassword || confirmNewPassword || currentPassword) {
                      if (!currentPassword || !newPassword || !confirmNewPassword) {
                        throw new Error('Fill all password fields to change password.');
                      }
                      if (newPassword !== confirmNewPassword) {
                        throw new Error('New password and confirm password do not match.');
                      }
                      await authAPI.changePassword(currentPassword, newPassword);
                    }
                    await usersAPI.update(currentUser.id, {
                      name: editName,
                      avatar: selectedAvatar
                    });
                    setUserName(editName);
                    setCurrentUser({ ...currentUser, name: editName, avatar: selectedAvatar });
                    toast.success('Profile updated successfully.');
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setShowProfileModal(false);
                  } catch (err) {
                    handleError(err, 'Failed to update profile');
                  } finally {
                    setProfileSaving(false);
                  }
                }}
                disabled={profileSaving}
              >
                {profileSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                className="cancel-profile-btn"
                onClick={() => {
                  setEditName(userName);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                  setShowProfileModal(false);
                }}
                disabled={profileSaving}
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
          <h1>Admin Dashboard</h1>
          <div className="top-bar-actions">
            <input
              type="text"
              placeholder="Quick search..."
              className="search-input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button className="help-btn" title="Help">?</button>
          </div>
        </header>

        <div className="content-area">

          {/* User Management Tab */}
          {activeTab === 'users' && (
            <section className="tab-content">
              <h2>👥 User Management</h2>
              <p className="section-desc">Manage users, change roles, and delete accounts</p>

              <div className="user-controls">
                <div className="filter-group">
                  <label>Filter by Role:</label>
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="filter-select"
                  >
                    <option value="all">All Users</option>
                    <option value="student">Students</option>
                    <option value="teacher">Teachers</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
                <div className="user-stats-mini">
                  <span className="stat-pill">👥 {users.length} Total</span>
                  <span className="stat-pill student">🎓 {users.filter(u => u.role === 'student').length} Students</span>
                  <span className="stat-pill teacher">👨‍🏫 {users.filter(u => u.role === 'teacher').length} Teachers</span>
                  <span className="stat-pill">🟢 {users.filter(u => u.status === 'active').length} Active</span>
                  <span className="stat-pill">🔴 {users.filter(u => u.status !== 'active').length} Inactive</span>
                </div>
              </div>

              <div className="users-table">
                <div className="table-header">
                  <span>User</span>
                  <span>ID</span>
                  <span>Current Role</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {filteredUsers.map((user) => (
                  <div key={user.id} className="table-row">
                    <div className="user-cell">
                      <img
                        src={getAvatarSrc(user.avatar)}
                        alt={user.name}
                        className="table-avatar"
                        onError={handleAvatarError}
                      />
                      <span>{user.name}</span>
                    </div>
                    <span className="id-cell">{user.institution_id}</span>
                    <span className={`role-cell ${user.role}`}>
                      {user.role === 'student' ? '🎓' : user.role === 'teacher' ? '👨‍🏫' : '👑'} {user.role}
                    </span>
                    <span className={`status-cell ${user.status}`}>
                      {user.status === 'active' ? '🟢' : '🔴'} {user.status}
                    </span>
                    <div className="actions-cell">
                      <select
                        className="role-select"
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteUser(user.id)}
                        title="Delete User"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Teacher Feedback Tab */}
          {activeTab === 'feedback' && (
            <section className="tab-content">
              <h2>💬 Teacher Feedback</h2>
              <p className="section-desc">View and manage feedback from teachers (non-anonymous)</p>

              <div className="feedback-stats">
                <div className="feedback-stat-card">
                  <span className="stat-number">{teacherFeedback.length}</span>
                  <span className="stat-label">Total Feedback</span>
                </div>
                <div className="feedback-stat-card pending">
                  <span className="stat-number">{teacherFeedback.filter(f => f.status === 'pending').length}</span>
                  <span className="stat-label">Pending</span>
                </div>
                <div className="feedback-stat-card responded">
                  <span className="stat-number">{teacherFeedback.filter(f => f.status === 'responded').length}</span>
                  <span className="stat-label">Responded</span>
                </div>
              </div>

              <div className="feedback-list">
                {teacherFeedback.length > 0 ? teacherFeedback.map((feedback) => (
                  <div key={feedback.id} className="feedback-card">
                    <div className="feedback-sender">
                      <img
                        src={getAvatarSrc(feedback.sender_avatar)}
                        alt={feedback.sender_name}
                        className="feedback-avatar"
                        onError={handleAvatarError}
                      />
                      <div className="sender-details">
                        <p className="sender-name">{feedback.sender_name}</p>
                        <p className="sender-id">ID: {feedback.sender_institution_id}</p>
                      </div>
                      <span className={`feedback-status-badge ${feedback.status}`}>
                        {feedback.status === 'pending' ? '⏳ Pending' : feedback.status === 'responded' ? '✓ Responded' : '📁 Archived'}
                      </span>
                    </div>
                    <div className="feedback-content">
                      <div className="feedback-meta">
                        <span className="feedback-category">{feedback.category}</span>
                        <span className="feedback-date">{new Date(feedback.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="feedback-message">{feedback.message}</p>
                      {feedback.admin_response && (
                        <div className="admin-response">
                          <strong>Response:</strong> {feedback.admin_response}
                        </div>
                      )}
                    </div>
                    {feedback.status === 'pending' && (
                      <div className="feedback-actions">
                        <button
                          className="respond-btn"
                          onClick={() => {
                            const response = prompt('Enter your response:');
                            if (response) handleRespondFeedback(feedback.id, response);
                          }}
                        >📝 Respond</button>
                      </div>
                    )}
                  </div>
                )) : (
                  <p className="no-data">No feedback received yet</p>
                )}
              </div>
            </section>
          )}

          {/* Student Feedback Tab */}
          {activeTab === 'student-feedback' && (
            <section className="tab-content">
              <h2>📩 Student Feedback</h2>
              <p className="section-desc">View feedback submitted by students (anonymous and identified)</p>

              <div className="stats-row">
                <span className="stat-pill">📬 {studentFeedbackList.length} Total</span>
                <span className="stat-pill student">🕵️ {studentFeedbackList.filter(f => f.is_anonymous).length} Anonymous</span>
                <span className="stat-pill teacher">👤 {studentFeedbackList.filter(f => !f.is_anonymous).length} Identified</span>
              </div>

              <div className="feedback-list" style={{marginTop: '1.5rem'}}>
                {studentFeedbackList.length > 0 ? (
                  studentFeedbackList.map((fb, index) => (
                    <div key={index} className="feedback-card">
                      <div className="feedback-card-header">
                        <div className="feedback-sender">
                          <span className="sender-badge">
                            {fb.is_anonymous
                              ? '🕵️ Anonymous Student'
                              : `👤 ${fb.sender_name || `Student #${fb.sender_id || 'Unknown'}`} ${fb.sender_institution_id ? `(${fb.sender_institution_id})` : ''}`}
                          </span>
                        </div>
                        <span className="feedback-time">{new Date(fb.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="feedback-message">{fb.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="no-data">No student feedback received yet</p>
                )}
              </div>
            </section>
          )}

          {/* RAG Search Tab */}
          {activeTab === 'rag-search' && (
            <section className="tab-content">
              <h2>🔍 RAG Search - System Wide</h2>
              <p className="section-desc">Search across all PDFs and content in the system</p>

              <div className="search-container">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search all system content, PDFs, feedback, and more..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="large-search-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button className="search-btn" onClick={handleSearch} disabled={searching}>
                    <span>🔍</span> {searching ? 'Searching...' : 'Search with RAG'}
                  </button>
                </div>

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
                ) : null}

                <div className="language-selector">
                  <label>Language Preference:</label>
                  <select value={searchLanguage} onChange={(e) => setSearchLanguage(e.target.value)}>
                    <option value="auto">Auto Detect</option>
                    <option value="english">English</option>
                    <option value="hindi">Hindi</option>
                    <option value="hinglish">Hinglish</option>
                  </select>
                  <p className="section-desc" style={{ marginTop: '0.5rem' }}>
                    Current preference: <strong>{searchLanguage.toUpperCase()}</strong>
                  </p>
                </div>

                <h3>📂 Search Scope</h3>
                <div className="tips-grid">
                  <div className="tip-card">
                    <span className="tip-icon">📄</span>
                    <p>All Uploaded PDFs</p>
                  </div>
                  <div className="tip-card">
                    <span className="tip-icon">💬</span>
                    <p>Teacher Feedback</p>
                  </div>
                  <div className="tip-card">
                    <span className="tip-icon">📊</span>
                    <p>System Analytics</p>
                  </div>
                  <div className="tip-card">
                    <span className="tip-icon">👥</span>
                    <p>User Data</p>
                  </div>
                </div>

                <h3>🕐 Recent Searches</h3>
                <div className="recent-searches">
                  <p className="no-data">Search history will appear here once you start searching</p>
                </div>
              </div>
            </section>
          )}

          {/* PDF Management Tab */}
          {activeTab === 'pdf-manage' && (
            <section className="tab-content">
              <h2>📄 PDF Management</h2>
              <p className="section-desc">Upload, index, and manage course PDFs for RAG search</p>

              <div className="pdf-upload-section">
                <div className="upload-area">
                  <span className="upload-icon">📤</span>
                  <h3>Upload New PDF</h3>
                  <p>Upload course materials, notes, or question papers</p>
                  <label className="upload-btn-label">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleUploadPDF}
                      disabled={uploadingPDF}
                      style={{display: 'none'}}
                    />
                    {uploadingPDF ? '⏳ Uploading...' : '📁 Choose PDF File'}
                  </label>
                </div>
              </div>

              <div className="pdf-stats-bar">
                <span className="stat-pill">📄 {pdfs.length} Total PDFs</span>
                <span className="stat-pill indexed">✅ {pdfs.filter(p => p.status === 'indexed').length} Indexed</span>
                <span className="stat-pill pending">⏳ {pdfs.filter(p => p.status === 'pending_indexing').length} Pending</span>
              </div>

              <div className="pdf-list">
                <div className="table-header">
                  <span>Filename</span>
                  <span>Status</span>
                  <span>Pages</span>
                  <span>Chunks</span>
                  <span>Uploaded</span>
                  <span>Actions</span>
                </div>
                {pdfs.length > 0 ? pdfs.map((pdf) => (
                  <div key={pdf.id} className="table-row pdf-row">
                    <div className="pdf-name-cell">
                      <span className="pdf-icon">📄</span>
                      <span>{pdf.filename}</span>
                    </div>
                    <span className={`status-badge ${pdf.status}`}>
                      {pdf.status === 'indexed' ? '✅ Indexed' : pdf.status === 'pending_indexing' ? '⏳ Pending' : '❌ Failed'}
                    </span>
                    <span>{pdf.total_pages || '--'}</span>
                    <span>{pdf.total_chunks || '--'}</span>
                    <span className="date-cell">{pdf.created_at ? new Date(pdf.created_at).toLocaleDateString() : '--'}</span>
                    <div className="actions-cell">
                      {pdf.status !== 'indexed' && (
                        <button
                          className="index-btn"
                          onClick={() => handleIndexPDF(pdf.id)}
                          disabled={indexingPDF === pdf.id}
                        >
                          {indexingPDF === pdf.id ? '⏳ Indexing...' : '🔄 Index'}
                        </button>
                      )}
                      <button
                        className="delete-btn"
                        onClick={() => handleDeletePDF(pdf.id, pdf.filename)}
                        title="Delete PDF"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="no-data-row">
                    <p className="no-data">No PDFs uploaded yet. Upload your first PDF to enable RAG search!</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* System Analytics Tab */}
          {activeTab === 'analytics' && (
            <section className="tab-content">
              <h2>📊 System Analytics</h2>
              <p className="section-desc">Overview of RAG system performance and usage</p>

              <div className="analytics-stats">
                <div className="analytics-card">
                  <span className="analytics-icon">📈</span>
                  <div className="analytics-info">
                    <p className="analytics-number">{analytics?.total_searches || 0}</p>
                    <p className="analytics-label">Total RAG Queries</p>
                  </div>
                </div>
                <div className="analytics-card">
                  <span className="analytics-icon">📚</span>
                  <div className="analytics-info">
                    <p className="analytics-number">{analytics?.total_pdfs || 0}</p>
                    <p className="analytics-label">PDFs Indexed</p>
                  </div>
                </div>
                <div className="analytics-card">
                  <span className="analytics-icon">👥</span>
                  <div className="analytics-info">
                    <p className="analytics-number">{analytics?.total_users || 0}</p>
                    <p className="analytics-label">Total Users</p>
                  </div>
                </div>
                <div className="analytics-card">
                  <span className="analytics-icon">💬</span>
                  <div className="analytics-info">
                    <p className="analytics-number">{analytics?.pending_feedback || 0}</p>
                    <p className="analytics-label">Pending Feedback</p>
                  </div>
                </div>
              </div>

              <h3>📈 User Breakdown</h3>
              <div className="usage-breakdown">
                <div className="usage-bar">
                  <div className="usage-label">Students</div>
                  <div className="usage-progress">
                    <div className="progress-fill student" style={{width: `${(users.filter(u => u.role === 'student').length / Math.max(users.length, 1)) * 100}%`}}></div>
                  </div>
                  <span className="usage-percent">{users.filter(u => u.role === 'student').length}</span>
                </div>
                <div className="usage-bar">
                  <div className="usage-label">Teachers</div>
                  <div className="usage-progress">
                    <div className="progress-fill teacher" style={{width: `${(users.filter(u => u.role === 'teacher').length / Math.max(users.length, 1)) * 100}%`}}></div>
                  </div>
                  <span className="usage-percent">{users.filter(u => u.role === 'teacher').length}</span>
                </div>
                <div className="usage-bar">
                  <div className="usage-label">Admins</div>
                  <div className="usage-progress">
                    <div className="progress-fill admin" style={{width: `${(users.filter(u => u.role === 'admin').length / Math.max(users.length, 1)) * 100}%`}}></div>
                  </div>
                  <span className="usage-percent">{users.filter(u => u.role === 'admin').length}</span>
                </div>
              </div>

              <h3>🌐 Language Distribution</h3>
              <div className="language-stats">
                <div className="lang-card">
                  <span className="lang-emoji">🇬🇧</span>
                  <p className="lang-name">English</p>
                  <p className="lang-percent">{languagePercent('english')}</p>
                </div>
                <div className="lang-card">
                  <span className="lang-emoji">🇮🇳</span>
                  <p className="lang-name">Hindi</p>
                  <p className="lang-percent">{languagePercent('hindi')}</p>
                </div>
                <div className="lang-card">
                  <span className="lang-emoji">🔀</span>
                  <p className="lang-name">Hinglish</p>
                  <p className="lang-percent">{languagePercent('hinglish')}</p>
                </div>
              </div>
              <h3>📉 Role Distribution Chart</h3>
              <div className="chart-panel">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={roleDistributionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      fill="#f59e0b"
                      label
                    />
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <h3>📊 System Metrics Chart</h3>
              <div className="chart-panel">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={systemMetricsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="section-desc" style={{marginTop: '1rem', fontSize: '0.9em'}}>
                Language stats will appear once users start making searches
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
