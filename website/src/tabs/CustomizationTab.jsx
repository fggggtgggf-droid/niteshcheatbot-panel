import { useEffect, useState } from 'react'
import { Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import { apiGet, apiSend, notifySettingsUpdated } from '../api.js'

const fields = [
  { key: 'brand_name', label: 'Brand Name' },
  { key: 'brand_logo_url', label: 'Brand Logo URL' },
  { key: 'telegram_support_link', label: 'Telegram Support Link' },
  { key: 'whatsapp_support_link', label: 'WhatsApp Support Link' },
  { key: 'bot_username', label: 'Bot Username (for invite/ref link)' },
  { key: 'bot_token', label: 'Bot Token (for announcements)' },
  { key: 'cashfree_environment', label: 'Cashfree Environment (production / sandbox)' },
  { key: 'ui_primary_color', label: 'UI Primary Color' },
  { key: 'ui_accent_color', label: 'UI Accent Color' },
  { key: 'ui_surface_color', label: 'UI Surface Color' },
  { key: 'ui_surface_alt_color', label: 'UI Surface Alt Color' },
  { key: 'button_bg_color', label: 'Default Button Background' },
  { key: 'button_text_color', label: 'Default Button Text Color' },
  { key: 'button_hover_color', label: 'Default Button Hover Color' },
  { key: 'button_disabled_color', label: 'Default Button Disabled Color' },
  { key: 'bot_card_title', label: 'Bot Card Title' },
  { key: 'bot_card_tagline', label: 'Bot Card Tagline' },
  { key: 'welcome_text', label: 'Welcome Text' },
  { key: 'shop_header_text', label: 'Shop Header' },
  { key: 'profile_text', label: 'Profile Text' },
  { key: 'orders_text', label: 'Orders Text' },
  { key: 'refer_text', label: 'Refer Text' },
  { key: 'support_text', label: 'Support Text' },
  { key: 'how_to_use_text', label: 'How To Use Text' },
  { key: 'feedback_text', label: 'Feedback Text' },
  { key: 'pay_proof_text', label: 'Pay Proof Text' },
  { key: 'id_help_text', label: 'ID Help Text' },
]

export default function CustomizationTab() {
  const [settings, setSettings] = useState({})

  useEffect(() => {
    apiGet('/settings').then(setSettings).catch(() => setSettings({}))
  }, [])

  const saveSettings = async () => {
    await apiSend('/settings', 'PUT', settings)
    notifySettingsUpdated(settings)
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Bot Customization
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Edit welcome messages and support links.
        </Typography>
      </Stack>
      {fields.map((field) => (
        <Card key={field.key}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {field.label}
            </Typography>
            <TextField
              value={settings[field.key] || ''}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, [field.key]: event.target.value }))
              }
              fullWidth
              multiline
              minRows={3}
            />
          </CardContent>
        </Card>
      ))}
      <Button variant="contained" onClick={saveSettings}>
        Save All
      </Button>
    </Stack>
  )
}
