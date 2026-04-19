import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiSend } from '../api.js'

const durationOptions = [
  { value: '3', label: '3 Days' },
  { value: '7', label: '7 Days' },
  { value: '30', label: '30 Days' },
  { value: '60', label: '60 Days' },
  { value: '90', label: '90 Days' },
  { value: '365', label: '365 Days' },
  { value: 'lifetime', label: 'Infinity / Lifetime' },
  { value: 'custom', label: 'Custom Days' },
]

const emptyChild = { telegram_id: '', name: '', username: '', duration_mode: '30', custom_days: 30, notes: '' }

export default function AdminProfileTab({
  sessionAdminId,
  sessionTelegramId,
  sessionLoginEmail,
  adminAccess,
  onSessionAdminIdChange,
  onSessionTelegramIdChange,
  onSessionLoginEmailChange,
  onAdminAccessChange,
}) {
  const [telegramIdInput, setTelegramIdInput] = useState(sessionTelegramId || '')
  const [allAdmins, setAllAdmins] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [childForm, setChildForm] = useState(emptyChild)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setTelegramIdInput(sessionTelegramId || '')
  }, [sessionTelegramId])

  const record = adminAccess?.record || {}

  const refresh = async (targetId = sessionTelegramId, targetAdminId = sessionAdminId) => {
    const cleanId = String(targetId || '').trim()
    const cleanAdminId = String(targetAdminId || '').trim()
    if (!cleanId && !cleanAdminId) {
      setAllAdmins([])
      setActivityLogs([])
      return
    }
    const accessPath = cleanAdminId
      ? `/admins/access-by-id/${encodeURIComponent(cleanAdminId)}`
      : `/admins/access/${encodeURIComponent(cleanId)}`
    const [accessResult, admins, logs] = await Promise.all([
      apiGet(accessPath),
      apiGet('/admins'),
      record.id ? apiGet(`/activity-logs?admin_id=${encodeURIComponent(record.id)}`) : Promise.resolve([]),
    ])
    onAdminAccessChange?.(accessResult)
    setAllAdmins(admins)
    setActivityLogs(logs)
  }

  useEffect(() => {
    if (record.id) {
      apiGet(`/activity-logs?admin_id=${encodeURIComponent(record.id)}`)
        .then(setActivityLogs)
        .catch(() => setActivityLogs([]))
    } else {
      setActivityLogs([])
    }
  }, [record.id])

  const childAdmins = useMemo(
    () => allAdmins.filter((item) => String(item.parent_admin_id || '') === String(record.id || '')),
    [allAdmins, record.id],
  )

  const effectiveChildDays =
    childForm.duration_mode === 'custom'
      ? Number(childForm.custom_days || 0)
      : childForm.duration_mode === 'lifetime'
        ? 36500
        : Number(childForm.duration_mode || 30)

  const loadProfile = async () => {
    const cleanId = telegramIdInput.trim()
    if (!cleanId) {
      setError('Enter Telegram Chat ID only if you want Telegram bot access for this same super admin account.')
      return
    }
    try {
      const result = await apiSend('/admins/link-chat', 'POST', { telegram_id: cleanId, admin_id: sessionAdminId })
      if (!result.success) {
        setError(result.error || 'Unable to link this Telegram Chat ID')
        setMessage('')
        return
      }
      onSessionTelegramIdChange?.(cleanId)
      onSessionAdminIdChange?.(String(result.record?.id || sessionAdminId || ''))
      onAdminAccessChange?.(result)
      setMessage('Telegram Chat ID linked to this panel session.')
      setError('')
      const admins = await apiGet('/admins')
      setAllAdmins(admins)
      const logs = result.record?.id ? await apiGet(`/activity-logs?admin_id=${encodeURIComponent(result.record.id)}`) : []
      setActivityLogs(logs)
    } catch (err) {
      setError(err.message || 'Unable to load this Telegram Chat ID')
      setMessage('')
    }
  }

  const unlinkProfile = async () => {
    if (sessionTelegramId || sessionAdminId) {
      await apiSend('/admins/unlink-chat', 'POST', { telegram_id: sessionTelegramId, admin_id: sessionAdminId })
    }
    onSessionTelegramIdChange?.('')
    if (sessionAdminId) {
      const result = await apiGet(`/admins/access-by-id/${encodeURIComponent(sessionAdminId)}`)
      onAdminAccessChange?.(result)
      onSessionAdminIdChange?.(String(result.record?.id || sessionAdminId))
      setMessage('Telegram Chat ID unlinked. Website account stays loaded in this browser session.')
      setError('')
      return
    }
    onAdminAccessChange?.(null)
    setAllAdmins([])
    setActivityLogs([])
    setMessage('Telegram Chat ID unlinked from this browser session.')
    setError('')
  }

  const createChildAdmin = async () => {
    if (!record.id || (!childForm.telegram_id.trim() && !childForm.login_email.trim())) return
    await apiSend('/admins', 'POST', {
      telegram_id: childForm.telegram_id.trim(),
      name: childForm.name,
      username: childForm.username,
      panel_role: 'admin',
      parent_admin_id: String(record.id),
      plan_id: record.plan_id || '',
      plan_name: childForm.duration_mode === 'lifetime' ? 'Lifetime Access' : record.plan_name || 'Custom Plan',
      subscription_price: Number(record.subscription_price || 0),
      custom_days: effectiveChildDays,
      notes: childForm.notes,
    })
    setChildForm(emptyChild)
    setMessage('Child admin created successfully.')
    setError('')
    await refresh(record.telegram_id || sessionTelegramId, record.id || sessionAdminId)
  }


  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Profile
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Telegram Chat ID optional hai. Ek baar link kar doge to isi admin account ko bot se bhi manage kar paoge.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Telegram Chat ID (Optional)"
              value={telegramIdInput}
              onChange={(event) => setTelegramIdInput(event.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={loadProfile}>
              Link Telegram Chat ID
            </Button>
            <Button variant="outlined" color="secondary" onClick={unlinkProfile} disabled={!sessionTelegramId}>
              Unlink
            </Button>
          </Stack>
          {sessionAdminId ? (
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1 }}>
              Current admin account ID: {sessionAdminId}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      {message ? <Alert severity="success">{message}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      {record.id ? (
        <>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}><Card><CardContent><Typography variant="caption">ACCESS MODE</Typography><Typography variant="h6">{record.plan_name || 'Lifetime Access'}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={3}><Card><CardContent><Typography variant="caption">STATUS</Typography><Typography variant="h6">{record.status || '-'}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={3}><Card><CardContent><Typography variant="caption">BOT LINK</Typography><Typography variant="h6">{record.telegram_id ? 'Linked' : 'Not Linked'}</Typography></CardContent></Card></Grid>
            <Grid item xs={12} md={3}><Card><CardContent><Typography variant="caption">CHILD ADMINS</Typography><Typography variant="h6">{childAdmins.length}</Typography></CardContent></Card></Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="h6">Membership Snapshot</Typography>
                <Typography variant="body2">Telegram Chat ID: {record.telegram_id || '-'}</Typography>
                <Typography variant="body2">Access Type: {record.plan_name || 'Lifetime Access'}</Typography>
                <Typography variant="body2">Expiry: Not enforced</Typography>
                <Typography variant="body2">Panel Price: Rs {record.subscription_price || 0}</Typography>
                <Typography variant="body2">Parent Admin: {record.parent_admin_id || 'Main / Super Admin'}</Typography>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Create Child Admin</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Telegram Chat ID (optional)"
                      value={childForm.telegram_id}
                      onChange={(event) => setChildForm((current) => ({ ...current, telegram_id: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Name"
                      value={childForm.name}
                      onChange={(event) => setChildForm((current) => ({ ...current, name: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Username"
                      value={childForm.username}
                      onChange={(event) => setChildForm((current) => ({ ...current, username: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel>Duration</InputLabel>
                      <Select
                        label="Duration"
                        value={childForm.duration_mode}
                        onChange={(event) => setChildForm((current) => ({ ...current, duration_mode: event.target.value }))}
                      >
                        {durationOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  {childForm.duration_mode === 'custom' ? (
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Custom Days"
                        type="number"
                        value={childForm.custom_days}
                        onChange={(event) => setChildForm((current) => ({ ...current, custom_days: Number(event.target.value || 0) }))}
                        fullWidth
                      />
                    </Grid>
                  ) : null}
                  <Grid item xs={12}>
                    <TextField
                      label="Notes"
                      value={childForm.notes}
                      onChange={(event) => setChildForm((current) => ({ ...current, notes: event.target.value }))}
                      fullWidth
                    />
                  </Grid>
                </Grid>
                <Button variant="contained" onClick={createChildAdmin}>
                  Create Child Admin
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="h6">Child Admin List</Typography>
                {childAdmins.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No child admins yet.
                  </Typography>
                ) : (
                  childAdmins.map((item) => (
                    <Typography key={item.id} variant="body2">
                      {item.name || item.telegram_id} | @{item.username || '-'} | {item.status} | {item.days_left || 0} days
                    </Typography>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="h6">Recent Activity</Typography>
                {activityLogs.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No activity tracked yet.
                  </Typography>
                ) : (
                  activityLogs.slice(0, 12).map((item) => (
                    <Typography key={item.id} variant="body2">
                      {item.date} | {item.action}
                    </Typography>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      ) : (
        <Alert severity="info">Telegram Chat ID abhi link nahi hai. Agar bot se panel manage karna hai to apni chat ID yahan link kar do.</Alert>
      )}
    </Stack>
  )
}
