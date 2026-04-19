import { useEffect, useMemo, useState } from 'react'
import { Alert, Card, CardContent, Stack, Typography } from '@mui/material'
import { apiGet } from '../api.js'

export default function DashboardTab({ role }) {
  const [users, setUsers] = useState([])
  const [admins, setAdmins] = useState([])

  useEffect(() => {
    apiGet('/users').then(setUsers).catch(() => setUsers([]))
    apiGet('/admins').then(setAdmins).catch(() => setAdmins([]))
  }, [])

  const stats = useMemo(() => {
    const total = users.length
    const banned = users.filter((user) => user.is_banned === 1).length
    return { total, banned, active: total - banned }
  }, [users])

  const expiringAdmins = useMemo(
    () => admins.filter((item) => item.status === 'expired' || Number(item.days_left || 0) <= 2),
    [admins],
  )

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
      {role === 'owner' && expiringAdmins.length > 0 ? (
        <Alert severity="warning">
          {expiringAdmins.length} admin panel(s) are expiring soon or already expired. Open Owner Control to renew them.
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
            <Typography variant="overline">Banned Users</Typography>
            <Typography variant="h3">{stats.banned}</Typography>
          </CardContent>
        </Card>
      </Stack>
      <Card>
        <CardContent>
          <Typography variant="h6">Upcoming Charts</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Product sales, active sessions, and conversion charts will show here.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  )
}
