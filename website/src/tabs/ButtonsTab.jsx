import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiSend } from '../api.js'

const builtinOptions = [
  { value: 'shop_now', label: 'Shop Now' },
  { value: 'my_orders', label: 'My Orders' },
  { value: 'profile', label: 'Profile' },
  { value: 'pay_proof', label: 'Pay Proof' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'how_to_use', label: 'How To Use' },
  { value: 'support', label: 'Support' },
  { value: 'id_help', label: 'ID & LVL ID' },
  { value: 'refer_earn', label: 'Refer & Earn' },
  { value: 'deposit_now', label: 'Deposit Now' },
]

const placementOptions = [
  { value: 'main', label: 'Main Start Menu' },
  { value: 'shop', label: 'Shop Product List' },
  { value: 'product', label: 'Product Details Page' },
]

const emptyButton = {
  label: '',
  action_type: 'text',
  builtin_action: 'shop_now',
  text: '',
  video_url: '',
  link_url: '',
  placement: 'main',
  target_product_id: '',
  sort_order: 0,
  is_active: true,
}

export default function ButtonsTab() {
  const [buttons, setButtons] = useState([])
  const [products, setProducts] = useState([])
  const [newButton, setNewButton] = useState(emptyButton)

  const refresh = async () => {
    const [btn, prod] = await Promise.all([apiGet('/buttons'), apiGet('/products')])
    setButtons(btn)
    setProducts(prod)
  }

  useEffect(() => {
    refresh().catch(() => setButtons([]))
  }, [])

  const updateItem = (id, field, value) => {
    setButtons((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const addButton = async () => {
    if (!newButton.label.trim()) return
    await apiSend('/buttons', 'POST', {
      ...newButton,
      is_active: newButton.is_active ? 1 : 0,
    })
    setNewButton(emptyButton)
    refresh()
  }

  const saveButton = async (button) => {
    await apiSend(`/buttons/${button.id}`, 'PUT', {
      ...button,
      is_active: button.is_active ? 1 : 0,
    })
    refresh()
  }

  const deleteButton = async (buttonId) => {
    await apiSend(`/buttons/${buttonId}`, 'DELETE')
    refresh()
  }

  const buttonEditor = (button, onChange) => (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <TextField
          label="Label"
          value={button.label}
          onChange={(event) => onChange('label', event.target.value)}
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel>Action</InputLabel>
          <Select
            label="Action"
            value={button.action_type}
            onChange={(event) => onChange('action_type', event.target.value)}
          >
            <MenuItem value="builtin">Builtin</MenuItem>
            <MenuItem value="text">Text</MenuItem>
            <MenuItem value="video">Video</MenuItem>
            <MenuItem value="link">Link</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <FormControl fullWidth>
          <InputLabel>Placement</InputLabel>
          <Select
            label="Placement"
            value={button.placement || 'main'}
            onChange={(event) => onChange('placement', event.target.value)}
          >
            {placementOptions.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {String(button.placement || 'main') === 'product' && (
          <FormControl fullWidth>
            <InputLabel>Target Product (optional)</InputLabel>
            <Select
              label="Target Product (optional)"
              value={button.target_product_id || ''}
              onChange={(event) => onChange('target_product_id', event.target.value)}
            >
              <MenuItem value="">All Products</MenuItem>
              {products.map((product) => (
                <MenuItem key={product.id} value={String(product.id)}>
                  {product.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>

      {button.action_type === 'builtin' && (
        <FormControl fullWidth>
          <InputLabel>Builtin Action</InputLabel>
          <Select
            label="Builtin Action"
            value={button.builtin_action || 'shop_now'}
            onChange={(event) => onChange('builtin_action', event.target.value)}
          >
            {builtinOptions.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {(button.action_type === 'text' || button.action_type === 'video') && (
        <TextField
          label="Text"
          value={button.text || ''}
          onChange={(event) => onChange('text', event.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
      )}
      {button.action_type === 'video' && (
        <TextField
          label="Video URL or Telegram File ID"
          value={button.video_url || ''}
          onChange={(event) => onChange('video_url', event.target.value)}
          fullWidth
        />
      )}
      {button.action_type === 'link' && (
        <TextField
          label="Link URL"
          value={button.link_url || ''}
          onChange={(event) => onChange('link_url', event.target.value)}
          fullWidth
        />
      )}
      <Stack direction="row" spacing={2}>
        <TextField
          label="Sort Order"
          type="number"
          value={button.sort_order}
          onChange={(event) => onChange('sort_order', Number(event.target.value))}
          sx={{ width: 180 }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={button.is_active === 1 || button.is_active === true}
              onChange={(event) => onChange('is_active', event.target.checked ? 1 : 0)}
            />
          }
          label="Active"
        />
      </Stack>
    </Stack>
  )

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Custom Buttons
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Add button and choose exact placement: Start / Shop / Product.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="h6">Add Button</Typography>
          <Stack spacing={2} mt={2}>
            {buttonEditor(newButton, (field, value) =>
              setNewButton((prev) => ({ ...prev, [field]: value })),
            )}
            <Button variant="contained" onClick={addButton}>
              Add Button
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {buttons.map((button) => (
        <Card key={button.id}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Button #{button.id}</Typography>
              {buttonEditor(button, (field, value) => updateItem(button.id, field, value))}
              <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={() => saveButton(button)}>
                  Save
                </Button>
                <Button variant="outlined" onClick={() => deleteButton(button.id)}>
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
