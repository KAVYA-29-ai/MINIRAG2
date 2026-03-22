/**
 * LoginRegister.js - Auth page for MINI-RAG frontend.
 *
 * Handles user login and registration forms, validation, and API calls.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AnimatedBackground from '../components/AnimatedBackground';
import { authAPI } from '../services/api';
import './LoginRegister.css';

const LoginRegister = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLink, setResetLink] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    institutionId: '',
    email: '',
    confirmEmail: '',
    password: '',
    confirmPassword: ''
  });

  const normalizeAuthError = (message, mode) => {
    const raw = typeof message === 'string' ? message : '';
    const lower = raw.toLowerCase();

    if (lower.includes('invalid credentials')) {
      return 'Wrong Institution ID or password. Please try again.';
    }
    if (lower.includes('verify your email')) {
      return 'Your email is not verified yet. Please verify first, then login.';
    }
    if (lower.includes('already exists')) {
      return 'An account with this Institution ID already exists.';
    }
    if (lower.includes('rate limit')) {
      return 'Too many attempts. Please wait and try again.';
    }
    if (mode === 'login') {
      return raw || 'Login failed. Please check your credentials.';
    }
    return raw || 'Registration failed. Please check your details and retry.';
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('reset_token');
    if (token) {
      setIsLogin(true);
      setShowForgotPassword(false);
      setShowResetForm(true);
      setResetToken(token);
      setSuccess('Reset token detected. Enter your new password below.');
      setError('');
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'institutionId') {
      // Only allow numbers
      if (!/^\d*$/.test(value)) {
        setError('Institution ID must be numeric');
        return;
      }
    }
    setFormData(prev => ({
      ...prev,
      [name]: name === 'institutionId' ? value.replace(/\D/g, '') : value
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isLogin) {
        const response = await authAPI.login(formData.institutionId, formData.password);
        const user = response.user;

        if (user.role === 'admin') {
          navigate('/admin-dashboard');
        } else if (user.role === 'teacher') {
          navigate('/teacher-dashboard');
        } else {
          navigate('/dashboard');
        }
      } else {
        if (!/^\d+$/.test(formData.institutionId)) {
          setError('Institution ID must be numeric');
          setLoading(false);
          return;
        }
        if (formData.email !== formData.confirmEmail) {
          setError('Email addresses do not match');
          setLoading(false);
          return;
        }
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        const response = await authAPI.register({
          name: formData.name,
          institution_id: formData.institutionId,
          email: formData.email,
          password: formData.password,
          avatar: 'male',
          role: 'student'
        });

        if (response.requires_verification) {
          setSuccess(response.message || 'Registration successful. Please verify your email before login.');
          setIsLogin(true);
          return;
        }

        const user = response.user;
        if (user.role === 'admin') {
          navigate('/admin-dashboard');
        } else if (user.role === 'teacher') {
          navigate('/teacher-dashboard');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      const errorMsg = normalizeAuthError(err.message, isLogin ? 'login' : 'register');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setShowForgotPassword(false);
    setShowResetForm(false);
    setResetEmail('');
    setResetToken('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetLink('');
    setError('');
    setSuccess('');
    setFormData({
      name: '',
      institutionId: '',
      email: '',
      confirmEmail: '',
      password: '',
      confirmPassword: ''
    });
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setError('Please enter your email address');
      return;
    }

    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await authAPI.forgotPassword(resetEmail.trim());
      setSuccess(response?.message || 'Password reset email sent.');
      if (response?.reset_url) {
        setResetLink(response.reset_url);
        setShowResetForm(true);
        setShowForgotPassword(false);
        try {
          const token = new URL(response.reset_url).searchParams.get('reset_token') || '';
          setResetToken(token);
        } catch {
          setResetToken('');
        }
        toast.success('Email service unavailable. Opened direct reset flow.');
      } else {
        toast.success('Reset link sent to your email.');
        setShowForgotPassword(false);
      }
      setResetEmail('');
    } catch (err) {
      const errorMsg = typeof err.message === 'string' ? err.message : 'Unable to send reset email';
      setError(errorMsg);
      toast.error('Failed to send reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDirectResetPassword = async (e) => {
    e.preventDefault();
    if (!resetToken.trim()) {
      setError('Reset token missing. Request a new reset link.');
      return;
    }
    if (resetNewPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await authAPI.resetPassword(resetToken.trim(), resetNewPassword);
      setSuccess(response?.message || 'Password reset successful.');
      toast.success('Password reset successful. Please login.');
      setShowResetForm(false);
      setResetToken('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setResetLink('');
      if (window.location.search.includes('reset_token=')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err) {
      const errorMsg = typeof err.message === 'string' ? err.message : 'Unable to reset password';
      setError(errorMsg);
      toast.error('Password reset failed.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AnimatedBackground />
      <div className="auth-container">
        <div className="auth-header">
          <img src="/images/logo.png" alt="EduRag Logo" className="auth-logo-image" />
          <h1>EduRag</h1>
        </div>

        <div className="auth-box">
          <div className="form-toggle">
            <button
              className={`toggle-btn ${isLogin ? 'active' : ''}`}
              onClick={() => !isLogin && toggleMode()}
            >
              Login
            </button>
            <button
              className={`toggle-btn ${!isLogin ? 'active' : ''}`}
              onClick={() => isLogin && toggleMode()}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleChange}
                  required={!isLogin}
                  disabled={loading}
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="institutionId">Institution ID</label>
              <input
                type="number"
                id="institutionId"
                name="institutionId"
                placeholder="Enter your institution ID"
                value={formData.institutionId}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="email">Email (Gmail)</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Enter your Gmail address"
                  value={formData.email}
                  onChange={handleChange}
                  required={!isLogin}
                  disabled={loading}
                />
              </div>
            )}

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="confirmEmail">Confirm Email</label>
                <input
                  type="email"
                  id="confirmEmail"
                  name="confirmEmail"
                  placeholder="Re-enter your Gmail address"
                  value={formData.confirmEmail}
                  onChange={handleChange}
                  required={!isLogin}
                  disabled={loading}
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>

            {!isLogin && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required={!isLogin}
                  disabled={loading}
                />
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
            </button>
          </form>

          {isLogin && (
            <div className="auth-info-note">
              <p>💡 Login with your Institution ID and password</p>
              <button
                type="button"
                className="toggle-link"
                onClick={() => {
                  setShowForgotPassword((prev) => !prev);
                  setShowResetForm(false);
                  setError('');
                  setSuccess('');
                }}
              >
                {showForgotPassword ? 'Cancel reset' : 'Forgot Password?'}
              </button>
            </div>
          )}

          {isLogin && showForgotPassword && (
            <form className="auth-form" onSubmit={handleForgotPassword}>
              <div className="form-group">
                <label htmlFor="resetEmail">Reset Email</label>
                <input
                  type="email"
                  id="resetEmail"
                  name="resetEmail"
                  placeholder="Enter your registered email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  disabled={resetLoading}
                />
              </div>
              <button type="submit" className="submit-btn" disabled={resetLoading}>
                {resetLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          {isLogin && showResetForm && (
            <form className="auth-form" onSubmit={handleDirectResetPassword}>
              <div className="form-group">
                <label htmlFor="resetToken">Reset Token</label>
                <input
                  type="text"
                  id="resetToken"
                  name="resetToken"
                  placeholder="Paste reset token"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                  disabled={resetLoading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="resetNewPassword">New Password</label>
                <input
                  type="password"
                  id="resetNewPassword"
                  name="resetNewPassword"
                  placeholder="Enter new password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  required
                  disabled={resetLoading}
                />
              </div>
              <div className="form-group">
                <label htmlFor="resetConfirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="resetConfirmPassword"
                  name="resetConfirmPassword"
                  placeholder="Re-enter new password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  required
                  disabled={resetLoading}
                />
              </div>
              <button type="submit" className="submit-btn" disabled={resetLoading}>
                {resetLoading ? 'Resetting...' : 'Reset Password'}
              </button>
              {resetLink && (
                <p style={{ marginTop: '0.75rem' }}>
                  Direct reset link: <a href={resetLink}>{resetLink}</a>
                </p>
              )}
            </form>
          )}

          <div className="form-footer">
            <p>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                className="toggle-link"
                onClick={toggleMode}
              >
                {isLogin ? 'Register here' : 'Login here'}
              </button>
            </p>
          </div>
        </div>

        <button
          className="back-btn"
          onClick={() => navigate('/')}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
};

export default LoginRegister;
