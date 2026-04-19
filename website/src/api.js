const API_BASE = '/api'

export function notifySettingsUpdated(settings) {
  window.dispatchEvent(new CustomEvent('panel-settings-updated', { detail: settings || {} }))
}

export function notifyToast(message, severity = 'success') {
  window.dispatchEvent(new CustomEvent('panel-toast', { detail: { message, severity } }))
}

function successMessageFor(path, method) {
  const normalized = `${method || ''}`.toUpperCase()
  if (normalized === 'POST' && path.includes('/approve')) return 'Approved successfully'
  if (normalized === 'POST' && path.includes('/reject')) return 'Rejected successfully'
  if (normalized === 'POST' && path.includes('/toggle-ban')) return 'Status updated successfully'
  if (normalized === 'POST' && path.includes('/admin-password')) return 'Password updated successfully'
  if (normalized === 'DELETE') return 'Deleted successfully'
  return 'Saved successfully'
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
  const result = await response.json()
  notifyToast(successMessageFor(path, method))
  return result
}
