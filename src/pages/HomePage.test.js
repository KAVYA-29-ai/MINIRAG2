import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import HomePage from './HomePage';

const mockNavigate = jest.fn();

jest.mock('../components/AnimatedBackground', () => () => <div data-testid="animated-bg" />);
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('HomePage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  test('renders hero content', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /welcome to/i })).toBeInTheDocument();
    expect(screen.getAllByText('EduRag').length).toBeGreaterThan(0);
    expect(screen.getByText('Get Started Now')).toBeInTheDocument();
  });

  test('navigates to auth when Login is clicked', () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });
});
