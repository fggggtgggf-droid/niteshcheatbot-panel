import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiSend } from '../api.js'

const emptyPlan = { name: '', days: 30, price: 0, sort_order: 0, is_active: true }

export default function OwnerPlansTab() {
  const [plans, setPlans] = useState([])
  const [draft, setDraft] = useState(emptyPlan)

  const refresh = async () => {
    setPlans(await apiGet('/owner-plans'))
  }

  useEffect(() => {
    refresh().catch(() => setPlans([]))
  }, [])

  const createPlan = async () => {
    if (!draft.name.trim()) return
    await apiSend('/owner-plans', 'POST', {
      ...draft,
      is_active: draft.is_active ? 1 : 0,
    })
    setDraft(emptyPlan)
    refresh()
  }

  const updatePlan = async (plan) => {
    await apiSend(`/owner-plans/${plan.id}`, 'PUT', {
      ...plan,
      is_active: plan.is_active ? 1 : 0,
    })
    refresh()
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Owner / Plans
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Owner manages membership plans here. Super Admin panel does not create plans.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Create Plan</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField label="Plan Name" value={draft.name} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Days" type="number" value={draft.days} onChange={(e) => setDraft((c) => ({ ...c, days: Number(e.target.value || 0) }))} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Price" type="number" value={draft.price} onChange={(e) => setDraft((c) => ({ ...c, price: Number(e.target.value || 0) }))} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField label="Sort" type="number" value={draft.sort_order} onChange={(e) => setDraft((c) => ({ ...c, sort_order: Number(e.target.value || 0) }))} fullWidth />
              </Grid>
              <Grid item xs={12} md={2}>
                <FormControlLabel control={<Switch checked={draft.is_active} onChange={(e) => setDraft((c) => ({ ...c, is_active: e.target.checked }))} />} label="Active" />
              </Grid>
            </Grid>
            <Button variant="contained" onClick={createPlan}>
              Save Plan
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {plans.map((plan) => (
        <Card key={plan.id}>
          <CardContent>
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField label="Plan Name" value={plan.name || ''} onChange={(e) => setPlans((prev) => prev.map((item) => (item.id === plan.id ? { ...item, name: e.target.value } : item)))} fullWidth />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField label="Days" type="number" value={plan.days || 0} onChange={(e) => setPlans((prev) => prev.map((item) => (item.id === plan.id ? { ...item, days: Number(e.target.value || 0) } : item)))} fullWidth />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField label="Price" type="number" value={plan.price || 0} onChange={(e) => setPlans((prev) => prev.map((item) => (item.id === plan.id ? { ...item, price: Number(e.target.value || 0) } : item)))} fullWidth />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField label="Sort" type="number" value={plan.sort_order || 0} onChange={(e) => setPlans((prev) => prev.map((item) => (item.id === plan.id ? { ...item, sort_order: Number(e.target.value || 0) } : item)))} fullWidth />
                </Grid>
                <Grid item xs={12} md={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Number(plan.is_active ?? 1) === 1}
                        onChange={(e) => setPlans((prev) => prev.map((item) => (item.id === plan.id ? { ...item, is_active: e.target.checked ? 1 : 0 } : item)))}
                      />
                    }
                    label="Active"
                  />
                </Grid>
              </Grid>
              <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={() => updatePlan(plan)}>
                  Save
                </Button>
                <Button variant="outlined" color="error" onClick={() => apiSend(`/owner-plans/${plan.id}`, 'DELETE').then(refresh)}>
                  Delete
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  )
}
