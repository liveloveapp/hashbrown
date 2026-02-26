import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IconWindBarb } from './IconWindBarb';

describe('IconWindBarb', () => {
  it('renders a calm circle when speed is below the calm threshold', () => {
    render(<IconWindBarb speedKnots={0} directionDegrees={0} />);

    expect(screen.getByTestId('wind-barb-calm')).toBeInTheDocument();
    expect(screen.queryByTestId('wind-barb-stem')).not.toBeInTheDocument();
  });

  it('renders correct barbs for 15 knots', () => {
    render(<IconWindBarb speedKnots={15} directionDegrees={270} />);

    expect(screen.getByTestId('wind-barb-stem')).toBeInTheDocument();
    expect(screen.getAllByTestId('wind-barb-long')).toHaveLength(1);
    expect(screen.getAllByTestId('wind-barb-short')).toHaveLength(1);
  });

  it('renders flags and barbs correctly for 65 knots', () => {
    render(<IconWindBarb speedKnots={65} directionDegrees={180} />);

    expect(screen.getAllByTestId('wind-barb-flag')).toHaveLength(1);
    expect(screen.getAllByTestId('wind-barb-long')).toHaveLength(1);
    expect(screen.getAllByTestId('wind-barb-short')).toHaveLength(1);
  });

  it('orients the stem correctly based on direction', () => {
    const { rerender } = render(
      <IconWindBarb speedKnots={10} directionDegrees={0} />,
    );

    const stemNorth = screen.getByTestId('wind-barb-stem');
    expect(stemNorth.getAttribute('x2')).toBe('12');
    expect(stemNorth.getAttribute('y2')).toBe('4');

    rerender(<IconWindBarb speedKnots={10} directionDegrees={90} />);
    const stemEast = screen.getByTestId('wind-barb-stem');
    expect(stemEast.getAttribute('x2')).toBe('20');
    expect(stemEast.getAttribute('y2')).toBe('12');
  });
});
