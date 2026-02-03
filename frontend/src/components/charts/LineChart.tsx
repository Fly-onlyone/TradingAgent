/**
 * Line Chart using TradingView Lightweight Charts
 */

import { useEffect, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
  type LineWidth,
  ColorType,
} from 'lightweight-charts';

interface DataPoint {
  time: number;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  lineWidth?: number;
  showArea?: boolean;
  title?: string;
}

export function LineChart({
  data,
  height = 200,
  color,
  lineWidth = 2,
  showArea = true,
  title,
}: LineChartProps) {
  const chartLineWidth = lineWidth as LineWidth;
  const theme = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | ISeriesApi<'Area'> | null>(null);

  const lineColor = color || theme.palette.primary.main;

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
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      crosshair: {
        horzLine: {
          visible: false,
        },
        vertLine: {
          labelVisible: false,
        },
      },
    });

    let series: ISeriesApi<'Line'> | ISeriesApi<'Area'>;

    if (showArea) {
      series = chart.addAreaSeries({
        lineColor,
        topColor: `${lineColor}40`,
        bottomColor: `${lineColor}05`,
        lineWidth: chartLineWidth,
      });
    } else {
      series = chart.addLineSeries({
        color: lineColor,
        lineWidth: chartLineWidth,
      });
    }

    chartRef.current = chart;
    seriesRef.current = series;

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
  }, [height, lineColor, chartLineWidth, showArea, theme]);

  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      const transformedData: LineData[] = data.map((point) => ({
        time: (point.time / 1000) as Time,
        value: point.value,
      }));
      seriesRef.current.setData(transformedData);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  return (
    <Box sx={{ position: 'relative' }}>
      {title && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 1,
            color: 'text.secondary',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          {title}
        </Box>
      )}
      <Box
        ref={chartContainerRef}
        sx={{
          width: '100%',
          height,
        }}
      />
    </Box>
  );
}

export default LineChart;
