import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Modal,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined'
import { apiGet, apiSend } from '../api.js'

const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(720px, 92vw)',
  maxHeight: '86vh',
  bgcolor: '#0f1018',
  borderRadius: 3,
  p: 3,
  boxShadow: '0 25px 70px rgba(0,0,0,0.6)',
  border: '1px solid rgba(123,92,255,0.25)',
  overflowY: 'auto',
}

const emptyProduct = {
  name: '',
  video_url: '',
  price_chart: '',
  maintenance_mode: false,
  is_recommended: false,
  features: '',
  media: '',
  sort_order: 0,
  is_active: true,
}

const emptyTier = {
  id: '',
  name: '1 Day',
  price: 0,
  duration_days: 1,
  reseller_price: 0,
  hwid_reset_limit: 0,
  sort_order: 0,
  is_active: true,
}

const createTier = (overrides = {}) => ({
  ...emptyTier,
  ...overrides,
})

export default function ManageProductsTab() {
  const [products, setProducts] = useState([])
  const [plans, setPlans] = useState([])
  const [actions, setActions] = useState([])
  const [open, setOpen] = useState(false)
  const [featureDraft, setFeatureDraft] = useState('')
  const [mediaDraft, setMediaDraft] = useState('')
  const [actionDrafts, setActionDrafts] = useState([])
  const [deletedActionIds, setDeletedActionIds] = useState([])
  const [editingId, setEditingId] = useState('')
  const [newProduct, setNewProduct] = useState(emptyProduct)
  const [newTiers, setNewTiers] = useState([createTier()])
  const [deletedTierIds, setDeletedTierIds] = useState([])

  const refresh = async () => {
    const [productsData, plansData, actionsData] = await Promise.all([
      apiGet('/products'),
      apiGet('/plans'),
      apiGet('/product-actions'),
    ])
    setProducts(productsData)
    setPlans(plansData)
    setActions(actionsData)
  }

  useEffect(() => {
    refresh().catch(() => {})
  }, [])

  const plansByProduct = useMemo(() => {
    const grouped = {}
    for (const plan of plans) {
      grouped[String(plan.product_id)] = grouped[String(plan.product_id)] || []
      grouped[String(plan.product_id)].push(plan)
    }
    return grouped
  }, [plans])

  const openCreate = () => {
    setEditingId('')
    setNewProduct(emptyProduct)
    setNewTiers([createTier()])
    setDeletedTierIds([])
    setActionDrafts([])
    setDeletedActionIds([])
    setFeatureDraft('')
    setMediaDraft('')
    setOpen(true)
  }

  const openEdit = (product) => {
    const productId = String(product.id)
    const productPlans = [...(plansByProduct[productId] || [])].sort(
      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0),
    )
    const productActions = actions
      .filter((item) => String(item.product_id) === productId)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

    setEditingId(productId)
    setNewProduct({
      name: product.name || '',
      video_url: product.video_url || '',
      price_chart: product.price_chart || '',
      maintenance_mode: !!Number(product.maintenance_mode),
      is_recommended: !!Number(product.is_recommended),
      features: product.features || '',
      media: product.media || '',
      sort_order: Number(product.sort_order || 0),
      is_active: !!Number(product.is_active ?? 1),
    })
    setNewTiers(
      productPlans.length
        ? productPlans.map((plan, index) =>
            createTier({
              id: plan.id || '',
              name: plan.name || `${index + 1} Day`,
              price: Number(plan.price || 0),
              duration_days: Number(plan.duration_days || 1),
              reseller_price: Number(plan.reseller_price || 0),
              hwid_reset_limit: Number(plan.hwid_reset_limit || 0),
              sort_order: Number(plan.sort_order || index),
              is_active: !!Number(plan.is_active ?? 1),
            }),
          )
        : [createTier()],
    )
    setDeletedTierIds([])
    setActionDrafts(
      productActions.map((item) => ({
        id: item.id,
        label: item.label || '',
        url: item.url || '',
        sort_order: Number(item.sort_order || 0),
        is_active: !!Number(item.is_active ?? 1),
      })),
    )
    setDeletedActionIds([])
    setFeatureDraft('')
    setMediaDraft('')
    setOpen(true)
  }

  const saveProduct = async () => {
    if (!newProduct.name.trim()) return

    const productPayload = {
      ...newProduct,
      maintenance_mode: newProduct.maintenance_mode ? 1 : 0,
      is_recommended: newProduct.is_recommended ? 1 : 0,
      is_active: newProduct.is_active ? 1 : 0,
      sort_order: Number(newProduct.sort_order || 0),
    }

    let productId = editingId
    if (editingId) {
      await apiSend(`/products/${editingId}`, 'PUT', productPayload)
    } else {
      const created = await apiSend('/products', 'POST', productPayload)
      productId = String(created.id)
    }

    for (const tierId of deletedTierIds) {
      await apiSend(`/plans/${tierId}`, 'DELETE')
    }

    const validTiers = newTiers.filter((tier) => tier.name.trim())
    for (const [index, tier] of validTiers.entries()) {
      const tierPayload = {
        product_id: productId,
        name: tier.name,
        price: Number(tier.price || 0),
        duration_days: Number(tier.duration_days || 1),
        reseller_price: Number(tier.reseller_price || 0),
        hwid_reset_limit: Number(tier.hwid_reset_limit || 0),
        stock: editingId ? undefined : 0,
        sort_order: index,
        is_active: tier.is_active ? 1 : 0,
      }

      if (tier.id) {
        await apiSend(`/plans/${tier.id}`, 'PUT', {
          ...tierPayload,
          stock: undefined,
        })
      } else {
        await apiSend('/plans', 'POST', tierPayload)
      }
    }

    for (const actionId of deletedActionIds) {
      await apiSend(`/product-actions/${actionId}`, 'DELETE')
    }

    const validActions = actionDrafts
      .filter((item) => item.label.trim() && item.url.trim())
      .map((item, index) => ({
        ...item,
        product_id: productId,
        sort_order: index + 1,
        is_active: item.is_active ? 1 : 0,
      }))

    for (const action of validActions) {
      if (action.id) {
        await apiSend(`/product-actions/${action.id}`, 'PUT', action)
      } else {
        await apiSend('/product-actions', 'POST', action)
      }
    }

    setEditingId('')
    setNewProduct(emptyProduct)
    setNewTiers([createTier()])
    setDeletedTierIds([])
    setActionDrafts([])
    setDeletedActionIds([])
    setFeatureDraft('')
    setMediaDraft('')
    setOpen(false)
    refresh()
  }

  const deleteProduct = async (product) => {
    const productId = String(product.id)
    await Promise.all(
      (plansByProduct[productId] || []).map((plan) => apiSend(`/plans/${plan.id}`, 'DELETE')),
    )
    await Promise.all(
      actions
        .filter((item) => String(item.product_id) === productId)
        .map((item) => apiSend(`/product-actions/${item.id}`, 'DELETE')),
    )
    await apiSend(`/products/${productId}`, 'DELETE')
    refresh()
  }

  const toggleMaintenance = async (product) => {
    await apiSend(`/products/${product.id}`, 'PUT', {
      maintenance_mode: Number(product.maintenance_mode) ? 0 : 1,
    })
    refresh()
  }

  const addFeature = () => {
    if (!featureDraft.trim()) return
    setNewProduct((prev) => ({
      ...prev,
      features: prev.features ? `${prev.features}\n${featureDraft.trim()}` : featureDraft.trim(),
    }))
    setFeatureDraft('')
  }

  const addMedia = () => {
    if (!mediaDraft.trim()) return
    setNewProduct((prev) => ({
      ...prev,
      media: prev.media ? `${prev.media}\n${mediaDraft.trim()}` : mediaDraft.trim(),
      video_url: prev.video_url || mediaDraft.trim(),
    }))
    setMediaDraft('')
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" sx={{ alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Marketplace Editor
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Configure premium products, videos, and duration tiers.
          </Typography>
        </Box>
        <Button variant="contained" onClick={openCreate}>
          + Create Product
        </Button>
      </Stack>

      {products.map((product) => {
        const productId = String(product.id)
        return (
          <Card key={product.id}>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" sx={{ alignItems: 'center' }}>
                  <Typography variant="h6">{product.name}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Maintenance">
                      <IconButton onClick={() => toggleMaintenance(product)}>
                        <BuildCircleOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton onClick={() => openEdit(product)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton color="error" onClick={() => deleteProduct(product)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Media: {(product.media || '').split('\n').filter(Boolean).length}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Tiers: {plansByProduct[productId]?.length || 0}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Status: {Number(product.maintenance_mode) ? 'Maintenance' : 'Live'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Recommended: {Number(product.is_recommended) ? 'Yes' : 'No'}
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )
      })}

      <Modal open={open} onClose={() => setOpen(false)}>
        <Box sx={modalStyle}>
          <Stack spacing={3}>
            <Typography variant="h6">
              {editingId ? 'Edit Product Configuration' : 'New Product Configuration'}
            </Typography>

            <Card>
              <CardContent>
                <Typography variant="overline">Core Information</Typography>
                <Stack spacing={2} mt={1}>
                  <TextField
                    label="Product Title"
                    value={newProduct.name}
                    onChange={(event) =>
                      setNewProduct((prev) => ({ ...prev, name: event.target.value }))
                    }
                    fullWidth
                  />
                  <Stack direction="row" spacing={2}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={newProduct.maintenance_mode}
                          onChange={(event) =>
                            setNewProduct((prev) => ({
                              ...prev,
                              maintenance_mode: event.target.checked,
                            }))
                          }
                        />
                      }
                      label="Enable Maintenance Mode"
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={newProduct.is_recommended}
                          onChange={(event) =>
                            setNewProduct((prev) => ({
                              ...prev,
                              is_recommended: event.target.checked,
                            }))
                          }
                        />
                      }
                      label="Mark as Recommended"
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" sx={{ alignItems: 'center' }}>
                  <Typography variant="overline">Action Buttons (e.g. Update File, Telegram)</Typography>
                  <Button
                    variant="outlined"
                    onClick={() =>
                      setActionDrafts((prev) => [
                        ...prev,
                        { label: '', url: '', sort_order: prev.length + 1, is_active: true },
                      ])
                    }
                  >
                    Add Button
                  </Button>
                </Stack>
                <Stack spacing={2} mt={2}>
                  {actionDrafts.map((action, index) => (
                    <Stack key={`${action.id || 'new'}-${index}`} direction={{ xs: 'column', md: 'row' }} spacing={2}>
                      <TextField
                        label="Button Text"
                        value={action.label}
                        onChange={(event) =>
                          setActionDrafts((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, label: event.target.value } : item,
                            ),
                          )
                        }
                        fullWidth
                      />
                      <TextField
                        label="URL / Link"
                        value={action.url}
                        onChange={(event) =>
                          setActionDrafts((prev) =>
                            prev.map((item, i) =>
                              i === index ? { ...item, url: event.target.value } : item,
                            ),
                          )
                        }
                        fullWidth
                      />
                      <Button
                        color="error"
                        variant="text"
                        onClick={() =>
                          setActionDrafts((prev) => {
                            const target = prev[index]
                            if (target?.id) {
                              setDeletedActionIds((ids) => [...ids, target.id])
                            }
                            return prev.filter((_, i) => i !== index)
                          })
                        }
                      >
                        X
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" sx={{ alignItems: 'center' }}>
                  <Typography variant="overline">Product Details / Features</Typography>
                  <Button variant="outlined" onClick={addFeature}>
                    Add Feature
                  </Button>
                </Stack>
                <Stack spacing={2} mt={2}>
                  <TextField
                    label="Feature Name"
                    value={featureDraft}
                    onChange={(event) => setFeatureDraft(event.target.value)}
                    fullWidth
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {(newProduct.features || '')
                      .split('\n')
                      .filter(Boolean)
                      .map((feature) => (
                        <Chip
                          key={feature}
                          label={feature}
                          onDelete={() =>
                            setNewProduct((prev) => ({
                              ...prev,
                              features: prev.features
                                .split('\n')
                                .filter((item) => item !== feature)
                                .join('\n'),
                            }))
                          }
                        />
                      ))}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" sx={{ alignItems: 'center' }}>
                  <Typography variant="overline">Gallery Media (Images/Videos)</Typography>
                  <Button variant="outlined" onClick={addMedia}>
                    Add Media
                  </Button>
                </Stack>
                <Stack spacing={2} mt={2}>
                  <TextField
                    label="Telegram Video URL / Media URL"
                    value={mediaDraft}
                    onChange={(event) => setMediaDraft(event.target.value)}
                    fullWidth
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {(newProduct.media || '')
                      .split('\n')
                      .filter(Boolean)
                      .map((media) => (
                        <Chip
                          key={media}
                          label={media}
                          onDelete={() =>
                            setNewProduct((prev) => ({
                              ...prev,
                              media: prev.media
                                .split('\n')
                                .filter((item) => item !== media)
                                .join('\n'),
                            }))
                          }
                        />
                      ))}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" sx={{ alignItems: 'center' }}>
                  <Typography variant="overline">Duration Tiers</Typography>
                  <Button
                    variant="outlined"
                    onClick={() =>
                      setNewTiers((prev) => [
                        ...prev,
                        createTier({
                          name: `${prev.length + 1} Day`,
                          duration_days: prev.length + 1,
                          sort_order: prev.length,
                        }),
                      ])
                    }
                  >
                    Add Tier
                  </Button>
                </Stack>
                <Stack spacing={2} mt={2}>
                  {newTiers.map((tier, index) => (
                    <Card
                      key={`${tier.id || 'new'}-${index}`}
                      sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <CardContent>
                        <Stack spacing={2}>
                          <Stack direction="row" justifyContent="space-between" sx={{ alignItems: 'center' }}>
                            <Typography variant="subtitle2">Tier #{index + 1}</Typography>
                            {newTiers.length > 1 ? (
                              <Button
                                variant="outlined"
                                color="error"
                                onClick={() => {
                                  if (tier.id) {
                                    setDeletedTierIds((prev) => [...prev, tier.id])
                                  }
                                  setNewTiers((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                                }}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </Stack>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField
                              label="Tier Name"
                              value={tier.name}
                              onChange={(event) =>
                                setNewTiers((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, name: event.target.value } : item,
                                  ),
                                )
                              }
                              fullWidth
                            />
                            <TextField
                              label="Price"
                              type="number"
                              value={tier.price}
                              onChange={(event) =>
                                setNewTiers((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, price: event.target.value } : item,
                                  ),
                                )
                              }
                              fullWidth
                            />
                            <TextField
                              label="Days"
                              type="number"
                              value={tier.duration_days}
                              onChange={(event) =>
                                setNewTiers((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, duration_days: event.target.value } : item,
                                  ),
                                )
                              }
                              fullWidth
                            />
                          </Stack>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField
                              label="Reseller Price"
                              type="number"
                              value={tier.reseller_price}
                              onChange={(event) =>
                                setNewTiers((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, reseller_price: event.target.value } : item,
                                  ),
                                )
                              }
                              fullWidth
                            />
                            <TextField
                              label="Reset Limit"
                              type="number"
                              value={tier.hwid_reset_limit}
                              onChange={(event) =>
                                setNewTiers((prev) =>
                                  prev.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, hwid_reset_limit: event.target.value } : item,
                                  ),
                                )
                              }
                              fullWidth
                            />
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Divider />

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="contained" onClick={saveProduct}>
                {editingId ? 'Save Product' : 'Publish Product'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Modal>
    </Stack>
  )
}
