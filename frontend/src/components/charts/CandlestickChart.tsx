/**
 * Candlestick Chart using TradingView Lightweight Charts
 */

import { useEffect, useRef, useCallback } from 'react';
import { Box, useTheme } from '@mui/material';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  ColorType,
} from 'lightweight-charts';
import type { Candle } from '@/types';

interface CandlestickChartProps {
  data: Candle[];
  height?: number;
  showVolume?: boolean;
  onCrosshairMove?: (price: number | null, time: Time | null) => void;
}

export function CandlestickChart({
  data,
  height = 400,
  showVolume = true,
  onCrosshairMove,
}: CandlestickChartProps) {
  const theme = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Transform data for lightweight-charts
  const transformData = useCallback((candles: Candle[]): CandlestickData[] => {
    return candles.map((candle) => ({
      time: (candle.timestamp / 1000) as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
  }, []);

  const transformVolumeData = useCallback((candles: Candle[]) => {
    return candles.map((candle) => ({
      time: (candle.timestamp / 1000) as Time,
      value: candle.volume,
      color: candle.close >= candle.open
        ? 'rgba(16, 185, 129, 0.5)'
        : 'rgba(239, 68, 68, 0.5)',
    }));
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: theme.palette.text.secondary,
      },
      grid: {
        vertLines: { color: theme.trading.colors.grid },
        horzLines: { color: theme.trading.colors.grid },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: theme.palette.primary.main,
          width: 1,
          style: 2,
          labelBackgroundColor: theme.palette.primary.main,
        },
        horzLine: {
          color: theme.palette.primary.main,
          width: 1,
          style: 2,
          labelBackgroundColor: theme.palette.primary.main,
        },
      },
      rightPriceScale: {
        borderColor: theme.trading.colors.grid,
      },
      timeScale: {
        borderColor: theme.trading.colors.grid,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: theme.trading.colors.bullish,
      downColor: theme.trading.colors.bearish,
      borderUpColor: theme.trading.colors.bullish,
      borderDownColor: theme.trading.colors.bearish,
      wickUpColor: theme.trading.colors.bullish,
      wickDownColor: theme.trading.colors.bearish,
    });

    // Add volume series
    let volumeSeries: ISeriesApi<'Histogram'> | null = null;
    if (showVolume) {
      volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
    }

    // Handle crosshair move
    if (onCrosshairMove) {
      chart.subscribeCrosshairMove((param) => {
        if (param.time && param.seriesData.get(candlestickSeries)) {
          const data = param.seriesData.get(candlestickSeries) as CandlestickData;
          onCrosshairMove(data?.close ?? null, param.time);
        } else {
          onCrosshairMove(null, null);
        }
      });
    }

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height, showVolume, onCrosshairMove, theme]);

  // Update data when it changes
  useEffect(() => {
    if (candlestickSeriesRef.current && data.length > 0) {
      candlestickSeriesRef.current.setData(transformData(data));
    }
    if (volumeSeriesRef.current && data.length > 0) {
      volumeSeriesRef.current.setData(transformVolumeData(data));
    }
    if (chartRef.current && data.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data, transformData, transformVolumeData]);

  return (
    <Box
      ref={chartContainerRef}
      sx={{
        width: '100%',
        height,
        '& .tv-lightweight-charts': {
          borderRadius: 1,
        },
      }}
    />
  );
}

export default CandlestickChart;
