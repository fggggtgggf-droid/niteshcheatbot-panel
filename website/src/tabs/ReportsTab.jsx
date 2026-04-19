import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, Stack, Typography } from '@mui/material'
import { apiGet } from '../api.js'

function MiniBar({ label, value, max }) {
  const width = max > 0 ? `${Math.max(6, (value / max) * 100)}%` : '6%'
  return (
    <Stack spacing={0.6}>
      <Typography variant="caption">{label}</Typography>
      <Stack sx={{ height: 10, borderRadius: 10, bgcolor: 'rgba(255,255,255,0.08)' }}>
        <Stack sx={{ width, height: 10, borderRadius: 10, bgcolor: 'rgba(58,219,131,0.9)' }} />
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {value}
      </Typography>
    </Stack>
  )
}

export default function ReportsTab() {
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [resets, setResets] = useState([])

  useEffect(() => {
    Promise.all([
      apiGet('/users'),
      apiGet('/orders'),
      apiGet('/payment-requests'),
      apiGet('/reset-requests'),
    ])
      .then(([u, o, p, r]) => {
        setUsers(u)
        setOrders(o)
        setPayments(p)
        setResets(r)
      })
      .catch(() => {})
  }, [])

  const stats = useMemo(() => {
    const approvedPayments = payments.filter((item) => item.status === 'approved').length
    const pendingPayments = payments.filter((item) => item.status === 'submitted').length
    const pendingResets = resets.filter((item) => item.status === 'pending').length
    const revenue = orders.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    return {
      users: users.length,
      orders: orders.length,
      revenue: Math.round(revenue),
      approvedPayments,
      pendingPayments,
      pendingResets,
    }
  }, [users, orders, payments, resets])

  const maxBar = Math.max(
    stats.users,
    stats.orders,
    stats.approvedPayments,
    stats.pendingPayments,
    stats.pendingResets,
    1,
  )

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / Reports
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Live analytics snapshot for users, orders, payments and reset requests.
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Total Users</Typography>
            <Typography variant="h3">{stats.users}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Total Orders</Typography>
            <Typography variant="h3">{stats.orders}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Revenue</Typography>
            <Typography variant="h3">Rs {stats.revenue}</Typography>
          </CardContent>
        </Card>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <MiniBar label="Approved Payments" value={stats.approvedPayments} max={maxBar} />
            <MiniBar label="Pending Payments" value={stats.pendingPayments} max={maxBar} />
            <MiniBar label="Pending Reset Requests" value={stats.pendingResets} max={maxBar} />
            <MiniBar label="Users" value={stats.users} max={maxBar} />
            <MiniBar label="Orders" value={stats.orders} max={maxBar} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
