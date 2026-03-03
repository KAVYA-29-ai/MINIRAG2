// API Service Layer for EduRag

// Dynamically determine API URL based on environment
const getApiBaseUrl = () => {
    // If environment variable is set, use it
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }
    
    // If running in GitHub Codespaces, construct the backend URL
    if (window.location.hostname.includes('.app.github.dev')) {
        // Extract the codespace name and construct backend URL
        const hostname = window.location.hostname;
        // Replace port 3000 with 8000 in the URL
        const backendHost = hostname.replace('-3000.', '-8000.');
        return `https://${backendHost}/api`;
    }
    
    // Default to localhost for local development
    return 'http://localhost:8000/api';
};

const API_BASE_URL = getApiBaseUrl();

// Token management
const getToken = () => localStorage.getItem('edurag_token');
const setToken = (token) => localStorage.setItem('edurag_token', token);
const removeToken = () => localStorage.removeItem('edurag_token');

// Get user from localStorage
const getUser = () => {
    const user = localStorage.getItem('edurag_user');
    return user ? JSON.parse(user) : null;
};
const setUser = (user) => localStorage.setItem('edurag_user', JSON.stringify(user));
const removeUser = () => localStorage.removeItem('edurag_user');

// Base fetch wrapper with auth
const apiFetch = async (endpoint, options = {}) => {
    const token = getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
        removeToken();
        removeUser();
        window.location.href = '/auth';
        throw new Error('Session expired. Please login again.');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.detail || 'API request failed');
    }
    
    return data;
};

// ========================================
// Auth API
// ========================================
export const authAPI = {
    login: async (institutionId, password) => {
        const formData = new URLSearchParams();
        formData.append('username', institutionId);
        formData.append('password', password);
        
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData,
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Login failed');
        }
        
        // Store token and user data
        setToken(data.access_token);
        setUser(data.user);
        
        return data;
    },
    
    register: async (userData) => {
        return apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    },
    
    logout: () => {
        removeToken();
        removeUser();
    },
    
    getCurrentUser: () => getUser(),
    isAuthenticated: () => !!getToken(),
};

// ========================================
// Users API
// ========================================
export const usersAPI = {
    getAll: async (skip = 0, limit = 100) => {
        return apiFetch(`/users?skip=${skip}&limit=${limit}`);
    },
    
    getById: async (userId) => {
        return apiFetch(`/users/${userId}`);
    },
    
    getMe: async () => {
        return apiFetch('/users/me');
    },
    
    update: async (userId, updates) => {
        return apiFetch(`/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    },
    
    updateRole: async (userId, newRole) => {
        return apiFetch(`/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role: newRole }),
        });
    },
    
    delete: async (userId) => {
        return apiFetch(`/users/${userId}`, {
            method: 'DELETE',
        });
    },
    
    getStudents: async () => {
        return apiFetch('/users/students');
    },
    
    getTeachers: async () => {
        return apiFetch('/users/teachers');
    },
    
    getStats: async () => {
        return apiFetch('/users/stats');
    },
};

// ========================================
// RAG API
// ========================================
export const ragAPI = {
    search: async (query, language = 'english', limit = 5) => {
        return apiFetch('/rag/search', {
            method: 'POST',
            body: JSON.stringify({ query, language, limit }),
        });
    },
    
    uploadPDF: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        
        const token = getToken();
        const response = await fetch(`${API_BASE_URL}/rag/upload-pdf`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Upload failed');
        }
        
        return data;
    },
    
    getPDFs: async () => {
        return apiFetch('/rag/pdfs');
    },
    
    getSearchHistory: async (limit = 10) => {
        return apiFetch(`/rag/search-history?limit=${limit}`);
    },
    
    getTrendingTopics: async () => {
        return apiFetch('/rag/trending');
    },
};

// ========================================
// Feedback API
// ========================================
export const feedbackAPI = {
    create: async (feedbackData) => {
        return apiFetch('/feedback', {
            method: 'POST',
            body: JSON.stringify(feedbackData),
        });
    },
    
    getMine: async () => {
        return apiFetch('/feedback/mine');
    },
    
    getAll: async (status = null) => {
        const url = status ? `/feedback?status=${status}` : '/feedback';
        return apiFetch(url);
    },
    
    respond: async (feedbackId, responseText) => {
        return apiFetch(`/feedback/${feedbackId}/respond`, {
            method: 'POST',
            body: JSON.stringify({ response: responseText }),
        });
    },
    
    archive: async (feedbackId) => {
        return apiFetch(`/feedback/${feedbackId}/archive`, {
            method: 'PATCH',
        });
    },
    
    getStats: async () => {
        return apiFetch('/feedback/stats');
    },
};

// ========================================
// Student Feedback API (Anonymous)
// ========================================
export const studentFeedbackAPI = {
    send: async (message, isAnonymous = true) => {
        return apiFetch('/student-feedback', {
            method: 'POST',
            body: JSON.stringify({ message, is_anonymous: isAnonymous }),
        });
    },
};

// ========================================
// Analytics API
// ========================================
export const analyticsAPI = {
    getSummary: async () => {
        return apiFetch('/analytics/summary');
    },
    
    getUsageByRole: async () => {
        return apiFetch('/analytics/usage-by-role');
    },
    
    getLanguageUsage: async () => {
        return apiFetch('/analytics/language-usage');
    },
    
    getDailyQueries: async (days = 30) => {
        return apiFetch(`/analytics/daily-queries?days=${days}`);
    },
    
    getStudentInsights: async () => {
        return apiFetch('/analytics/student-insights');
    },
    
    getTopTopics: async (limit = 10) => {
        return apiFetch(`/analytics/top-topics?limit=${limit}`);
    },
};

// ========================================
// Export default API object
// ========================================
const api = {
    auth: authAPI,
    users: usersAPI,
    rag: ragAPI,
    feedback: feedbackAPI,
    studentFeedback: studentFeedbackAPI,
    analytics: analyticsAPI,
};

export default api;
