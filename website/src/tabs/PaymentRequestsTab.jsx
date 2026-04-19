import { useEffect, useMemo, useState } from 'react'
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

export default function PaymentRequestsTab() {
  const [settings, setSettings] = useState({ qr: '', upi_id: '', min_deposit: 100, max_deposit: 5000 })
  const [requests, setRequests] = useState([])
  const [products, setProducts] = useState([])
  const [plans, setPlans] = useState([])
  const [users, setUsers] = useState([])
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const [s, r, p, pl, u] = await Promise.all([
      apiGet('/payment-settings'),
      apiGet('/payment-requests'),
      apiGet('/products'),
      apiGet('/plans'),
      apiGet('/users'),
    ])
    setSettings(s)
    setRequests(r)
    setProducts(p)
    setPlans(pl)
    setUsers(u)
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
  const userMeta = useMemo(
    () =>
      Object.fromEntries(
        users.map((item) => [
          String(item.telegram_id),
          {
            username: item.username || '',
            first_name: item.first_name || 'User',
            balance: Number(item.balance || 0),
          },
        ]),
      ),
    [users],
  )

  const saveSettings = async () => {
    await apiSend('/payment-settings', 'PUT', settings)
    setMessage('Deposit settings saved')
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
          UPI ID do, optional static QR do, aur users bot me amount choose karke payment request bhej denge.
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
              Save Deposit Settings
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
                <Typography variant="body2">
                  Username: @{item.username || userMeta[String(item.telegram_id)]?.username || '-'} | Name:{' '}
                  {item.first_name || userMeta[String(item.telegram_id)]?.first_name || 'User'} | Balance: Rs{' '}
                  {Math.round(Number(userMeta[String(item.telegram_id)]?.balance ?? item.user_balance ?? 0))}
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
