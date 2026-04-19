import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiSend } from '../api.js'

const emptyAdmin = { telegram_id: '', name: '', username: '', panel_role: 'admin', parent_admin_id: '', plan_id: '', custom_days: 30, notes: '' }

export default function AdminsTab({ role }) {
  const [plans, setPlans] = useState([])
  const [admins, setAdmins] = useState([])
  const [adminForm, setAdminForm] = useState(emptyAdmin)
  const [editAdmins, setEditAdmins] = useState({})

  const refresh = async () => {
    const [nextPlans, nextAdmins] = await Promise.all([apiGet('/owner-plans'), apiGet('/admins')])
    setPlans(nextPlans)
    setAdmins(nextAdmins)
    setEditAdmins(
      Object.fromEntries(
        nextAdmins.map((item) => [
          item.id,
          {
            telegram_id: item.telegram_id || '',
            name: item.name || '',
            username: item.username || '',
            parent_admin_id: item.parent_admin_id || '',
            panel_role: item.panel_role || 'admin',
            custom_days: Number(item.custom_days || 30),
            subscription_price: Number(item.subscription_price || 0),
            notes: item.notes || '',
            status: item.status || 'active',
          },
        ]),
      ),
    )
  }

  useEffect(() => {
    refresh().catch(() => {
      setPlans([])
      setAdmins([])
    })
  }, [])

  const stats = useMemo(() => {
    const total = admins.length
    const active = admins.filter((item) => String(item.status) === 'active').length
    const expiring = admins.filter((item) => Number(item.days_left || 0) <= 2 || String(item.status) === 'expired').length
    const maxDaysLeft = admins.reduce((acc, item) => Math.max(acc, Number(item.days_left || 0)), 0)
    return { total, active, expiring, maxDaysLeft }
  }, [admins])

  const createAdmin = async () => {
    if (!adminForm.telegram_id.trim()) return
    await apiSend('/admins', 'POST', {
      ...adminForm,
      telegram_id: adminForm.telegram_id.trim(),
      custom_days: Number(adminForm.custom_days || 30),
    })
    setAdminForm(emptyAdmin)
    refresh()
  }

  const renewAdmin = async (adminId, extraDays) => {
    await apiSend(`/admins/${adminId}`, 'PATCH', { action: 'renew', extra_days: extraDays })
    refresh()
  }

  const updateAdminStatus = async (adminId, status) => {
    await apiSend(`/admins/${adminId}`, 'PATCH', { status })
    refresh()
  }

  const removeAdmin = async (adminId) => {
    await apiSend(`/admins/${adminId}`, 'DELETE')
    refresh()
  }

  const saveAdmin = async (adminId) => {
    await apiSend(`/admins/${adminId}`, 'PATCH', editAdmins[adminId] || {})
    refresh()
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; {role === 'owner' ? 'Owner Control' : 'Admin Access & Subscription'}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Yahan se subscription days, active admins, aur admin access manage hoga.
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <Card><CardContent><Typography variant="caption">TOTAL ADMINS</Typography><Typography variant="h5">{stats.total}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent><Typography variant="caption">ACTIVE ADMINS</Typography><Typography variant="h5">{stats.active}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent><Typography variant="caption">EXPIRING / EXPIRED</Typography><Typography variant="h5">{stats.expiring}</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card><CardContent><Typography variant="caption">MAX DAYS LEFT</Typography><Typography variant="h5">{stats.maxDaysLeft}</Typography></CardContent></Card>
        </Grid>
      </Grid>

      {role === 'owner' ? (
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Create Admin Access</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Telegram Chat ID (optional)"
                      value={adminForm.telegram_id}
                      onChange={(event) => setAdminForm((current) => ({ ...current, telegram_id: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Name"
                      value={adminForm.name}
                      onChange={(event) => setAdminForm((current) => ({ ...current, name: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Username"
                      value={adminForm.username}
                      onChange={(event) => setAdminForm((current) => ({ ...current, username: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Parent Admin ID"
                      value={adminForm.parent_admin_id}
                      onChange={(event) => setAdminForm((current) => ({ ...current, parent_admin_id: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      label="Panel Role"
                      value={adminForm.panel_role}
                      onChange={(event) => setAdminForm((current) => ({ ...current, panel_role: event.target.value }))}
                      fullWidth
                    >
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="owner">Owner</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      label="Plan"
                      value={adminForm.plan_id}
                      onChange={(event) => setAdminForm((current) => ({ ...current, plan_id: event.target.value }))}
                      fullWidth
                    >
                      <MenuItem value="">Custom Days</MenuItem>
                      {plans.map((plan) => (
                        <MenuItem key={plan.id} value={plan.id}>
                          {plan.name} ({plan.days}d / Rs {plan.price})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Custom Days"
                      type="number"
                      value={adminForm.custom_days}
                      onChange={(event) => setAdminForm((current) => ({ ...current, custom_days: Number(event.target.value || 0) }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Notes"
                      value={adminForm.notes}
                      onChange={(event) => setAdminForm((current) => ({ ...current, notes: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                </Grid>
                <Button variant="contained" onClick={createAdmin}>
                  Create Admin
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      ) : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Admin Access List</Typography>
            {admins.map((admin) => (
              <Card key={admin.id} variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
                      <Stack spacing={0.5}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {admin.name || `Admin ${admin.telegram_id}`}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          TG: {admin.telegram_id} {admin.username ? `| @${admin.username}` : ''}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Chip label={admin.status} color={admin.status === 'active' ? 'success' : 'warning'} />
                        <Chip label={`${admin.days_left || 0} days left`} color="secondary" />
                      </Stack>
                    </Stack>
                    <Typography variant="body2">
                      Role: {admin.panel_role || 'admin'} | Plan: {admin.plan_name || 'Custom'} | Price: Rs {admin.subscription_price || 0} | Expires: {admin.expires_at || '-'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Parent Admin ID: {admin.parent_admin_id || '-'} | Parent expire hone par child admin bhi auto expire ho jayega.
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Telegram ID (optional)"
                          value={editAdmins[admin.id]?.telegram_id || ''}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), telegram_id: event.target.value },
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Name"
                          value={editAdmins[admin.id]?.name || ''}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), name: event.target.value },
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Username"
                          value={editAdmins[admin.id]?.username || ''}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), username: event.target.value },
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Parent Admin ID"
                          value={editAdmins[admin.id]?.parent_admin_id || ''}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), parent_admin_id: event.target.value },
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          select
                          label="Role"
                          value={editAdmins[admin.id]?.panel_role || 'admin'}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), panel_role: event.target.value },
                            }))
                          }
                          fullWidth
                        >
                          <MenuItem value="admin">Admin</MenuItem>
                          <MenuItem value="owner">Owner</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Subscription Days"
                          type="number"
                          value={editAdmins[admin.id]?.custom_days || 30}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), custom_days: Number(event.target.value || 0) },
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          label="Subscription Price"
                          type="number"
                          value={editAdmins[admin.id]?.subscription_price || 0}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), subscription_price: Number(event.target.value || 0) },
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <TextField
                          select
                          label="Status"
                          value={editAdmins[admin.id]?.status || 'active'}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), status: event.target.value },
                            }))
                          }
                          fullWidth
                        >
                          <MenuItem value="active">Active</MenuItem>
                          <MenuItem value="suspended">Suspended</MenuItem>
                          <MenuItem value="expired">Expired</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Notes"
                          value={editAdmins[admin.id]?.notes || ''}
                          onChange={(event) =>
                            setEditAdmins((current) => ({
                              ...current,
                              [admin.id]: { ...(current[admin.id] || {}), notes: event.target.value },
                            }))
                          }
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <Button variant="contained" onClick={() => renewAdmin(admin.id, 30)}>
                        +30 Days
                      </Button>
                      <Button variant="contained" onClick={() => renewAdmin(admin.id, 90)}>
                        +90 Days
                      </Button>
                      <Button variant="contained" color="secondary" onClick={() => saveAdmin(admin.id)}>
                        Save Edit
                      </Button>
                      <Button variant="outlined" onClick={() => updateAdminStatus(admin.id, 'active')}>
                        Activate
                      </Button>
                      <Button variant="outlined" color="warning" onClick={() => updateAdminStatus(admin.id, 'suspended')}>
                        Suspend
                      </Button>
                      <Button variant="outlined" color="error" onClick={() => removeAdmin(admin.id)}>
                        Delete
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
