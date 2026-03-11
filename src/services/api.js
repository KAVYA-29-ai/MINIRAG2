
/**
 * API Service Layer for EduRag
 * Provides wrapper functions for all backend API endpoints.
 */

// Dynamically determine API URL based on environment
/**
 * Get the base URL for the API depending on environment.
 * @returns {string} API base URL
 */
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

/**
 * Get a list of candidate API base URLs for failover.
 * @returns {string[]} Array of API base URLs
 */
const getApiCandidates = () => {
    const candidates = [API_BASE_URL];
    if (isLocalhostFrontend && API_BASE_URL !== LOCAL_API_FALLBACK) {
        candidates.push(LOCAL_API_FALLBACK);
    }
    return candidates;
};

/**
 * Parse the response body from a fetch request.
 * @param {Response} response - Fetch response object
 * @returns {Promise<{data: any, isLikelyHtml: boolean}>}
 */
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
/** Get the stored JWT token. */
const getToken = () => localStorage.getItem('edurag_token');
/** Store a JWT token. */
const setToken = (token) => localStorage.setItem('edurag_token', token);
/** Remove the JWT token. */
const removeToken = () => localStorage.removeItem('edurag_token');

// Get user from localStorage
/**
 * Get the current user object from localStorage.
 * @returns {object|null} User object or null
 */
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
/** Store the user object in localStorage. */
const setUser = (user) => localStorage.setItem('edurag_user', JSON.stringify(user));
/** Remove the user object from localStorage. */
const removeUser = () => localStorage.removeItem('edurag_user');

// Base fetch wrapper with auth
/**
 * Wrapper for fetch with authentication and error handling.
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
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
/**
 * Authentication API functions
 */
export const authAPI = {
    /**
     * Login with institution ID and password.
     * @param {string} institutionId
     * @param {string} password
     * @returns {Promise<object>} Auth response
     */
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
    
    /**
     * Register a new user.
     * @param {object} userData
     * @returns {Promise<object>} Registration response
     */
    register: async (userData) => {
        return apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    },
    
    /** Logout the current user. */
    logout: () => {
        removeToken();
        removeUser();
    },
    
    /** Get the current user object. */
    getCurrentUser: () => getUser(),
    /** Check if a user is authenticated. */
    isAuthenticated: () => !!getToken(),
};

// ========================================
// Users API
// ========================================
/**
 * Users API functions
 */
export const usersAPI = {
    /**
     * Get all users with pagination.
     * @param {number} skip
     * @param {number} limit
     * @returns {Promise<object[]>}
     */
    getAll: async (skip = 0, limit = 100) => {
        return apiFetch(`/users/?skip=${skip}&limit=${limit}`);
    },
    
    /**
     * Get a user by ID.
     * @param {string|number} userId
     * @returns {Promise<object>}
     */
    getById: async (userId) => {
        return apiFetch(`/users/${userId}`);
    },
    
    /** Get the current user's profile. */
    getMe: async () => {
        return apiFetch('/users/me');
    },
    
    /**
     * Update a user's profile.
     * @param {string|number} userId
     * @param {object} updates
     * @returns {Promise<object>}
     */
    update: async (userId, updates) => {
        return apiFetch(`/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    },
    
    /**
     * Update a user's role.
     * @param {string|number} userId
     * @param {string} newRole
     * @returns {Promise<object>}
     */
    updateRole: async (userId, newRole) => {
        return apiFetch(`/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role: newRole }),
        });
    },
    
    /**
     * Delete a user by ID.
     * @param {string|number} userId
     * @returns {Promise<object>}
     */
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
/**
 * RAG API functions
 */
export const ragAPI = {
    /**
     * Search documents using RAG.
     * @param {string} query
     * @param {string} language
     * @param {number} limit
     * @returns {Promise<object>}
     */
    search: async (query, language = 'english', limit = 5) => {
        return apiFetch('/rag/search', {
            method: 'POST',
            body: JSON.stringify({ query, language, limit }),
        });
    },
    
    /**
     * Upload a PDF file for indexing.
     * @param {File} file
     * @returns {Promise<object>}
     */
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
    
    /** Get all uploaded PDFs. */
    getPDFs: async () => {
        return apiFetch('/rag/pdfs');
    },
    
    /**
     * Delete a PDF by ID.
     * @param {string|number} pdfId
     * @returns {Promise<object>}
     */
    deletePDF: async (pdfId) => {
        return apiFetch(`/rag/pdfs/${pdfId}`, {
            method: 'DELETE',
        });
    },
    
    /**
     * Index a PDF by ID.
     * @param {string|number} pdfId
     * @returns {Promise<object>}
     */
    indexPDF: async (pdfId) => {
        return apiFetch(`/rag/pdfs/${pdfId}/index`, {
            method: 'POST',
        });
    },
    
    /**
     * Get details of a PDF by ID.
     * @param {string|number} pdfId
     * @returns {Promise<object>}
     */
    getPDFDetail: async (pdfId) => {
        return apiFetch(`/rag/pdfs/${pdfId}`);
    },
    
    /**
     * Get search history for the current user.
     * @param {number} limit
     * @returns {Promise<object[]>}
     */
    getSearchHistory: async (limit = 10) => {
        return apiFetch(`/rag/search-history?limit=${limit}`);
    },
    
    /** Get trending search topics. */
    getTrendingTopics: async () => {
        return apiFetch('/rag/trending');
    },
};

// ========================================
// Feedback API
// ========================================
/**
 * Feedback API functions
 */
export const feedbackAPI = {
    /**
     * Create a new feedback entry.
     * @param {object} feedbackData
     * @returns {Promise<object>}
     */
    create: async (feedbackData) => {
        return apiFetch('/feedback/', {
            method: 'POST',
            body: JSON.stringify(feedbackData),
        });
    },
    
    /** Get feedback submitted by the current user. */
    getMine: async () => {
        return apiFetch('/feedback/mine');
    },
    
    /**
     * Get all feedback entries, optionally filtered by status.
     * @param {string|null} status
     * @returns {Promise<object[]>}
     */
    getAll: async (status = null) => {
        const url = status ? `/feedback/?status=${status}` : '/feedback/';
        return apiFetch(url);
    },
    
    /**
     * Respond to a feedback entry.
     * @param {string|number} feedbackId
     * @param {string} responseText
     * @returns {Promise<object>}
     */
    respond: async (feedbackId, responseText) => {
        return apiFetch(`/feedback/${feedbackId}/respond`, {
            method: 'POST',
            body: JSON.stringify({ response: responseText }),
        });
    },
    
    /**
     * Archive a feedback entry.
     * @param {string|number} feedbackId
     * @returns {Promise<object>}
     */
    archive: async (feedbackId) => {
        return apiFetch(`/feedback/${feedbackId}/archive`, {
            method: 'PATCH',
        });
    },
    
    /** Get feedback statistics. */
    getStats: async () => {
        return apiFetch('/feedback/stats');
    },
};

// ========================================
// Student Feedback API (Anonymous)
// ========================================
/**
 * Student Feedback API functions (anonymous)
 */
export const studentFeedbackAPI = {
    /**
     * Send anonymous student feedback.
     * @param {string} message
     * @param {boolean} isAnonymous
     * @returns {Promise<object>}
     */
    send: async (message, isAnonymous = true) => {
        return apiFetch('/student-feedback', {
            method: 'POST',
            body: JSON.stringify({ message, is_anonymous: isAnonymous }),
        });
    },
    /** Get all student feedback entries. */
    getAll: async () => {
        return apiFetch('/student-feedback');
    },
};

// ========================================
// Analytics API
// ========================================
/**
 * Analytics API functions
 */
export const analyticsAPI = {
    /** Get system analytics summary. */
    getSummary: async () => {
        return apiFetch('/analytics/summary');
    },
    
    /** Get usage analytics grouped by user role. */
    getUsageByRole: async () => {
        return apiFetch('/analytics/usage-by-role');
    },
    
    /** Get language usage analytics. */
    getLanguageUsage: async () => {
        return apiFetch('/analytics/language-usage');
    },
    
    /**
     * Get daily query analytics for the last N days.
     * @param {number} days
     * @returns {Promise<object[]>}
     */
    getDailyQueries: async (days = 30) => {
        return apiFetch(`/analytics/daily-queries?days=${days}`);
    },
    
    /** Get student insights analytics. */
    getStudentInsights: async () => {
        return apiFetch('/analytics/student-insights');
    },
    
    /**
     * Get top queried topics.
     * @param {number} limit
     * @returns {Promise<object[]>}
     */
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
