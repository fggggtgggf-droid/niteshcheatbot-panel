import { useEffect, useMemo, useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import DashboardTab from './tabs/DashboardTab.jsx'
import UsersTab from './tabs/UsersTab.jsx'
import ManageProductsTab from './tabs/ManageProductsTab.jsx'
import LicenseKeysTab from './tabs/LicenseKeysTab.jsx'
import CustomizationTab from './tabs/CustomizationTab.jsx'
import ButtonsTab from './tabs/ButtonsTab.jsx'
import AdminsTab from './tabs/AdminsTab.jsx'
import ManageResellersTab from './tabs/ManageResellersTab.jsx'
import AnnouncementsTab from './tabs/AnnouncementsTab.jsx'
import PaymentRequestsTab from './tabs/PaymentRequestsTab.jsx'
import PaymentSettingsTab from './tabs/PaymentSettingsTab.jsx'
import ResetRequestsTab from './tabs/ResetRequestsTab.jsx'
import ReportsTab from './tabs/ReportsTab.jsx'
import AdminProfileTab from './tabs/AdminProfileTab.jsx'
import OwnerPlansTab from './tabs/OwnerPlansTab.jsx'
import LoginPage from './LoginPage.jsx'
import { apiGet } from './api.js'
import RenewCallbackPage from './RenewCallbackPage.jsx'

const drawerWidth = 260
const adminTabs = [
  { id: 'dashboard', label: 'Dashboard', component: DashboardTab },
  { id: 'profile', label: 'Profile', component: AdminProfileTab },
  { id: 'announcements', label: 'Announcements', component: AnnouncementsTab },
  { id: 'users', label: 'Manage Users', component: UsersTab },
  { id: 'resellers', label: 'Manage Resellers', component: ManageResellersTab },
  { id: 'products', label: 'Manage Products', component: ManageProductsTab },
  { id: 'license-keys', label: 'License Keys', component: LicenseKeysTab },
  { id: 'payments', label: 'Payment Requests', component: PaymentRequestsTab },
  { id: 'settings', label: 'Settings', component: PaymentSettingsTab },
  { id: 'hwid-resets', label: 'HWID Resets', component: ResetRequestsTab },
  { id: 'customization', label: 'Bot Customization', component: CustomizationTab },
  { id: 'buttons', label: 'Custom Buttons', component: ButtonsTab },
  { id: 'reports', label: 'Reports', component: ReportsTab },
]

const ownerTabs = [
  { id: 'dashboard', label: 'Owner Dashboard', component: DashboardTab },
  { id: 'plans', label: 'Plans', component: OwnerPlansTab },
  { id: 'admins', label: 'Admin Manage', component: AdminsTab },
  { id: 'payments', label: 'Payments', component: PaymentRequestsTab },
  { id: 'settings', label: 'Settings', component: PaymentSettingsTab },
  { id: 'customization', label: 'Brand Settings', component: CustomizationTab },
]

function DrawerContent({ activeTab, onSelect, brandName, panelLabel, tabs }) {
  return (
    <Stack spacing={1} sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #7b5cff, #23f3d1)',
          }}
        />
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {brandName}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {panelLabel}
          </Typography>
        </Box>
      </Stack>
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          variant={activeTab === tab.id ? 'contained' : 'text'}
          color="secondary"
          sx={{ justifyContent: 'flex-start' }}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </Button>
        ))}
    </Stack>
  )
}

export default function App() {
  if (window.location.pathname.startsWith('/renew/callback')) {
    return <RenewCallbackPage />
  }

  const isOwnerRoute = window.location.pathname.startsWith('/owner')
  const allowedRole = isOwnerRoute ? 'owner' : 'admin'
  const tabs = isOwnerRoute ? ownerTabs : adminTabs
  const panelLabel = isOwnerRoute ? 'Owner Panel' : 'Admin Panel'
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'dashboard')
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem('admin-auth') === '1' && (sessionStorage.getItem('admin-role') || 'admin') === allowedRole,
  )
  const [role, setRole] = useState(() => sessionStorage.getItem('admin-role') || allowedRole)
  const [sessionAdminId, setSessionAdminId] = useState(() => sessionStorage.getItem('panel-admin-id') || '')
  const [sessionTelegramId, setSessionTelegramId] = useState(() => sessionStorage.getItem('panel-telegram-id') || '')
  const [sessionLoginEmail, setSessionLoginEmail] = useState(() => sessionStorage.getItem('panel-login-email') || '')
  const [adminAccess, setAdminAccess] = useState(null)
  const [brandName, setBrandName] = useState('REVERSE')

  useEffect(() => {
    apiGet('/settings')
      .then((settings) => {
        setBrandName(settings.brand_name || 'REVERSE')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isOwnerRoute || !authenticated) return
    if (!sessionAdminId && !sessionTelegramId) {
      setAdminAccess(null)
      return
    }
    const path = sessionAdminId
      ? `/admins/access-by-id/${encodeURIComponent(sessionAdminId)}`
      : `/admins/access/${encodeURIComponent(sessionTelegramId)}`
    apiGet(path)
      .then((result) => {
        setAdminAccess(result)
        const nextId = String(result?.record?.id || '')
        if (nextId && nextId !== sessionAdminId) {
          setSessionAdminId(nextId)
          sessionStorage.setItem('panel-admin-id', nextId)
        }
      })
      .catch(() => setAdminAccess({ active: false, reason: 'lookup_failed', record: {} }))
  }, [authenticated, isOwnerRoute, sessionAdminId, sessionTelegramId])

  const visibleTabs = useMemo(() => tabs, [tabs])

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'membership')
    }
  }, [activeTab, visibleTabs])

  if (!authenticated) {
    return (
      <LoginPage
        brandName={brandName}
        forcedRole={allowedRole}
        panelLabel={`${panelLabel} Login`}
        onSuccess={(nextRole) => {
          setRole(nextRole || 'admin')
          setAuthenticated(true)
        }}
      />
    )
  }

  const CurrentComponent =
    visibleTabs.find((tab) => tab.id === activeTab)?.component ?? DashboardTab

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <CssBaseline />
      <AppBar position="fixed" color="transparent" elevation={0} sx={{ backdropFilter: 'blur(10px)' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <IconButton color="inherit" onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {brandName} {panelLabel}
            </Typography>
          </Stack>
        </Toolbar>
      </AppBar>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        variant="temporary"
        ModalProps={{ keepMounted: true }}
        sx={{ '& .MuiDrawer-paper': { width: drawerWidth, overflowY: 'auto' } }}
      >
        <DrawerContent
          activeTab={activeTab}
          brandName={brandName}
          panelLabel={panelLabel}
          tabs={visibleTabs}
          onSelect={(tab) => {
            setActiveTab(tab)
            setDrawerOpen(false)
          }}
        />
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, md: 4 }, pb: 6 }}>
        <Toolbar />
        <CurrentComponent
          role={role}
          adminAccess={adminAccess}
          sessionAdminId={sessionAdminId}
          sessionTelegramId={sessionTelegramId}
          sessionLoginEmail={sessionLoginEmail}
          onSessionAdminIdChange={(value) => {
            setSessionAdminId(value)
            if (value) {
              sessionStorage.setItem('panel-admin-id', value)
            } else {
              sessionStorage.removeItem('panel-admin-id')
            }
          }}
          onSessionTelegramIdChange={(value) => {
            setSessionTelegramId(value)
            if (value) {
              sessionStorage.setItem('panel-telegram-id', value)
            } else {
              sessionStorage.removeItem('panel-telegram-id')
            }
          }}
          onSessionLoginEmailChange={(value) => {
            setSessionLoginEmail(value)
            if (value) {
              sessionStorage.setItem('panel-login-email', value)
            } else {
              sessionStorage.removeItem('panel-login-email')
            }
          }}
          onAdminAccessChange={setAdminAccess}
        />
      </Box>
    </Box>
  )
}
