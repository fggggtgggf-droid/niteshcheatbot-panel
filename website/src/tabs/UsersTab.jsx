import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Card, CardContent, FormControl, InputLabel, MenuItem, Modal, Select, Stack, TextField, Typography } from '@mui/material'
import { apiGet, apiSend } from '../api.js'

const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(560px, 92vw)',
  bgcolor: '#0f1018',
  borderRadius: 3,
  p: 3,
  border: '1px solid rgba(123,92,255,0.25)',
}

export default function UsersTab() {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [editingUser, setEditingUser] = useState(null)
  const refresh = async () => {
    setUsers(await apiGet('/users'))
  }

  useEffect(() => {
    refresh().catch(() => setUsers([]))
  }, [])

  const filtered = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.first_name.toLowerCase().includes(search.toLowerCase()) ||
        (user.username || '').toLowerCase().includes(search.toLowerCase()) ||
        String(user.telegram_id).includes(search)
      const matchesStatus =
        status === 'all'
          ? true
          : status === 'active'
            ? user.is_banned === 0
            : user.is_banned === 1
      return matchesSearch && matchesStatus
    })
  }, [users, search, status])

  const updateUserField = (id, field, value) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, [field]: value } : user)))
  }

  const saveUser = async (user) => {
    await apiSend(`/users/${user.id}`, 'PATCH', user)
    refresh()
    setEditingUser(null)
  }

  const toggleBan = async (userId) => {
    await apiSend(`/users/${userId}/toggle-ban`, 'POST')
    refresh()
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / Manage Users
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          View and manage all registered users
        </Typography>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Total Users</Typography>
            <Typography variant="h3">{users.length}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Admins</Typography>
            <Typography variant="h3">{users.filter((u) => u.role === 'admin').length}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline">Total Balance</Typography>
            <Typography variant="h3">
              ₹{users.reduce((sum, user) => sum + Number(user.balance || 0), 0)}
            </Typography>
          </CardContent>
        </Card>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          fullWidth
        />
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="banned">Banned</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {filtered.map((user) => (
        <Card key={user.id}>
          <CardContent>
            <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} justifyContent="space-between">
              <Stack spacing={0.5}>
                <Typography variant="h6">{user.first_name}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  @{user.username || 'no_username'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#23f3d1' }}>
                  Rs {Number(user.balance || 0)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={2}>
                <Button variant="outlined" onClick={() => setEditingUser(user)}>
                  Edit
                </Button>
                <Button variant="outlined" onClick={() => toggleBan(user.id)}>
                  {user.is_banned ? 'Unban' : 'Ban'}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Modal open={Boolean(editingUser)} onClose={() => setEditingUser(null)}>
        <Box sx={modalStyle}>
          {editingUser ? (
            <Stack spacing={2}>
              <Typography variant="h6">Edit User: {editingUser.first_name}</Typography>
              <FormControl fullWidth>
                <InputLabel>User Role</InputLabel>
                <Select
                  label="User Role"
                  value={editingUser.role || 'user'}
                  onChange={(event) =>
                    setEditingUser((prev) => ({ ...prev, role: event.target.value }))
                  }
                >
                  <MenuItem value="user">User</MenuItem>
                  <MenuItem value="reseller">Reseller</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Name"
                value={editingUser.first_name}
                onChange={(event) =>
                  setEditingUser((prev) => ({ ...prev, first_name: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Username"
                value={editingUser.username || ''}
                onChange={(event) =>
                  setEditingUser((prev) => ({ ...prev, username: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Balance Adjustment"
                type="number"
                value={editingUser.balance || 0}
                onChange={(event) =>
                  setEditingUser((prev) => ({ ...prev, balance: Number(event.target.value) }))
                }
                fullWidth
              />
              <TextField
                label="Notes"
                value={editingUser.notes || ''}
                onChange={(event) =>
                  setEditingUser((prev) => ({ ...prev, notes: event.target.value }))
                }
                fullWidth
                multiline
                minRows={2}
              />
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button variant="outlined" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button variant="contained" onClick={() => saveUser(editingUser)}>
                  Save Changes
                </Button>
              </Stack>
            </Stack>
          ) : null}
        </Box>
      </Modal>
    </Stack>
  )
}
