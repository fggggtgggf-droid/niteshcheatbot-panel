import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Input,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiSend } from '../api.js'

export default function PaymentSettingsTab() {
  const [settings, setSettings] = useState({ qr: '', upi_id: '', min_deposit: 100, max_deposit: 5000, referral_reward_amount: 0 })
  const [message, setMessage] = useState('')

  useEffect(() => {
    apiGet('/payment-settings')
      .then(setSettings)
      .catch(() => setSettings({ qr: '', upi_id: '', min_deposit: 100, max_deposit: 5000, referral_reward_amount: 0 }))
  }, [])

  const saveSettings = async () => {
    await apiSend('/payment-settings', 'PUT', settings)
    setMessage('Payment settings saved')
  }

  const uploadQr = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setSettings((prev) => ({ ...prev, qr: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / Settings
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          UPI, QR, minimum deposit, aur maximum deposit yahin se control karo.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="UPI ID"
              value={settings.upi_id || ''}
              onChange={(event) => setSettings((prev) => ({ ...prev, upi_id: event.target.value }))}
              fullWidth
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Minimum Deposit"
                type="number"
                value={settings.min_deposit || 100}
                onChange={(event) => setSettings((prev) => ({ ...prev, min_deposit: Number(event.target.value || 100) }))}
                fullWidth
              />
              <TextField
                label="Maximum Deposit"
                type="number"
                value={settings.max_deposit || 5000}
                onChange={(event) => setSettings((prev) => ({ ...prev, max_deposit: Number(event.target.value || 5000) }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Referral Reward Amount"
              type="number"
              value={settings.referral_reward_amount || 0}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, referral_reward_amount: Number(event.target.value || 0) }))
              }
              fullWidth
            />
            <TextField
              label="Optional Static QR (Telegram file_id / Image URL / uploaded image)"
              value={settings.qr || ''}
              onChange={(event) => setSettings((prev) => ({ ...prev, qr: event.target.value }))}
              fullWidth
            />
            <Button variant="outlined" component="label">
              Upload QR Image
              <Input type="file" inputProps={{ accept: 'image/*' }} sx={{ display: 'none' }} onChange={uploadQr} />
            </Button>
            {String(settings.qr || '').startsWith('data:image/') || String(settings.qr || '').startsWith('http') ? (
              <Box
                component="img"
                src={settings.qr}
                alt="Payment QR"
                sx={{ width: 220, maxWidth: '100%', borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)' }}
              />
            ) : null}
            <Button variant="contained" onClick={saveSettings}>
              Save Payment Settings
            </Button>
            {message ? <Alert severity="success">{message}</Alert> : null}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
