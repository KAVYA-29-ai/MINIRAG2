import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import StudentDashboard from './StudentDashboard';
import { authAPI, ragAPI, usersAPI, studentFeedbackAPI } from '../services/api';

const mockNavigate = jest.fn();

jest.mock('../components/AnimatedBackground', () => () => <div data-testid="animated-bg" />);
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../services/api', () => ({
  authAPI: {
    getCurrentUser: jest.fn(),
    logout: jest.fn(),
  },
  ragAPI: {
    search: jest.fn(),
    getSearchHistory: jest.fn(),
    getRecommendations: jest.fn(),
    generateStudyPlan: jest.fn(),
  },
  usersAPI: {
    getStudents: jest.fn(),
    update: jest.fn(),
  },
  studentFeedbackAPI: {
    send: jest.fn(),
  },
}));

describe('StudentDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authAPI.getCurrentUser.mockReturnValue({
      id: 'uuid-student',
      name: 'Student One',
      institution_id: 'student001',
      role: 'student',
      avatar: 'male',
      status: 'active',
    });
    usersAPI.getStudents.mockResolvedValue([]);
    ragAPI.getSearchHistory.mockResolvedValue([
      {
        id: 1,
        query: 'What is osmosis?',
        language: 'english',
        results_count: 2,
        created_at: '2026-03-20T10:00:00Z',
      },
    ]);
    ragAPI.search.mockResolvedValue({
      total_results: 1,
      results: [],
      generated_answer: 'answer',
    });
    ragAPI.getRecommendations.mockResolvedValue({ recommendations: [] });
    ragAPI.generateStudyPlan.mockResolvedValue({ study_plan: 'plan' });
    studentFeedbackAPI.send.mockResolvedValue({ message: 'ok' });
  });

  test('renders history tab and shows history records', async () => {
    render(<StudentDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Student Dashboard' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Search History/i }));

    expect(screen.getByRole('heading', { name: 'Search History' })).toBeInTheDocument();
    expect(screen.getByText('What is osmosis?')).toBeInTheDocument();
  });
});
