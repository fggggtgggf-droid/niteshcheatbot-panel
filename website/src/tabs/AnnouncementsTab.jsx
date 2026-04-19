import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiSend } from '../api.js'

export default function AnnouncementsTab() {
  const [message, setMessage] = useState('')
  const [mediaType, setMediaType] = useState('text')
  const [media, setMedia] = useState('')
  const [result, setResult] = useState('')

  const send = async () => {
    if (!message.trim() && mediaType === 'text') return
    if ((mediaType === 'photo' || mediaType === 'video') && !media.trim()) return
    const response = await apiSend('/announcements/broadcast', 'POST', {
      message: message.trim(),
      media_type: mediaType,
      media: media.trim(),
    })
    setResult(`Sent to ${response.sent_count}/${response.total} users`)
    setMessage('')
    setMedia('')
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Admin / Announcements
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Broadcast text, image or video to all users. Telegram post copy-link ke bajay bot se media bhej kar `file_id` use karo.
        </Typography>
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
                <MenuItem value="text">Text Only</MenuItem>
                <MenuItem value="photo">Image + Text</MenuItem>
                <MenuItem value="video">Video + Text</MenuItem>
              </Select>
            </FormControl>

            {(mediaType === 'photo' || mediaType === 'video') && (
              <TextField
                label="Media URL or Telegram file_id"
                value={media}
                onChange={(event) => setMedia(event.target.value)}
                fullWidth
              />
            )}
            <TextField
              label="Announcement Message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              fullWidth
              multiline
              minRows={5}
            />
            <Button variant="contained" onClick={send}>
              Send To All Users
            </Button>
            {result && <Alert severity="success">{result}</Alert>}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
