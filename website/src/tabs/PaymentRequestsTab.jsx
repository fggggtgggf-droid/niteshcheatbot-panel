import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Input,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiSend } from '../api.js'

export default function PaymentRequestsTab() {
  const [settings, setSettings] = useState({ qr: '', upi_id: '', use_upi: 1, use_gateway: 0 })
  const [globalSettings, setGlobalSettings] = useState({})
  const [requests, setRequests] = useState([])
  const [products, setProducts] = useState([])
  const [plans, setPlans] = useState([])
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const [s, r, p, pl] = await Promise.all([
      apiGet('/payment-settings'),
      apiGet('/payment-requests'),
      apiGet('/products'),
      apiGet('/plans'),
    ])
    const settingsPayload = await apiGet('/settings')
    setSettings(s)
    setGlobalSettings(settingsPayload)
    setRequests(r)
    setProducts(p)
    setPlans(pl)
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  const productName = useMemo(
    () => Object.fromEntries(products.map((item) => [String(item.id), item.name])),
    [products],
  )
  const planName = useMemo(
    () => Object.fromEntries(plans.map((item) => [String(item.id), item.name])),
    [plans],
  )

  const saveSettings = async () => {
    await apiSend('/payment-settings', 'PUT', settings)
    const secretPayload = {
      cashfree_app_id: globalSettings.cashfree_app_id || '',
    }
    if ((globalSettings.cashfree_secret_key || '').trim()) {
      secretPayload.cashfree_secret_key = globalSettings.cashfree_secret_key
    }
    await apiSend('/settings', 'PUT', secretPayload)
    setMessage('Payment settings saved')
    refresh()
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

  const approve = async (id) => {
    await apiSend(`/payment-requests/${id}/approve`, 'POST', {})
    refresh()
  }

  const reject = async (id) => {
    await apiSend(`/payment-requests/${id}/reject`, 'POST', {})
    refresh()
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / Payment Requests
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Gateway mode on ho to QR field ignore hoga. QR mode sirf manual deposit ke liye use karo.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            {Number(settings.use_gateway) !== 1 ? (
              <Stack spacing={2}>
                <TextField
                  label="UPI ID"
                  value={settings.upi_id || ''}
                  onChange={(event) => setSettings((prev) => ({ ...prev, upi_id: event.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Payment QR (Image URL / Telegram file_id / uploaded image)"
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
              </Stack>
            ) : null}
            <TextField
              label="Cashfree App ID"
              value={globalSettings.cashfree_app_id || ''}
              onChange={(event) => setGlobalSettings((prev) => ({ ...prev, cashfree_app_id: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Cashfree Secret Key"
              value={globalSettings.cashfree_secret_key || ''}
              onChange={(event) => setGlobalSettings((prev) => ({ ...prev, cashfree_secret_key: event.target.value }))}
              placeholder="Leave blank to keep current secret"
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Number(settings.use_upi) === 1}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, use_upi: event.target.checked ? 1 : 0 }))
                    }
                  />
                }
                label="QR Deposit Enabled"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={Number(settings.use_gateway) === 1}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, use_gateway: event.target.checked ? 1 : 0 }))
                    }
                  />
                }
                label="Cashfree Gateway Mode"
              />
            </Stack>
            <Button variant="contained" onClick={saveSettings}>
              Save Payment Settings
            </Button>
            {message && <Alert severity="success">{message}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {requests
        .slice()
        .sort((a, b) => String(b.id).localeCompare(String(a.id)))
        .map((item) => (
          <Card key={item.id}>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Request #{item.id} - {item.status}
                </Typography>
                <Typography variant="body2">
                  Type: {item.type || 'wallet_topup'} | User: {item.telegram_id} | Product:{' '}
                  {productName[String(item.product_id)] || '-'} | Plan: {planName[String(item.plan_id)] || '-'} |
                  Amount: Rs {item.amount}
                </Typography>
                {item.type === 'panel_renew' ? (
                  <Typography variant="body2">
                    Panel Renew: {item.plan_name || '-'} | Days: {item.renew_days || 0} | Admin ID: {item.admin_id || '-'}
                  </Typography>
                ) : null}
                <Typography variant="body2">UPI Ref: {item.upi_ref || '-'}</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    color="success"
                    disabled={item.status !== 'submitted'}
                    onClick={() => approve(item.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={item.status !== 'submitted'}
                    onClick={() => reject(item.id)}
                  >
                    Reject
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
    </Stack>
  )
}
