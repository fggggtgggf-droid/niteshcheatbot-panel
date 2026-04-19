import { Card, CardContent, Stack, Typography } from '@mui/material'

export default function PlaceholderTab() {
  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Coming Soon
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            This section is ready for the next build-out.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  )
}
