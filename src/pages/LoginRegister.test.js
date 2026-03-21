import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import LoginRegister from './LoginRegister';
import { authAPI } from '../services/api';

const mockNavigate = jest.fn();

jest.mock('../components/AnimatedBackground', () => () => <div data-testid="animated-bg" />);
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../services/api', () => ({
  authAPI: {
    login: jest.fn(),
    register: jest.fn(),
  },
}));

describe('LoginRegister', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('toggles from login to register mode', () => {
    render(<LoginRegister />);

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
  });

  test('submits login and redirects student to dashboard', async () => {
    authAPI.login.mockResolvedValue({
      user: { role: 'student' },
      access_token: 'token',
    });

    render(<LoginRegister />);

    fireEvent.change(screen.getByLabelText('Institution ID'), {
      target: { name: 'institutionId', value: '1001' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { name: 'password', value: 'pass123' },
    });

    const loginForm = screen.getByLabelText('Password').closest('form');
    fireEvent.click(within(loginForm).getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(authAPI.login).toHaveBeenCalledWith('1001', 'pass123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });
});
