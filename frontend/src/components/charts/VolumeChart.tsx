/**
 * Volume Chart using TradingView Lightweight Charts
 */

import { useEffect, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type HistogramData,
  type Time,
  ColorType,
} from 'lightweight-charts';
import type { Candle } from '@/types';

interface VolumeChartProps {
  data: Candle[];
  height?: number;
}

export function VolumeChart({ data, height = 100 }: VolumeChartProps) {
  const theme = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

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
        vertLines: { visible: false },
        horzLines: { color: theme.trading.colors.grid },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
      },
      timeScale: {
        borderVisible: false,
        visible: false,
      },
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
    });

    chartRef.current = chart;
    seriesRef.current = volumeSeries;

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
  }, [height, theme]);

  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      const transformedData: HistogramData[] = data.map((candle) => ({
        time: (candle.timestamp / 1000) as Time,
        value: candle.volume,
        color: candle.close >= candle.open
          ? theme.trading.colors.bullish
          : theme.trading.colors.bearish,
      }));
      seriesRef.current.setData(transformedData);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data, theme]);

  return (
    <Box
      ref={chartContainerRef}
      sx={{
        width: '100%',
        height,
      }}
    />
  );
}

export default VolumeChart;
