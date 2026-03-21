/**
 * LoginRegister.js - Auth page for MINI-RAG frontend.
 *
 * Handles user login and registration forms, validation, and API calls.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedBackground from '../components/AnimatedBackground';
import { authAPI } from '../services/api';
import './LoginRegister.css';

const LoginRegister = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
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
      const errorMsg = typeof err.message === 'string' ? err.message : 'Authentication failed';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
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
            </div>
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
