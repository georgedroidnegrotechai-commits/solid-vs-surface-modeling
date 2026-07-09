import { describe, it, expect } from 'vitest';

// Simple pure functions extracted conceptually for test (demo of CI test)

function calculateBoxVolume(w: number, h: number, d: number): number {
  return w * h * d;
}

function isWatertight(modelType: string): boolean {
  return modelType !== 'surface-patch';
}

describe('Solid vs Surface Metrics Utils', () => {
  it('calculates box volume correctly', () => {
    expect(calculateBoxVolume(4, 3, 2)).toBe(24);
  });

  it('solid models are watertight', () => {
    expect(isWatertight('box')).toBe(true);
    expect(isWatertight('cylinder')).toBe(true);
  });

  it('surface models are open by nature', () => {
    expect(isWatertight('surface-patch')).toBe(false);
  });
});
