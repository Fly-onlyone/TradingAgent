/**
 * Order Form Component
 */

import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  InputAdornment,
  Collapse,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { orderSchema, type OrderInput } from '@/utils/validators';
import { ORDER_TYPES } from '@/utils/constants';
import { formatPrice } from '@/utils/formatters';
import { useOrderStore } from '@/store/orderStore';
import { ordersApi } from '@/api/endpoints/orders';
import { notify } from '@/store/uiStore';

interface OrderFormProps {
  symbol: string;
  currentPrice: number;
  balance?: number;
}

export function OrderForm({ symbol, currentPrice, balance = 0 }: OrderFormProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { isSubmittingOrder, setSubmittingOrder, addOrder } = useOrderStore();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OrderInput>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      symbol,
      side: 'buy',
      type: 'market',
      quantity: 0,
      price: currentPrice,
    },
  });

  const orderType = watch('type');
  const quantity = watch('quantity');
  const price = watch('price') || currentPrice;

  const estimatedTotal = quantity * price;

  const handleSideChange = (_: unknown, newSide: 'buy' | 'sell' | null) => {
    if (newSide) {
      setSide(newSide);
      setValue('side', newSide);
    }
  };

  const handlePercentageClick = (percentage: number) => {
    const maxQty = balance / price;
    setValue('quantity', Number((maxQty * (percentage / 100)).toFixed(6)));
  };

  const onSubmit = async (data: OrderInput) => {
    try {
      setSubmittingOrder(true);
      const order = await ordersApi.createOrder({
        ...data,
        symbol,
        side,
      });
      addOrder(order);
      notify.success('Order placed', `${side.toUpperCase()} ${data.quantity} ${symbol}`);
      reset();
    } catch (error) {
      notify.error('Order failed', (error as Error).message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Place Order
        </Typography>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Buy/Sell Toggle */}
          <ToggleButtonGroup
            value={side}
            exclusive
            onChange={handleSideChange}
            fullWidth
            sx={{ mb: 2 }}
          >
            <ToggleButton
              value="buy"
              sx={{
                '&.Mui-selected': {
                  bgcolor: 'success.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'success.dark' },
                },
              }}
            >
              Buy
            </ToggleButton>
            <ToggleButton
              value="sell"
              sx={{
                '&.Mui-selected': {
                  bgcolor: 'error.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'error.dark' },
                },
              }}
            >
              Sell
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Order Type */}
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <ToggleButtonGroup
                {...field}
                exclusive
                fullWidth
                size="small"
                sx={{ mb: 2 }}
              >
                {ORDER_TYPES.map((type) => (
                  <ToggleButton key={type.value} value={type.value}>
                    {type.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
          />

          {/* Price (for limit orders) */}
          {(orderType === 'limit' || orderType === 'stop_limit') && (
            <Controller
              name="price"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Price"
                  type="number"
                  fullWidth
                  size="small"
                  error={!!errors.price}
                  helperText={errors.price?.message}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  sx={{ mb: 2 }}
                />
              )}
            />
          )}

          {/* Stop Price (for stop orders) */}
          {(orderType === 'stop' || orderType === 'stop_limit') && (
            <Controller
              name="stopPrice"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Stop Price"
                  type="number"
                  fullWidth
                  size="small"
                  error={!!errors.stopPrice}
                  helperText={errors.stopPrice?.message}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  sx={{ mb: 2 }}
                />
              )}
            />
          )}

          {/* Quantity */}
          <Controller
            name="quantity"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Quantity"
                type="number"
                fullWidth
                size="small"
                error={!!errors.quantity}
                helperText={errors.quantity?.message}
                sx={{ mb: 1 }}
              />
            )}
          />

          {/* Quick percentage buttons */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            {[25, 50, 75, 100].map((pct) => (
              <Button
                key={pct}
                size="small"
                variant="outlined"
                onClick={() => handlePercentageClick(pct)}
                sx={{ flex: 1, minWidth: 0 }}
              >
                {pct}%
              </Button>
            ))}
          </Box>

          {/* Estimated Total */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              mb: 2,
              p: 1.5,
              bgcolor: 'background.default',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Estimated Total
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              ${formatPrice(estimatedTotal)}
            </Typography>
          </Box>

          {/* Advanced Options */}
          <Box sx={{ mb: 2 }}>
            <Button
              size="small"
              onClick={() => setShowAdvanced(!showAdvanced)}
              endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            >
              Advanced Options
            </Button>
            <Collapse in={showAdvanced}>
              <Box sx={{ pt: 2 }}>
                <Controller
                  name="stopLoss"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Stop Loss"
                      type="number"
                      fullWidth
                      size="small"
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                      sx={{ mb: 2 }}
                    />
                  )}
                />
                <Controller
                  name="takeProfit"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Take Profit"
                      type="number"
                      fullWidth
                      size="small"
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                      sx={{ mb: 2 }}
                    />
                  )}
                />
                <Controller
                  name="leverage"
                  control={control}
                  render={({ field }) => (
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Leverage: {field.value || 1}x
                      </Typography>
                      <Slider
                        {...field}
                        min={1}
                        max={100}
                        valueLabelDisplay="auto"
                        marks={[
                          { value: 1, label: '1x' },
                          { value: 25, label: '25x' },
                          { value: 50, label: '50x' },
                          { value: 100, label: '100x' },
                        ]}
                      />
                    </Box>
                  )}
                />
              </Box>
            </Collapse>
          </Box>

          {/* Submit Button */}
          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={isSubmittingOrder}
            sx={{
              bgcolor: side === 'buy' ? 'success.main' : 'error.main',
              '&:hover': {
                bgcolor: side === 'buy' ? 'success.dark' : 'error.dark',
              },
            }}
          >
            {isSubmittingOrder ? 'Placing Order...' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol.split('-')[0]}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default OrderForm;
