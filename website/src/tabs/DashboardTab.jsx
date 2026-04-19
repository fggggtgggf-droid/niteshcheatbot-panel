import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material'
import { apiGet } from '../api.js'

export default function DashboardTab({ role }) {
  const [users, setUsers] = useState([])
  const [admins, setAdmins] = useState([])
  const [payments, setPayments] = useState([])
  const [products, setProducts] = useState([])

  useEffect(() => {
    apiGet('/users').then(setUsers).catch(() => setUsers([]))
    apiGet('/admins').then(setAdmins).catch(() => setAdmins([]))
    apiGet('/payment-requests').then(setPayments).catch(() => setPayments([]))
    apiGet('/products').then(setProducts).catch(() => setProducts([]))
  }, [])

  const stats = useMemo(() => {
    const total = users.length
    const banned = users.filter((user) => user.is_banned === 1).length
    return { total, banned, active: total - banned }
  }, [users])

  const linkedAdmins = useMemo(
    () => admins.filter((item) => String(item.telegram_id || '').trim()).length,
    [admins],
  )

  const paymentStats = useMemo(() => {
    const submitted = payments.filter((item) => String(item.status) === 'submitted').length
    const approved = payments.filter((item) => String(item.status) === 'approved').length
    const rejected = payments.filter((item) => String(item.status) === 'rejected').length
    const pendingAmount = payments
      .filter((item) => String(item.status) === 'submitted')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return { submitted, approved, rejected, pendingAmount }
  }, [payments])

  const chartRows = useMemo(() => {
    const totalUsers = Math.max(users.length, 1)
    return [
      { label: 'Active Users', value: stats.active, max: totalUsers, color: 'linear-gradient(90deg, #2dd4bf, #22c55e)' },
      { label: 'Banned Users', value: stats.banned, max: totalUsers, color: 'linear-gradient(90deg, #ef4444, #f97316)' },
      { label: 'Linked Admins', value: linkedAdmins, max: Math.max(admins.length, 1), color: 'linear-gradient(90deg, #60a5fa, #8b5cf6)' },
      { label: 'Pending Payments', value: paymentStats.submitted, max: Math.max(payments.length, 1), color: 'linear-gradient(90deg, #f59e0b, #f97316)' },
      { label: 'Live Products', value: products.filter((item) => Number(item.is_active) === 1).length, max: Math.max(products.length, 1), color: 'linear-gradient(90deg, #fb7185, #ec4899)' },
    ]
  }, [admins.length, linkedAdmins, paymentStats.submitted, payments.length, products, stats.active, stats.banned, users.length])

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / Dashboard
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Overview of your key management system
        </Typography>
      </Stack>
      {role === 'owner' ? (
        <Alert severity="info">
          Owner se panel branding, admins, deposit settings, aur announcements sab control hoga. Membership expiry disabled hai.
        </Alert>
      ) : null}
      <Stack direction="row" spacing={1}>
        {['All Time', 'Today', 'Yesterday', 'Custom Date'].map((label) => (
          <Card key={label} sx={{ px: 2, py: 1 }}>
            <Typography variant="caption">{label}</Typography>
          </Card>
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Total Users</Typography>
            <Typography variant="h3">{stats.total}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Active Users</Typography>
            <Typography variant="h3">{stats.active}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Pending Deposits</Typography>
            <Typography variant="h3">{paymentStats.submitted}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Rs {Math.round(paymentStats.pendingAmount)}
            </Typography>
          </CardContent>
        </Card>
      </Stack>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Live Analytics</Typography>
              {chartRows.map((item) => {
                const progress = Math.max(6, Math.min(100, (Number(item.value || 0) / Math.max(Number(item.max || 1), 1)) * 100))
                return (
                  <Stack key={item.label} spacing={0.75}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2">{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {item.value}
                      </Typography>
                    </Stack>
                    <Box
                      sx={{
                        height: 12,
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${progress}%`,
                          height: '100%',
                          borderRadius: 999,
                          background: item.color,
                          boxShadow: '0 0 18px rgba(255,255,255,0.12)',
                        }}
                      />
                    </Box>
                  </Stack>
                )
              })}
            </Stack>
          </CardContent>
        </Card>
        <Card sx={{ width: { xs: '100%', lg: 360 } }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Quick Snapshot</Typography>
              <Box>
                <Typography variant="body2">Linked Admins</Typography>
                <Typography variant="h4">{linkedAdmins}</Typography>
              </Box>
              <Box>
                <Typography variant="body2">Approved Deposits</Typography>
                <Typography variant="h4">{paymentStats.approved}</Typography>
              </Box>
              <Box>
                <Typography variant="body2">Rejected Requests</Typography>
                <Typography variant="h4">{paymentStats.rejected}</Typography>
              </Box>
              <Box>
                <Typography variant="body2">Moderation Health</Typography>
                <LinearProgress
                  variant="determinate"
                  value={Math.max(8, Math.min(100, ((stats.active || 0) / Math.max(stats.total || 1, 1)) * 100))}
                  sx={{ mt: 1, height: 10, borderRadius: 999 }}
                />
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Stack>
  )
}
