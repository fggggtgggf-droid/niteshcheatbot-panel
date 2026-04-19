import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  Divider,
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

export default function CatalogTab() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [plans, setPlans] = useState([])
  const [productActions, setProductActions] = useState([])
  const [generatedKeys, setGeneratedKeys] = useState([])

  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    sort_order: 0,
    is_active: true,
  })
  const [newProduct, setNewProduct] = useState({
    category_id: '',
    name: '',
    description: '',
    video_url: '',
    price_chart: '',
    hwid_reset_limit: 0,
    maintenance_mode: false,
    is_recommended: false,
    features: '',
    media: '',
    sort_order: 0,
    is_active: true,
  })
  const [newPlan, setNewPlan] = useState({
    product_id: '',
    name: '1 Day',
    price: 0,
    duration_days: 1,
    stock: 0,
    reseller_price: 0,
    hwid_reset_limit: 0,
    sort_order: 0,
    is_active: true,
  })
  const [newAction, setNewAction] = useState({
    product_id: '',
    label: '',
    url: '',
    sort_order: 0,
    is_active: true,
  })
  const [licenseForm, setLicenseForm] = useState({
    product_id: '',
    plan_id: '',
    quantity: 1,
    hwid_reset_limit: 0,
    reseller_price: 0,
  })

  const refresh = async () => {
    const [categoriesData, productsData, plansData, actionsData] = await Promise.all([
      apiGet('/categories'),
      apiGet('/products'),
      apiGet('/plans'),
      apiGet('/product-actions'),
    ])
    setCategories(categoriesData)
    setProducts(productsData)
    setPlans(plansData)
    setProductActions(actionsData)
  }

  useEffect(() => {
    refresh().catch(() => {
      setCategories([])
      setProducts([])
      setPlans([])
    })
  }, [])

  const updateItem = (setter, id, field, value) => {
    setter((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const addCategory = async () => {
    if (!newCategory.name.trim()) return
    await apiSend('/categories', 'POST', {
      ...newCategory,
      is_active: newCategory.is_active ? 1 : 0,
    })
    setNewCategory({ name: '', description: '', sort_order: 0, is_active: true })
    refresh()
  }

  const saveCategory = async (category) => {
    await apiSend(`/categories/${category.id}`, 'PUT', {
      ...category,
      is_active: category.is_active ? 1 : 0,
    })
    refresh()
  }

  const deleteCategory = async (categoryId) => {
    await apiSend(`/categories/${categoryId}`, 'DELETE')
    refresh()
  }

  const addProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.category_id) return
    await apiSend('/products', 'POST', {
      ...newProduct,
      category_id: Number(newProduct.category_id),
      hwid_reset_limit: Number(newProduct.hwid_reset_limit || 0),
      maintenance_mode: newProduct.maintenance_mode ? 1 : 0,
      is_recommended: newProduct.is_recommended ? 1 : 0,
      is_active: newProduct.is_active ? 1 : 0,
    })
    setNewProduct({
      category_id: newProduct.category_id,
      name: '',
      description: '',
      video_url: '',
      price_chart: '',
      hwid_reset_limit: 0,
      maintenance_mode: false,
      is_recommended: false,
      features: '',
      media: '',
      sort_order: 0,
      is_active: true,
    })
    refresh()
  }

  const saveProduct = async (product) => {
    await apiSend(`/products/${product.id}`, 'PUT', {
      ...product,
      hwid_reset_limit: Number(product.hwid_reset_limit || 0),
      maintenance_mode: product.maintenance_mode ? 1 : 0,
      is_recommended: product.is_recommended ? 1 : 0,
      is_active: product.is_active ? 1 : 0,
    })
    refresh()
  }

  const deleteProduct = async (productId) => {
    await apiSend(`/products/${productId}`, 'DELETE')
    refresh()
  }

  const addPlan = async () => {
    if (!newPlan.product_id || !newPlan.name.trim()) return
    await apiSend('/plans', 'POST', {
      ...newPlan,
      product_id: Number(newPlan.product_id),
      price: Number(newPlan.price),
      duration_days: Number(newPlan.duration_days),
      stock: Number(newPlan.stock),
      reseller_price: Number(newPlan.reseller_price),
      hwid_reset_limit: Number(newPlan.hwid_reset_limit),
      is_active: newPlan.is_active ? 1 : 0,
    })
    setNewPlan({
      product_id: newPlan.product_id,
      name: '1 Day',
      price: 0,
      duration_days: 1,
      stock: 0,
      reseller_price: 0,
      hwid_reset_limit: 0,
      sort_order: 0,
      is_active: true,
    })
    refresh()
  }

  const savePlan = async (plan) => {
    await apiSend(`/plans/${plan.id}`, 'PUT', {
      ...plan,
      price: Number(plan.price),
      duration_days: Number(plan.duration_days),
      stock: Number(plan.stock),
      reseller_price: Number(plan.reseller_price),
      hwid_reset_limit: Number(plan.hwid_reset_limit),
      is_active: plan.is_active ? 1 : 0,
    })
    refresh()
  }

  const deletePlan = async (planId) => {
    await apiSend(`/plans/${planId}`, 'DELETE')
    refresh()
  }

  const actionsForProduct = (productId) =>
    productActions.filter((action) => action.product_id === productId)

  const addAction = async () => {
    if (!newAction.product_id || !newAction.label.trim() || !newAction.url.trim()) return
    await apiSend('/product-actions', 'POST', {
      ...newAction,
      product_id: Number(newAction.product_id),
      is_active: newAction.is_active ? 1 : 0,
    })
    setNewAction({
      product_id: newAction.product_id,
      label: '',
      url: '',
      sort_order: 0,
      is_active: true,
    })
    refresh()
  }

  const updateAction = (id, field, value) => {
    setProductActions((prev) =>
      prev.map((action) => (action.id === id ? { ...action, [field]: value } : action)),
    )
  }

  const saveAction = async (action) => {
    await apiSend(`/product-actions/${action.id}`, 'PUT', {
      ...action,
      is_active: action.is_active ? 1 : 0,
    })
    refresh()
  }

  const deleteAction = async (actionId) => {
    await apiSend(`/product-actions/${actionId}`, 'DELETE')
    refresh()
  }

  const generateKeys = async () => {
    if (!licenseForm.product_id || !licenseForm.plan_id) return
    const result = await apiSend('/licenses/generate', 'POST', {
      ...licenseForm,
      product_id: Number(licenseForm.product_id),
      plan_id: Number(licenseForm.plan_id),
      quantity: Number(licenseForm.quantity),
      hwid_reset_limit: Number(licenseForm.hwid_reset_limit),
      reseller_price: Number(licenseForm.reseller_price),
    })
    setGeneratedKeys(result.keys || [])
  }

  return (
    <Stack spacing={4}>
      <Stack spacing={1}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          &gt;&gt; Product Management
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Configure products, tiers, stock, and license keys.
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Typography variant="h6">Add Category</Typography>
          <Stack spacing={2} mt={2}>
            <TextField
              label="Name"
              value={newCategory.name}
              onChange={(event) => setNewCategory((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Description"
              value={newCategory.description}
              onChange={(event) =>
                setNewCategory((prev) => ({ ...prev, description: event.target.value }))
              }
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Sort Order"
                type="number"
                value={newCategory.sort_order}
                onChange={(event) =>
                  setNewCategory((prev) => ({
                    ...prev,
                    sort_order: Number(event.target.value),
                  }))
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={newCategory.is_active}
                    onChange={(event) =>
                      setNewCategory((prev) => ({ ...prev, is_active: event.target.checked }))
                    }
                  />
                }
                label="Active"
              />
            </Stack>
            <Button variant="contained" onClick={addCategory}>
              Add Category
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {categories.map((category) => (
        <Card key={category.id}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Category #{category.id}</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Name"
                  value={category.name}
                  onChange={(event) => updateItem(setCategories, category.id, 'name', event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Sort"
                  type="number"
                  value={category.sort_order}
                  onChange={(event) =>
                    updateItem(setCategories, category.id, 'sort_order', Number(event.target.value))
                  }
                  sx={{ width: 140 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={category.is_active === 1}
                      onChange={(event) =>
                        updateItem(
                          setCategories,
                          category.id,
                          'is_active',
                          event.target.checked ? 1 : 0,
                        )
                      }
                    />
                  }
                  label="Active"
                />
              </Stack>
              <TextField
                label="Description"
                value={category.description || ''}
                onChange={(event) =>
                  updateItem(setCategories, category.id, 'description', event.target.value)
                }
                fullWidth
                multiline
                minRows={2}
              />
              <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={() => saveCategory(category)}>
                  Save
                </Button>
                <Button variant="outlined" onClick={() => deleteCategory(category.id)}>
                  Delete
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Divider />

      <Card>
        <CardContent>
          <Typography variant="h6">New Product Configuration</Typography>
          <Stack spacing={2} mt={2}>
            <Typography variant="overline">Core Information</Typography>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                label="Category"
                value={newProduct.category_id}
                onChange={(event) =>
                  setNewProduct((prev) => ({ ...prev, category_id: event.target.value }))
                }
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Name"
              value={newProduct.name}
              onChange={(event) => setNewProduct((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Description"
              value={newProduct.description}
              onChange={(event) =>
                setNewProduct((prev) => ({ ...prev, description: event.target.value }))
              }
              fullWidth
            />
            <Typography variant="overline">Product Details / Features</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="HWID Reset Limit"
                type="number"
                value={newProduct.hwid_reset_limit}
                onChange={(event) =>
                  setNewProduct((prev) => ({
                    ...prev,
                    hwid_reset_limit: Number(event.target.value),
                  }))
                }
              />
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
                label="Maintenance Mode"
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
                label="Recommended"
              />
            </Stack>
            <TextField
              label="Video URL or Telegram File ID"
              value={newProduct.video_url}
              onChange={(event) =>
                setNewProduct((prev) => ({ ...prev, video_url: event.target.value }))
              }
              fullWidth
            />
            <TextField
              label="Price Chart Text"
              value={newProduct.price_chart}
              onChange={(event) =>
                setNewProduct((prev) => ({ ...prev, price_chart: event.target.value }))
              }
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Features (one per line)"
              value={newProduct.features}
              onChange={(event) =>
                setNewProduct((prev) => ({ ...prev, features: event.target.value }))
              }
              fullWidth
              multiline
              minRows={3}
            />
            <Typography variant="overline">Gallery Media (Images/Videos)</Typography>
            <TextField
              label="Gallery Media URLs (one per line)"
              value={newProduct.media}
              onChange={(event) =>
                setNewProduct((prev) => ({ ...prev, media: event.target.value }))
              }
              fullWidth
              multiline
              minRows={3}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Sort Order"
                type="number"
                value={newProduct.sort_order}
                onChange={(event) =>
                  setNewProduct((prev) => ({
                    ...prev,
                    sort_order: Number(event.target.value),
                  }))
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={newProduct.is_active}
                    onChange={(event) =>
                      setNewProduct((prev) => ({ ...prev, is_active: event.target.checked }))
                    }
                  />
                }
                label="Active"
              />
            </Stack>
            <Button variant="contained" onClick={addProduct}>
              Add Product
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {products.map((product) => (
        <Card key={product.id}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Product #{product.id}</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select
                    label="Category"
                    value={product.category_id}
                    onChange={(event) =>
                      updateItem(setProducts, product.id, 'category_id', Number(event.target.value))
                    }
                  >
                    {categories.map((category) => (
                      <MenuItem key={category.id} value={category.id}>
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Name"
                  value={product.name}
                  onChange={(event) => updateItem(setProducts, product.id, 'name', event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Sort"
                  type="number"
                  value={product.sort_order}
                  onChange={(event) =>
                    updateItem(setProducts, product.id, 'sort_order', Number(event.target.value))
                  }
                  sx={{ width: 140 }}
                />
              </Stack>
              <TextField
                label="Description"
                value={product.description || ''}
                onChange={(event) =>
                  updateItem(setProducts, product.id, 'description', event.target.value)
                }
                fullWidth
                multiline
                minRows={2}
              />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="HWID Reset Limit"
                  type="number"
                  value={product.hwid_reset_limit || 0}
                  onChange={(event) =>
                    updateItem(
                      setProducts,
                      product.id,
                      'hwid_reset_limit',
                      Number(event.target.value),
                    )
                  }
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={product.maintenance_mode === 1}
                      onChange={(event) =>
                        updateItem(
                          setProducts,
                          product.id,
                          'maintenance_mode',
                          event.target.checked ? 1 : 0,
                        )
                      }
                    />
                  }
                  label="Maintenance"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={product.is_recommended === 1}
                      onChange={(event) =>
                        updateItem(
                          setProducts,
                          product.id,
                          'is_recommended',
                          event.target.checked ? 1 : 0,
                        )
                      }
                    />
                  }
                  label="Recommended"
                />
              </Stack>
              <TextField
                label="Video URL or Telegram File ID"
                value={product.video_url || ''}
                onChange={(event) =>
                  updateItem(setProducts, product.id, 'video_url', event.target.value)
                }
                fullWidth
              />
              <TextField
                label="Price Chart Text"
                value={product.price_chart || ''}
                onChange={(event) =>
                  updateItem(setProducts, product.id, 'price_chart', event.target.value)
                }
                fullWidth
                multiline
                minRows={2}
              />
              <TextField
                label="Features (one per line)"
                value={product.features || ''}
                onChange={(event) =>
                  updateItem(setProducts, product.id, 'features', event.target.value)
                }
                fullWidth
                multiline
                minRows={3}
              />
              <TextField
                label="Gallery Media URLs (one per line)"
                value={product.media || ''}
                onChange={(event) => updateItem(setProducts, product.id, 'media', event.target.value)}
                fullWidth
                multiline
                minRows={3}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={product.is_active === 1}
                    onChange={(event) =>
                      updateItem(
                        setProducts,
                        product.id,
                        'is_active',
                        event.target.checked ? 1 : 0,
                      )
                    }
                  />
                }
                label="Active"
              />
              <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={() => saveProduct(product)}>
                  Save
                </Button>
                <Button variant="outlined" onClick={() => deleteProduct(product.id)}>
                  Delete
                </Button>
              </Stack>
              <Divider />
              <Typography variant="overline">Action Buttons (e.g. Update File, Telegram)</Typography>
              {actionsForProduct(product.id).map((action) => (
                <Stack
                  key={action.id}
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  sx={{ alignItems: 'center' }}
                >
                  <TextField
                    label="Button Text"
                    value={action.label}
                    onChange={(event) =>
                      updateAction(action.id, 'label', event.target.value)
                    }
                    fullWidth
                  />
                  <TextField
                    label="URL / Link"
                    value={action.url}
                    onChange={(event) => updateAction(action.id, 'url', event.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Sort"
                    type="number"
                    value={action.sort_order}
                    onChange={(event) =>
                      updateAction(action.id, 'sort_order', Number(event.target.value))
                    }
                    sx={{ width: 120 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={action.is_active === 1}
                        onChange={(event) =>
                          updateAction(
                            action.id,
                            'is_active',
                            event.target.checked ? 1 : 0,
                          )
                        }
                      />
                    }
                    label="Active"
                  />
                  <Button variant="contained" onClick={() => saveAction(action)}>
                    Save
                  </Button>
                  <Button variant="outlined" onClick={() => deleteAction(action.id)}>
                    Delete
                  </Button>
                </Stack>
              ))}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
                <TextField
                  label="Button Text"
                  value={newAction.label}
                  onChange={(event) =>
                    setNewAction((prev) => ({ ...prev, label: event.target.value, product_id: product.id }))
                  }
                  fullWidth
                />
                <TextField
                  label="URL / Link"
                  value={newAction.url}
                  onChange={(event) =>
                    setNewAction((prev) => ({ ...prev, url: event.target.value, product_id: product.id }))
                  }
                  fullWidth
                />
                <TextField
                  label="Sort"
                  type="number"
                  value={newAction.sort_order}
                  onChange={(event) =>
                    setNewAction((prev) => ({ ...prev, sort_order: Number(event.target.value), product_id: product.id }))
                  }
                  sx={{ width: 120 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={newAction.is_active}
                      onChange={(event) =>
                        setNewAction((prev) => ({
                          ...prev,
                          is_active: event.target.checked,
                          product_id: product.id,
                        }))
                      }
                    />
                  }
                  label="Active"
                />
                <Button variant="contained" onClick={addAction}>
                  Add Button
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Divider />

      <Card>
        <CardContent>
          <Typography variant="h6">Duration Tiers</Typography>
          <Stack spacing={2} mt={2}>
            <FormControl fullWidth>
              <InputLabel>Product</InputLabel>
              <Select
                label="Product"
                value={newPlan.product_id}
                onChange={(event) =>
                  setNewPlan((prev) => ({ ...prev, product_id: event.target.value }))
                }
              >
                {products.map((product) => (
                  <MenuItem key={product.id} value={product.id}>
                    {product.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Plan Name"
              value={newPlan.name}
              onChange={(event) => setNewPlan((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Price"
                type="number"
                value={newPlan.price}
                onChange={(event) => setNewPlan((prev) => ({ ...prev, price: event.target.value }))}
                fullWidth
              />
              <TextField
                label="Duration Days"
                type="number"
                value={newPlan.duration_days}
                onChange={(event) =>
                  setNewPlan((prev) => ({ ...prev, duration_days: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Stock"
                type="number"
                value={newPlan.stock}
                onChange={(event) => setNewPlan((prev) => ({ ...prev, stock: event.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Reseller Price"
                type="number"
                value={newPlan.reseller_price}
                onChange={(event) =>
                  setNewPlan((prev) => ({ ...prev, reseller_price: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="HWID Reset Limit"
                type="number"
                value={newPlan.hwid_reset_limit}
                onChange={(event) =>
                  setNewPlan((prev) => ({ ...prev, hwid_reset_limit: event.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Sort"
                type="number"
                value={newPlan.sort_order}
                onChange={(event) =>
                  setNewPlan((prev) => ({ ...prev, sort_order: event.target.value }))
                }
                fullWidth
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={newPlan.is_active}
                  onChange={(event) =>
                    setNewPlan((prev) => ({ ...prev, is_active: event.target.checked }))
                  }
                />
              }
              label="Active"
            />
            <Button variant="contained" onClick={addPlan}>
              Add Plan
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {plans.map((plan) => (
        <Card key={plan.id}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Plan #{plan.id}</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel>Product</InputLabel>
                  <Select
                    label="Product"
                    value={plan.product_id}
                    onChange={(event) =>
                      updateItem(setPlans, plan.id, 'product_id', Number(event.target.value))
                    }
                  >
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Plan Name"
                  value={plan.name}
                  onChange={(event) => updateItem(setPlans, plan.id, 'name', event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Price"
                  type="number"
                  value={plan.price}
                  onChange={(event) =>
                    updateItem(setPlans, plan.id, 'price', Number(event.target.value))
                  }
                  fullWidth
                />
                <TextField
                  label="Stock"
                  type="number"
                  value={plan.stock}
                  onChange={(event) =>
                    updateItem(setPlans, plan.id, 'stock', Number(event.target.value))
                  }
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Duration Days"
                  type="number"
                  value={plan.duration_days}
                  onChange={(event) =>
                    updateItem(setPlans, plan.id, 'duration_days', Number(event.target.value))
                  }
                  fullWidth
                />
                <TextField
                  label="Reseller Price"
                  type="number"
                  value={plan.reseller_price}
                  onChange={(event) =>
                    updateItem(setPlans, plan.id, 'reseller_price', Number(event.target.value))
                  }
                  fullWidth
                />
                <TextField
                  label="HWID Reset Limit"
                  type="number"
                  value={plan.hwid_reset_limit}
                  onChange={(event) =>
                    updateItem(setPlans, plan.id, 'hwid_reset_limit', Number(event.target.value))
                  }
                  fullWidth
                />
                <TextField
                  label="Sort"
                  type="number"
                  value={plan.sort_order}
                  onChange={(event) =>
                    updateItem(setPlans, plan.id, 'sort_order', Number(event.target.value))
                  }
                  fullWidth
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={plan.is_active === 1}
                      onChange={(event) =>
                        updateItem(
                          setPlans,
                          plan.id,
                          'is_active',
                          event.target.checked ? 1 : 0,
                        )
                      }
                    />
                  }
                  label="Active"
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={() => savePlan(plan)}>
                  Save
                </Button>
                <Button variant="outlined" onClick={() => deletePlan(plan.id)}>
                  Delete
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}

      <Divider />

      <Card>
        <CardContent>
          <Typography variant="h6">Generate License Keys</Typography>
          <Stack spacing={2} mt={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Select Product</InputLabel>
                <Select
                  label="Select Product"
                  value={licenseForm.product_id}
                  onChange={(event) =>
                    setLicenseForm((prev) => ({ ...prev, product_id: event.target.value }))
                  }
                >
                  {products.map((product) => (
                    <MenuItem key={product.id} value={product.id}>
                      {product.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Select Duration</InputLabel>
                <Select
                  label="Select Duration"
                  value={licenseForm.plan_id}
                  onChange={(event) =>
                    setLicenseForm((prev) => ({ ...prev, plan_id: event.target.value }))
                  }
                >
                  {plans
                    .filter((plan) =>
                      licenseForm.product_id ? plan.product_id === Number(licenseForm.product_id) : true,
                    )
                    .map((plan) => (
                      <MenuItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Quantity"
                type="number"
                value={licenseForm.quantity}
                onChange={(event) =>
                  setLicenseForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))
                }
                fullWidth
                helperText="Max 100 keys at once"
              />
              <TextField
                label="HWID Reset Limit"
                type="number"
                value={licenseForm.hwid_reset_limit}
                onChange={(event) =>
                  setLicenseForm((prev) => ({
                    ...prev,
                    hwid_reset_limit: Number(event.target.value),
                  }))
                }
                fullWidth
              />
              <TextField
                label="Reseller Price"
                type="number"
                value={licenseForm.reseller_price}
                onChange={(event) =>
                  setLicenseForm((prev) => ({
                    ...prev,
                    reseller_price: Number(event.target.value),
                  }))
                }
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <Button variant="contained" onClick={generateKeys}>
                Generate Keys
              </Button>
              <Button variant="outlined" onClick={() => setGeneratedKeys([])}>
                Clear
              </Button>
            </Stack>
            {generatedKeys.length > 0 && (
              <TextField
                label="Generated Keys"
                value={generatedKeys.join('\\n')}
                fullWidth
                multiline
                minRows={4}
              />
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
