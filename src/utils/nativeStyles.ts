import type { CSSProperties } from 'react';

export const transparentNative: CSSProperties = {
  background: 'transparent',
  backgroundColor: 'transparent',
};

export const shellBackground = (isNative: boolean): CSSProperties =>
  isNative ? transparentNative : { backgroundColor: '#0F172A' };
