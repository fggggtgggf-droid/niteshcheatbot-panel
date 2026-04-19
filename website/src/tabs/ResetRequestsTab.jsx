import { useEffect, useMemo, useState } from 'react'
import { Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { apiGet, apiSend } from '../api.js'

export default function ResetRequestsTab() {
  const [requests, setRequests] = useState([])
  const [orders, setOrders] = useState([])

  const refresh = async () => {
    const [r, o] = await Promise.all([apiGet('/reset-requests'), apiGet('/orders')])
    setRequests(r)
    setOrders(o)
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  const ordersById = useMemo(
    () => Object.fromEntries(orders.map((item) => [String(item.id), item])),
    [orders],
  )

  const approve = async (id) => {
    await apiSend(`/reset-requests/${id}/approve`, 'POST', {})
    refresh()
  }

  const reject = async (id) => {
    await apiSend(`/reset-requests/${id}/reject`, 'POST', {})
    refresh()
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / HWID Resets
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Approve or reject user reset requests.
        </Typography>
      </Stack>

      {requests
        .slice()
        .sort((a, b) => String(b.id).localeCompare(String(a.id)))
        .map((item) => {
          const order = ordersById[String(item.order_id)] || {}
          return (
            <Card key={item.id}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Reset Request #{item.id} - {item.status}
                  </Typography>
                  <Typography variant="body2">
                    User: {item.telegram_id} | Order: {item.order_id} | Key: {order.license_key || '-'}
                  </Typography>
                  <Typography variant="body2">
                    Reset Usage: {order.reset_used || 0}/{order.reset_limit || 0}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color="success"
                      disabled={item.status !== 'pending'}
                      onClick={() => approve(item.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      disabled={item.status !== 'pending'}
                      onClick={() => reject(item.id)}
                    >
                      Reject
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )
        })}
    </Stack>
  )
}
