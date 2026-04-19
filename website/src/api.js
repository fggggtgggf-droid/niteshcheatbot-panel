const API_BASE = '/api'

export function notifySettingsUpdated(settings) {
  window.dispatchEvent(new CustomEvent('panel-settings-updated', { detail: settings || {} }))
}

export async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) {
    throw new Error('API error')
  }
  return response.json()
}

export async function apiSend(path, method, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error('API error')
  }
  return response.json()
}
