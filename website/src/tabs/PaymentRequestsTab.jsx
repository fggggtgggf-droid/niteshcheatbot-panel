import { useEffect, useMemo, useState } from 'react'
import { Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { apiGet, apiSend } from '../api.js'

export default function PaymentRequestsTab() {
  const [requests, setRequests] = useState([])
  const [products, setProducts] = useState([])
  const [plans, setPlans] = useState([])
  const [users, setUsers] = useState([])

  const refresh = async () => {
    const [r, p, pl, u] = await Promise.all([
      apiGet('/payment-requests'),
      apiGet('/products'),
      apiGet('/plans'),
      apiGet('/users'),
    ])
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
          Yahan par submitted deposits approve ya reject kar sakte ho.
        </Typography>
      </Stack>

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
