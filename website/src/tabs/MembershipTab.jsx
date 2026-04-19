import { useEffect, useState } from 'react'
import { Alert, Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material'
import { apiGet, apiSend } from '../api.js'

function ensureCashfreeScript() {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) {
      resolve(window.Cashfree)
      return
    }
    const existing = document.querySelector('script[data-cashfree-sdk="1"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Cashfree))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js'
    script.async = true
    script.dataset.cashfreeSdk = '1'
    script.onload = () => resolve(window.Cashfree)
    script.onerror = reject
    document.body.appendChild(script)
  })
}

export default function MembershipTab({ sessionTelegramId, sessionAdminId, adminAccess, onSessionAdminIdChange, onAdminAccessChange }) {
  const [plans, setPlans] = useState([])
  const [paymentRequests, setPaymentRequests] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadingPlanId, setLoadingPlanId] = useState('')

  const refresh = async () => {
    const [ownerPlans, requests] = await Promise.all([apiGet('/owner-plans'), apiGet('/payment-requests')])
    setPlans(ownerPlans.filter((plan) => Number(plan.is_active ?? 1) === 1))
    setPaymentRequests(requests)
  }

  useEffect(() => {
    refresh().catch(() => {
      setPlans([])
      setPaymentRequests([])
    })
  }, [])

  const record = adminAccess?.record || {}

  const launchRenew = async (plan) => {
    setError('')
    setMessage('')
    setLoadingPlanId(String(plan.id))
    try {
      const response = await apiSend('/cashfree/create-order', 'POST', {
        telegram_id: sessionTelegramId,
        admin_id: sessionAdminId,
        plan_id: plan.id,
      })
      if (response.admin_id) {
        onSessionAdminIdChange?.(String(response.admin_id))
        const accessResult = await apiGet(`/admins/access-by-id/${encodeURIComponent(String(response.admin_id))}`)
        onAdminAccessChange?.(accessResult)
      }
      if (!response.payment_session_id) {
        throw new Error('Payment session not returned by backend')
      }
      const CashfreeFactory = await ensureCashfreeScript()
      const cashfree = CashfreeFactory({
        mode: String(response.environment || 'production'),
      })
      await cashfree.checkout({
        paymentSessionId: response.payment_session_id,
        redirectTarget: '_self',
      })
      setMessage('Payment window opened. After payment you will be redirected back for verification.')
    } catch (err) {
      setError(err.message || 'Unable to start payment')
    } finally {
      setLoadingPlanId('')
      refresh().catch(() => {})
    }
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Membership
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Buy or renew your website super admin plan from here. Telegram binding is not required for payment.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="body2">
              Current plan: {record.plan_name || 'Not assigned'} | Status: {record.status || 'inactive'} | Days left:{' '}
              {record.days_left || 0}
            </Typography>
            <Typography variant="body2">Expiry: {record.expires_at || '-'}</Typography>
            <Typography variant="body2">Website Account ID: {sessionAdminId || 'Will be created automatically on first plan purchase'}</Typography>
          </Stack>
        </CardContent>
      </Card>

      {message ? <Alert severity="success">{message}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Grid container spacing={2}>
        {plans.map((plan) => (
          <Grid item xs={12} md={4} key={plan.id}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="overline" sx={{ color: 'secondary.main' }}>
                    AVAILABLE PLAN
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {plan.name}
                  </Typography>
                  <Typography variant="body2">{plan.days} days validity</Typography>
                  <Typography variant="h5">Rs {plan.price}</Typography>
                  <Button
                    variant="contained"
                    disabled={loadingPlanId === String(plan.id)}
                    onClick={() => launchRenew(plan)}
                  >
                    {loadingPlanId === String(plan.id) ? 'Opening Payment...' : 'Renew With This Plan'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  )
}
