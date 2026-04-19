import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import './index.css'
import App from './App.jsx'
import { apiGet } from './api.js'

function buildTheme(settings) {
  const primary = settings.ui_primary_color || '#ff315f'
  const accent = settings.ui_accent_color || '#ff7a18'
  const surface = settings.ui_surface_color || '#121016'
  const surfaceAlt = settings.ui_surface_alt_color || '#1a141d'
  const buttonBg = settings.button_bg_color || primary
  const buttonText = settings.button_text_color || '#fff5f7'
  const buttonHover = settings.button_hover_color || accent
  const buttonDisabled = settings.button_disabled_color || '#534049'

  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: primary },
      secondary: { main: accent },
      background: { default: '#09070b', paper: surface },
      text: { primary: '#fff5f7', secondary: 'rgba(255,245,247,0.72)' },
    },
    typography: {
      fontFamily: 'Space Grotesk, sans-serif',
    },
    shape: { borderRadius: 18 },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: `linear-gradient(180deg, ${surface} 0%, ${surfaceAlt} 100%)`,
            border: `1px solid ${primary}33`,
            boxShadow: `0 22px 54px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.02)`,
            position: 'relative',
            overflow: 'hidden',
            backdropFilter: 'blur(12px)',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(120deg, transparent 0%, ${primary}10 35%, transparent 70%)`,
              transform: 'translateX(-100%)',
              animation: 'panelShine 9s linear infinite',
              pointerEvents: 'none',
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: 'rgba(10, 7, 12, 0.68)',
            borderBottom: `1px solid ${primary}22`,
            boxShadow: '0 8px 30px rgba(0,0,0,0.28)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 14,
            paddingInline: 18,
            transition: 'transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease, filter 160ms ease',
          },
          contained: {
            backgroundColor: buttonBg,
            color: buttonText,
            boxShadow: `0 12px 28px ${primary}44`,
            '&:hover': {
              backgroundColor: buttonHover,
              transform: 'translateY(-1px)',
              filter: 'brightness(1.06)',
            },
            '&.Mui-disabled': {
              backgroundColor: buttonDisabled,
              color: 'rgba(255,255,255,0.58)',
            },
          },
          outlined: {
            borderColor: `${primary}66`,
            '&:hover': {
              borderColor: primary,
              backgroundColor: `${primary}12`,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: '#0d0b10',
            borderRadius: 14,
            '& fieldset': {
              borderColor: `${primary}30`,
            },
            '&:hover fieldset': {
              borderColor: `${primary}66`,
            },
            '&.Mui-focused fieldset': {
              borderColor: accent,
              boxShadow: `0 0 0 2px ${accent}22`,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { color: 'rgba(255,245,247,0.62)' },
        },
      },
    },
  })
}

function ThemedRoot() {
  const [settings, setSettings] = useState({})

  useEffect(() => {
    apiGet('/settings').then(setSettings).catch(() => setSettings({}))
    const onSettingsUpdated = (event) => {
      setSettings((current) => ({ ...current, ...(event.detail || {}) }))
    }
    window.addEventListener('panel-settings-updated', onSettingsUpdated)
    return () => window.removeEventListener('panel-settings-updated', onSettingsUpdated)
  }, [])

  return (
    <ThemeProvider theme={buildTheme(settings)}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemedRoot />
  </StrictMode>,
)
