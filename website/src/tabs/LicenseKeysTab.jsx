import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Modal,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiSend } from '../api.js'

const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(620px, 92vw)',
  bgcolor: '#0f1018',
  borderRadius: 3,
  p: 3,
  boxShadow: '0 25px 70px rgba(0,0,0,0.6)',
  border: '1px solid rgba(123,92,255,0.25)',
}

const emptyForm = {
  product_id: '',
  plan_id: '',
  key_type: 'username_password',
  account_username: '',
  account_password: '',
  pin_code: '',
  status: 'available',
  hwid_reset_limit: 0,
  reseller_price: 0,
}

export default function LicenseKeysTab() {
  const [products, setProducts] = useState([])
  const [plans, setPlans] = useState([])
  const [keys, setKeys] = useState([])
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [filters, setFilters] = useState({ product_id: '', status: 'all', query: '' })
  const [form, setForm] = useState(emptyForm)

  const refresh = async () => {
    const [productsData, plansData, keysData] = await Promise.all([
      apiGet('/products'),
      apiGet('/plans'),
      apiGet('/licenses'),
    ])
    setProducts(productsData)
    setPlans(plansData)
    setKeys(keysData)
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  const productsById = useMemo(
    () => Object.fromEntries(products.map((item) => [String(item.id), item])),
    [products],
  )
  const plansById = useMemo(
    () => Object.fromEntries(plans.map((item) => [String(item.id), item])),
    [plans],
  )

  const availablePlans = useMemo(() => {
    if (!form.product_id) return plans
    return plans.filter((plan) => String(plan.product_id) === String(form.product_id))
  }, [plans, form.product_id])

  const filteredKeys = useMemo(() => {
    const token = filters.query.toLowerCase().trim()
    return keys.filter((key) => {
      if (filters.product_id && String(key.product_id) !== String(filters.product_id)) return false
      if (filters.status !== 'all' && key.status !== filters.status) return false
      if (
        token &&
        !String(key.license_key || '').toLowerCase().includes(token) &&
        !String(key.account_username || '').toLowerCase().includes(token) &&
        !String(key.pin_code || '').toLowerCase().includes(token)
      ) {
        return false
      }
      return true
    })
  }, [keys, filters])

  const stats = useMemo(() => {
    const total = keys.length
    const sold = keys.filter((key) => key.status === 'sold').length
    const active = keys.filter((key) => key.status === 'active').length
    const available = keys.filter((key) => key.status === 'available').length
    return { total, sold, active, available }
  }, [keys])

  const openCreate = () => {
    setEditingId('')
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (item) => {
    const keyType =
      item.key_type || (String(item.license_key || '').includes(':') ? 'username_password' : 'pin')
    setEditingId(String(item.id))
    setForm({
      product_id: String(item.product_id || ''),
      plan_id: String(item.plan_id || ''),
      key_type: keyType,
      account_username: item.account_username || '',
      account_password: item.account_password || '',
      pin_code: item.pin_code || (keyType === 'pin' ? String(item.license_key || '') : ''),
      status: item.status || 'available',
      hwid_reset_limit: Number(item.hwid_reset_limit || 0),
      reseller_price: Number(item.reseller_price || 0),
    })
    setOpen(true)
  }

  const deleteKey = async (item) => {
    await apiSend(`/licenses/${item.id}`, 'DELETE')
    refresh()
  }

  const saveKey = async () => {
    if (!form.product_id || !form.plan_id) return
    if (form.key_type === 'username_password') {
      if (!form.account_username.trim() || !form.account_password.trim()) return
    } else if (!form.pin_code.trim()) {
      return
    }

    const payload = {
      ...form,
      product_id: String(form.product_id),
      plan_id: String(form.plan_id),
      hwid_reset_limit: Number(form.hwid_reset_limit || 0),
      reseller_price: Number(form.reseller_price || 0),
    }

    if (editingId) {
      await apiSend(`/licenses/${editingId}`, 'PUT', payload)
    } else {
      await apiSend('/licenses', 'POST', payload)
    }
    setOpen(false)
    setEditingId('')
    setForm(emptyForm)
    refresh()
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / License Keys
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Add, edit and delete manual keys inventory
        </Typography>
      </Stack>

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <Card sx={{ flex: 1, minWidth: 160 }}>
          <CardContent>
            <Typography variant="overline">Total Keys</Typography>
            <Typography variant="h3">{stats.total}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 160 }}>
          <CardContent>
            <Typography variant="overline">Available</Typography>
            <Typography variant="h3">{stats.available}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 160 }}>
          <CardContent>
            <Typography variant="overline">Active</Typography>
            <Typography variant="h3">{stats.active}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, minWidth: 160 }}>
          <CardContent>
            <Typography variant="overline">Sold</Typography>
            <Typography variant="h3">{stats.sold}</Typography>
          </CardContent>
        </Card>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
            <FormControl sx={{ minWidth: 180 }}>
              <InputLabel>All Products</InputLabel>
              <Select
                label="All Products"
                value={filters.product_id}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, product_id: String(event.target.value) }))
                }
              >
                <MenuItem value="">All Products</MenuItem>
                {products.map((product) => (
                  <MenuItem key={product.id} value={String(product.id)}>
                    {product.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ minWidth: 160 }}>
              <InputLabel>All Status</InputLabel>
              <Select
                label="All Status"
                value={filters.status}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="available">Available</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="sold">Sold</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Search keys..."
              value={filters.query}
              onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
              fullWidth
            />
            <Button variant="contained" onClick={openCreate}>
              + Add Key
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {filteredKeys.map((item) => (
        <Card key={item.id}>
          <CardContent>
            <Stack spacing={1.2}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {productsById[String(item.product_id)]?.name || 'Unknown Product'} /{' '}
                    {plansById[String(item.plan_id)]?.name || 'Unknown Duration'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Type: {item.key_type === 'username_password' ? 'Username + Password' : 'PIN'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => openEdit(item)}>
                    Edit
                  </Button>
                  <Button variant="outlined" color="error" onClick={() => deleteKey(item)}>
                    Delete
                  </Button>
                </Stack>
              </Stack>
              <Typography variant="body2">
                Key: {item.license_key}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Status: {item.status}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Modal open={open} onClose={() => setOpen(false)}>
        <Box sx={modalStyle}>
          <Stack spacing={2}>
            <Typography variant="h6">{editingId ? 'Edit License Key' : 'Add License Key'}</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Select Product</InputLabel>
                <Select
                  label="Select Product"
                  value={form.product_id}
                  onChange={(event) => {
                    const nextProductId = String(event.target.value)
                    setForm((prev) => ({
                      ...prev,
                      product_id: nextProductId,
                      plan_id: '',
                      hwid_reset_limit: 0,
                      reseller_price: 0,
                    }))
                  }}
                >
                  {products.map((product) => (
                    <MenuItem key={product.id} value={String(product.id)}>
                      {product.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Select Duration</InputLabel>
                <Select
                  label="Select Duration"
                  value={form.plan_id}
                  onChange={(event) => {
                    const nextPlanId = String(event.target.value)
                    const selectedPlan = availablePlans.find(
                      (plan) => String(plan.id) === nextPlanId,
                    )
                    setForm((prev) => ({
                      ...prev,
                      plan_id: nextPlanId,
                      hwid_reset_limit: Number(selectedPlan?.hwid_reset_limit || 0),
                      reseller_price: Number(selectedPlan?.reseller_price || 0),
                    }))
                  }}
                >
                  {availablePlans.map((plan) => (
                    <MenuItem key={plan.id} value={String(plan.id)}>
                      {plan.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <FormControl fullWidth>
              <InputLabel>Key Type</InputLabel>
              <Select
                label="Key Type"
                value={form.key_type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, key_type: event.target.value }))
                }
              >
                <MenuItem value="username_password">Username + Password</MenuItem>
                <MenuItem value="pin">PIN / Plain Text</MenuItem>
              </Select>
            </FormControl>

            {form.key_type === 'username_password' ? (
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Username"
                  value={form.account_username}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, account_username: event.target.value }))
                  }
                  fullWidth
                />
                <TextField
                  label="Password"
                  value={form.account_password}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, account_password: event.target.value }))
                  }
                  fullWidth
                />
              </Stack>
            ) : (
              <TextField
                label="PIN / Plain Text Key"
                value={form.pin_code}
                onChange={(event) => setForm((prev) => ({ ...prev, pin_code: event.target.value }))}
                fullWidth
              />
            )}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="HWID Reset Limit"
                type="number"
                value={form.hwid_reset_limit}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, hwid_reset_limit: Number(event.target.value) }))
                }
                fullWidth
              />
              <TextField
                label="Reseller Price"
                type="number"
                value={form.reseller_price}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, reseller_price: Number(event.target.value) }))
                }
                fullWidth
              />
            </Stack>

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <MenuItem value="available">Available</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="sold">Sold</MenuItem>
              </Select>
            </FormControl>

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="contained" onClick={saveKey}>
                {editingId ? 'Save Key' : 'Add Key'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Modal>
    </Stack>
  )
}
