/**
 * HomePage.js - Landing page for MINI-RAG frontend.
 *
 * Displays animated background, navigation, and hero section for EduRag.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedBackground from '../components/AnimatedBackground';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <AnimatedBackground />
      <header className="navbar">
        <div className="navbar-logo">
          <img src="/images/logo.png" alt="EduRag Logo" className="logo-image" />
          <h1>EduRag</h1>
        </div>
        <nav className="nav-links">
          <button
            className="nav-btn login-btn"
            onClick={() => navigate('/auth')}
          >
            Login
          </button>
          <button
            className="nav-btn register-btn"
            onClick={() => navigate('/auth')}
          >
            Register
          </button>
        </nav>
      </header>

      <main className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Welcome to <span className="gradient-text">EduRag</span>
          </h1>
          <p className="hero-subtitle">
            Advanced RAG Model for Intelligent Learning
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🤖</div>
              <h3>AI-Powered Learning</h3>
              <p>Powered by Gemini AI for intelligent document analysis and understanding</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📄</div>
              <h3>PDF Management</h3>
              <p>Upload, manage, and organize your PDFs securely with Supabase</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>RAG Search</h3>
              <p>Smart search with vector embeddings for text and images</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🌍</div>
              <h3>Multi-Language Support</h3>
              <p>Learn in English, Hindi, and Hinglish for better understanding</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Student Community</h3>
              <p>Connect with peers, share feedback, and grow together</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Analytics Dashboard</h3>
              <p>Track your learning progress with detailed insights and metrics</p>
            </div>
          </div>

          <div className="cta-buttons">
            <button
              className="cta-btn primary"
              onClick={() => navigate('/auth')}
            >
              Get Started Now
            </button>
            <button className="cta-btn secondary">
              Learn More
            </button>
          </div>
        </div>

        <div className="hero-illustration">
          <div className="circle circle-1"></div>
          <div className="circle circle-2"></div>
          <div className="circle circle-3"></div>
        </div>
      </main>

      <section className="how-it-works">
        <h2>How EduRag Works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Register</h3>
            <p>Create your account with your institution ID</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <h3>Upload PDFs</h3>
            <p>Share your study materials and course documents</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <h3>Search & Learn</h3>
            <p>Use AI-powered RAG search to find answers instantly</p>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <h3>Grow Together</h3>
            <p>Collaborate, share feedback, and track your progress</p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>&copy; 2026 EduRag. All rights reserved. | Powered by Gemini AI & Supabase</p>
      </footer>
    </div>
  );
};

export default HomePage;
