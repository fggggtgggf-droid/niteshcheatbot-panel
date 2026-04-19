import { useEffect, useState } from 'react'
import { Button, Card, CardContent, Stack, Typography } from '@mui/material'
import { apiGet, apiSend } from '../api.js'

export default function ManageResellersTab() {
  const [resellers, setResellers] = useState([])

  const refresh = async () => {
    setResellers(await apiGet('/resellers'))
  }

  useEffect(() => {
    refresh().catch(() => setResellers([]))
  }, [])

  const ban = async (id) => {
    await apiSend(`/users/${id}/toggle-ban`, 'POST')
    refresh()
  }

  const remove = async (id) => {
    await apiSend(`/users/${id}`, 'PATCH', { role: 'user' })
    refresh()
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Manage Resellers
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Active reseller accounts and controls.
        </Typography>
      </Stack>
      {resellers.map((reseller) => (
        <Card key={reseller.id}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
              <BoxLike name={reseller.first_name} balance={reseller.balance} username={reseller.username} />
              <Stack direction="row" spacing={2}>
                <Button variant="outlined" onClick={() => ban(reseller.id)}>
                  {reseller.is_banned ? 'Unban' : 'Suspend'}
                </Button>
                <Button variant="contained" onClick={() => remove(reseller.id)}>
                  Remove
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  )
}

function BoxLike({ name, username, balance }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="h6">{name}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        @{username || 'no_username'}
      </Typography>
      <Typography variant="body2" sx={{ color: '#23f3d1' }}>
        Balance: Rs {Number(balance || 0)}
      </Typography>
    </Stack>
  )
}
