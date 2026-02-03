/**
 * Orders Page
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material'
import CancelIcon from '@mui/icons-material/Cancel'

import { PageTransition } from '@/components/common/PageTransition'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { PositionCard } from '@/components/trading/PositionCard'
import { useOrderStore, selectOpenOrders, selectFilledOrders } from '@/store/orderStore'
import { formatDateTime, formatPrice } from '@/utils/formatters'
import { ORDER_STATUSES } from '@/utils/constants'
import type { Order } from '@/types'

export const Route = createFileRoute('/orders')({
  component: OrdersPage,
})

function OrdersPage() {
  const [tabValue, setTabValue] = useState(0)
  const { orders, positions, isLoadingOrders } = useOrderStore()
  const openOrders = selectOpenOrders(useOrderStore.getState())
  const filledOrders = selectFilledOrders(useOrderStore.getState())

  const getStatusChip = (status: string) => {
    const config = ORDER_STATUSES.find((s) => s.value === status)
    return (
      <Chip
        label={config?.label || status}
        size="small"
        color={config?.color as 'success' | 'error' | 'warning' | 'info' | 'default'}
        variant="outlined"
      />
    )
  }

  const columns: Column<Order>[] = [
    { id: 'symbol', label: 'Symbol', minWidth: 100 },
    {
      id: 'side',
      label: 'Side',
      render: (row) => (
        <Chip
          label={row.side.toUpperCase()}
          size="small"
          color={row.side === 'buy' ? 'success' : 'error'}
        />
      ),
    },
    { id: 'type', label: 'Type', format: (v) => String(v).toUpperCase() },
    {
      id: 'quantity',
      label: 'Quantity',
      align: 'right',
      format: (v) => Number(v).toFixed(6),
    },
    {
      id: 'price',
      label: 'Price',
      align: 'right',
      render: (row) => row.price ? `$${formatPrice(row.price)}` : '-',
    },
    {
      id: 'status',
      label: 'Status',
      render: (row) => getStatusChip(row.status),
    },
    {
      id: 'createdAt',
      label: 'Created',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      id: 'actions',
      label: '',
      sortable: false,
      render: (row) => (
        row.status === 'open' || row.status === 'pending' ? (
          <Tooltip title="Cancel order">
            <IconButton size="small" color="error">
              <CancelIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null
      ),
    },
  ]

  return (
    <PageTransition pageKey="orders">
      <Box>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Orders & Positions
        </Typography>

        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 3 }}>
          <Tab label={`Open Orders (${openOrders.length})`} />
          <Tab label={`Order History (${filledOrders.length})`} />
          <Tab label={`Positions (${positions.length})`} />
        </Tabs>

        {/* Open Orders Tab */}
        {tabValue === 0 && (
          <Card>
            <CardContent>
              <DataTable
                columns={columns}
                rows={openOrders}
                rowKey="id"
                loading={isLoadingOrders}
                emptyMessage="No open orders"
                maxHeight={500}
              />
            </CardContent>
          </Card>
        )}

        {/* Order History Tab */}
        {tabValue === 1 && (
          <Card>
            <CardContent>
              <DataTable
                columns={columns}
                rows={orders}
                rowKey="id"
                loading={isLoadingOrders}
                emptyMessage="No order history"
                maxHeight={500}
              />
            </CardContent>
          </Card>
        )}

        {/* Positions Tab */}
        {tabValue === 2 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 2 }}>
            {positions.length === 0 ? (
              <Card>
                <CardContent>
                  <Typography color="text.secondary" align="center">
                    No open positions
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              positions.map((position) => (
                <PositionCard key={position.id} position={position} />
              ))
            )}
          </Box>
        )}
      </Box>
    </PageTransition>
  )
}
