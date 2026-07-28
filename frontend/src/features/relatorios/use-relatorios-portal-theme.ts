import React from 'react';

import { useSettings } from '@/context/settings-context';

type PortalCssVars = React.CSSProperties & Record<`--${string}`, string>;

export interface RelatoriosPortalTheme {
  'data-theme': 'light' | 'dark';
  'data-density': 'compact' | 'cozy';
  style: PortalCssVars;
}

export function useRelatoriosPortalTheme(): RelatoriosPortalTheme {
  const { settings, resolvedTheme } = useSettings();

  return {
    'data-theme': resolvedTheme,
    'data-density': settings.density,
    style: {
      '--accent': settings.accent[0],
      '--accent-2': settings.accent[1],
      '--accent-tint': settings.accent[2],
    },
  };
}
