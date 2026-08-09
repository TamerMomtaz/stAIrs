import { describe, it, expect } from 'vitest';
import {
  API, GOLD, GOLD_L, TEAL, CHAMPAGNE, DEEP, BORDER,
  typeColors, typeIcons, typeLabels, typeLabelsAr,
  glass, inputCls, labelCls,
} from '../constants';

describe('Constants', () => {
  it('exports API URL', () => {
    expect(API).toBe('https://stairs-production.up.railway.app');
  });

  // Colour constants hold a token reference, not a value. Asserting the hex
  // would pin the palette to one theme and make stage 3 a test rewrite; what
  // matters is that every one of them resolves through tokens.css, because a
  // literal that slipped back in is exactly the regression this guards.
  it('exposes colours as tokens, never as literals', () => {
    for (const [name, value] of Object.entries({ GOLD, GOLD_L, TEAL, CHAMPAGNE, DEEP, BORDER })) {
      expect(value, name).toMatch(/^(var\(--|rgb\(var\(--)/);
      expect(value, name).not.toMatch(/#[0-9a-f]{3}/i);
    }
  });

  it('names its accent tokens by role, not by colour', () => {
    expect(GOLD).toBe('var(--accent)');
    expect(GOLD_L).toBe('var(--accent-hi)');
    expect(DEEP).toBe('var(--surface-app)');
  });

  it('has all element type colors', () => {
    const types = ['vision', 'objective', 'key_result', 'initiative', 'task'];
    types.forEach(t => {
      expect(typeColors[t]).toBeDefined();
    });
  });

  it('has all element type icons', () => {
    const types = ['vision', 'objective', 'key_result', 'initiative', 'task'];
    types.forEach(t => {
      expect(typeIcons[t]).toBeDefined();
    });
  });

  it('has English type labels for core types', () => {
    expect(typeLabels.vision).toBe('Vision');
    expect(typeLabels.objective).toBe('Objective');
    expect(typeLabels.key_result).toBe('Key Result');
    expect(typeLabels.initiative).toBe('Initiative');
    expect(typeLabels.task).toBe('Task');
  });

  it('has Arabic type labels for core types', () => {
    expect(typeLabelsAr.vision).toBe('الرؤية');
    expect(typeLabelsAr.objective).toBe('الهدف');
  });

  it('glass helper returns valid style object', () => {
    const style = glass(0.5);
    expect(style).toHaveProperty('background');
    expect(style).toHaveProperty('border');
    expect(style.background).toContain('0.5');
  });

  it('glass uses default opacity', () => {
    const style = glass();
    expect(style.background).toContain('0.6');
  });

  it('inputCls is a non-empty string', () => {
    expect(typeof inputCls).toBe('string');
    expect(inputCls.length).toBeGreaterThan(0);
  });

  it('labelCls is a non-empty string', () => {
    expect(typeof labelCls).toBe('string');
    expect(labelCls.length).toBeGreaterThan(0);
  });
});
