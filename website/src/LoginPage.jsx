import { useState } from 'react'
import { Box, Button, Card, CardContent, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { apiSend } from './api.js'

export default function LoginPage({ brandName, onSuccess, forcedRole, panelLabel }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [role, setRole] = useState(forcedRole || 'admin')

  const submit = async () => {
    setError('')
    const result = await apiSend('/login', 'POST', { email, password, role })
    if (result.success) {
      sessionStorage.setItem('admin-auth', '1')
      sessionStorage.setItem('admin-role', result.role || role)
      if (result.admin_id) {
        sessionStorage.setItem('panel-admin-id', String(result.admin_id))
      } else {
        sessionStorage.removeItem('panel-admin-id')
      }
      if (result.login_email) {
        sessionStorage.setItem('panel-login-email', String(result.login_email))
      } else {
        sessionStorage.removeItem('panel-login-email')
      }
      onSuccess(result.role || role)
      return
    }
    setError(role === 'admin' ? 'Invalid email/password or master password' : 'Invalid password')
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
      }}
    >
      <Card sx={{ width: 'min(420px, 100%)' }}>
        <CardContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                {brandName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {panelLabel || 'Panel login'}
              </Typography>
            </Box>
            {!forcedRole ? (
              <ToggleButtonGroup
                value={role}
                exclusive
                onChange={(_, value) => value && setRole(value)}
                color="secondary"
                fullWidth
              >
                <ToggleButton value="admin">Admin</ToggleButton>
                <ToggleButton value="owner">Owner</ToggleButton>
              </ToggleButtonGroup>
            ) : null}
            {role === 'admin' ? (
              <TextField
                label="Email (recommended)"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                fullWidth
              />
            ) : null}
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              fullWidth
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
            {error ? (
              <Typography variant="body2" sx={{ color: '#ff6b6b' }}>
                {error}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={submit}>
              Login
            </Button>
            {role === 'admin' ? (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Email login ties your panel subscription to one account. Telegram Chat ID stays optional and is only for bot access later.
              </Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
