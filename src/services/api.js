/**
 * api.js - API service layer for MINI-RAG frontend.
 *
 * Handles all HTTP requests to the backend API, including dynamic base URL selection and response parsing.
 */
// API Service Layer for EduRag

// Dynamically determine API URL based on environment
const getApiBaseUrl = () => {
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }

    return '/api';
};

const API_BASE_URL = getApiBaseUrl();
const LOCAL_API_FALLBACK = 'http://127.0.0.1:8000/api';

const isLocalhostFrontend = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
);

const getApiCandidates = () => {
    const candidates = [API_BASE_URL];
    if (isLocalhostFrontend && API_BASE_URL !== LOCAL_API_FALLBACK) {
        candidates.push(LOCAL_API_FALLBACK);
    }
    return candidates;
};

const parseResponseBody = async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    const normalized = text.trim().toLowerCase();
    const isLikelyHtml = contentType.includes('text/html') || normalized.startsWith('<!doctype') || normalized.startsWith('<html');

    if (!text) {
        return { data: null, isLikelyHtml };
    }

    if (contentType.includes('application/json')) {
        try {
            return { data: JSON.parse(text), isLikelyHtml };
        } catch {
            return { data: null, isLikelyHtml };
        }
    }

    try {
        return { data: JSON.parse(text), isLikelyHtml };
    } catch {
        return { data: text, isLikelyHtml };
    }
};

console.log('🚀 API candidates:', getApiCandidates());

// Token management
const getToken = () => localStorage.getItem('edurag_token');
const setToken = (token) => localStorage.setItem('edurag_token', token);
const removeToken = () => localStorage.removeItem('edurag_token');

// Get user from localStorage
const getUser = () => {
    const user = localStorage.getItem('edurag_user');
    if (!user) return null;
    try {
        return JSON.parse(user);
    } catch {
        removeUser();
        return null;
    }
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

    const candidates = getApiCandidates();
    let lastError = null;

    for (let index = 0; index < candidates.length; index++) {
        const baseUrl = candidates[index];
        const isLastCandidate = index === candidates.length - 1;

        try {
            const response = await fetch(`${baseUrl}${endpoint}`, {
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

            const { data, isLikelyHtml } = await parseResponseBody(response);

            // If HTML is returned from /api on localhost, try local FastAPI directly
            if (isLikelyHtml && !isLastCandidate) {
                continue;
            }

            if (!response.ok) {
                const detail = data && typeof data === 'object' ? data.detail : null;
                throw new Error(detail || `API request failed (${response.status})`);
            }

            return data;
        } catch (error) {
            lastError = error;
            if (!isLastCandidate) continue;
        }
    }

    throw lastError || new Error('API request failed. Backend may be unavailable.');
};

// ========================================
// Auth API
// ========================================
export const authAPI = {
    login: async (institutionId, password) => {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                institution_id: institutionId,
                password: password
            }),
        });

        if (!data || !data.access_token || !data.user) {
            throw new Error('Login failed: Invalid server response');
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
        return apiFetch(`/users/?skip=${skip}&limit=${limit}`);
    },

    getById: async (userId) => {
        return apiFetch(`/users/${userId}`);
    },

    getMe: async () => {
        return apiFetch('/users/me');
    },

    update: async (userId, updates) => {
        return apiFetch(`/users/${userId}`, {
            method: 'PATCH',
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

    deletePDF: async (pdfId) => {
        return apiFetch(`/rag/pdfs/${pdfId}`, {
            method: 'DELETE',
        });
    },

    indexPDF: async (pdfId) => {
        return apiFetch(`/rag/pdfs/${pdfId}/index`, {
            method: 'POST',
        });
    },

    getPDFDetail: async (pdfId) => {
        return apiFetch(`/rag/pdfs/${pdfId}`);
    },

    getSearchHistory: async (limit = 10) => {
        return apiFetch(`/rag/search-history?limit=${limit}`);
    },

    getTrendingTopics: async () => {
        return apiFetch('/rag/trending');
    },

    getPDFSummary: async (pdfId, language = 'english') => {
        return apiFetch(`/rag/pdfs/${pdfId}/summary?language=${encodeURIComponent(language)}`);
    },

    getRecommendations: async () => {
        return apiFetch('/rag/recommendations');
    },

    generateStudyPlan: async (query, language = 'english') => {
        return apiFetch('/rag/study-plan', {
            method: 'POST',
            body: JSON.stringify({ query, language }),
        });
    },
};

// ========================================
// Feedback API
// ========================================
export const feedbackAPI = {
    create: async (feedbackData) => {
        return apiFetch('/feedback/', {
            method: 'POST',
            body: JSON.stringify(feedbackData),
        });
    },

    getMine: async () => {
        return apiFetch('/feedback/mine');
    },

    getAll: async (status = null) => {
        const url = status ? `/feedback/?status=${status}` : '/feedback/';
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
    getAll: async () => {
        return apiFetch('/student-feedback');
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
