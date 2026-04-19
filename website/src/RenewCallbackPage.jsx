import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { apiGet } from './api.js'

export default function RenewCallbackPage() {
  const [status, setStatus] = useState('Verifying payment...')
  const [error, setError] = useState('')
  const orderId = useMemo(() => new URLSearchParams(window.location.search).get('order_id') || '', [])

  useEffect(() => {
    if (!orderId) {
      setError('Missing order_id in callback URL.')
      return
    }
    apiGet(`/cashfree/verify-order/${encodeURIComponent(orderId)}`)
      .then((response) => {
        const order = response.order || {}
        const orderStatus = String(order.order_status || '').toUpperCase()
        if (orderStatus === 'PAID') {
          setStatus('Payment verified successfully. Your membership has been renewed.')
          return
        }
        setStatus(`Payment status: ${orderStatus || 'UNKNOWN'}. If money was deducted, refresh after a few seconds.`)
      })
      .catch((err) => {
        setError(err.message || 'Payment verification failed')
      })
  }, [orderId])

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Card sx={{ width: 'min(520px, 100%)' }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Membership Renewal
            </Typography>
            <Typography variant="body1">{status}</Typography>
            {error ? <Typography sx={{ color: '#ff6b6b' }}>{error}</Typography> : null}
            <Button variant="contained" onClick={() => (window.location.href = '/')}>
              Back to Admin Panel
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
