import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, type BarSeriesOption, type LineSeriesOption } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

type ChartOption = echarts.ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
>;

export interface GdpChartPoint {
  label: string;
  dateLabel: string;
  weightKg: number;
  dailyGainGrams: number | null;
  dailyGainKg: number | null;
  gainKg: number | null;
  daysSincePrevious: number | null;
}

interface GdpWeightsChartProps {
  points: GdpChartPoint[];
  accentColor: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function GdpWeightsChart({ points, accentColor }: GdpWeightsChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const handleResize = () => {
      if (!chart.isDisposed()) {
        chart.resize();
      }
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handleResize);
      observer.observe(el);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const xLabels = points.map((p) => `${p.label}\n${p.dateLabel}`);
    const weightSeriesData = points.map((p) => Number(p.weightKg.toFixed(2)));
    const gdpSeriesData = points.map((p) =>
      p.dailyGainGrams !== null ? p.dailyGainGrams : null
    );
    const hasGdpPoints = gdpSeriesData.some((v) => v !== null);

    const option: ChartOption = {
      animation: false,
      textStyle: {
        fontFamily: 'Inter, Roboto, system-ui, sans-serif',
        color: '#334155',
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#FFFFFF',
        borderColor: '#CBD5E1',
        borderWidth: 1,
        textStyle: {
          color: '#0F172A',
          fontSize: 12,
        },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params];
          const first = list[0] as { dataIndex?: number } | undefined;
          const idx = typeof first?.dataIndex === 'number' ? first.dataIndex : -1;
          const pt = points[idx];
          if (!pt) return '';

          const lines = [
            `<strong>${escapeHtml(pt.label)}</strong> · ${escapeHtml(pt.dateLabel)}`,
            `Peso: <b>${pt.weightKg.toFixed(2)} kg</b>`,
          ];
          if (pt.dailyGainGrams !== null && pt.dailyGainKg !== null) {
            lines.push(
              `GDP: <b>${pt.dailyGainGrams} g/día</b> (${pt.dailyGainKg.toFixed(3)} kg/día)`
            );
          }
          if (pt.gainKg !== null && pt.daysSincePrevious !== null) {
            const sign = pt.gainKg >= 0 ? '+' : '';
            const daysUnit = pt.daysSincePrevious === 1 ? 'día' : 'días';
            lines.push(
              `Ganancia: <b>${sign}${pt.gainKg.toFixed(2)} kg</b> en ${pt.daysSincePrevious} ${daysUnit}`
            );
          }
          return lines.join('<br/>');
        },
      },
      legend: {
        top: 0,
        left: 0,
        itemWidth: 14,
        itemHeight: 10,
        textStyle: {
          color: '#334155',
          fontSize: 12,
          fontWeight: 600,
        },
        data: hasGdpPoints ? ['Peso (kg)', 'GDP (g/día)'] : ['Peso (kg)'],
      },
      grid: {
        top: 40,
        left: 52,
        right: hasGdpPoints ? 60 : 24,
        bottom: 48,
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisTick: { alignWithLabel: true, lineStyle: { color: '#CBD5E1' } },
        axisLabel: {
          color: '#334155',
          fontSize: 11,
          lineHeight: 15,
        },
      },
      yAxis: hasGdpPoints
        ? [
            {
              type: 'value',
              name: 'kg',
              nameTextStyle: { color: '#334155', fontSize: 11, fontWeight: 600 },
              axisLine: { show: true, lineStyle: { color: '#CBD5E1' } },
              axisLabel: { color: '#334155', fontSize: 11 },
              splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } },
            },
            {
              type: 'value',
              name: 'g/día',
              nameTextStyle: { color: '#1B4332', fontSize: 11, fontWeight: 600 },
              axisLine: { show: true, lineStyle: { color: '#CBD5E1' } },
              axisLabel: { color: '#1B4332', fontSize: 11 },
              splitLine: { show: false },
            },
          ]
        : [
            {
              type: 'value',
              name: 'kg',
              nameTextStyle: { color: '#334155', fontSize: 11, fontWeight: 600 },
              axisLine: { show: true, lineStyle: { color: '#CBD5E1' } },
              axisLabel: { color: '#334155', fontSize: 11 },
              splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } },
            },
          ],
      series: hasGdpPoints
        ? [
            {
              name: 'GDP (g/día)',
              type: 'bar',
              yAxisIndex: 1,
              barMaxWidth: 32,
              itemStyle: {
                color: '#1B4332',
                borderRadius: [4, 4, 0, 0],
              },
              data: gdpSeriesData,
            },
            {
              name: 'Peso (kg)',
              type: 'line',
              yAxisIndex: 0,
              smooth: false,
              symbol: 'circle',
              symbolSize: 8,
              lineStyle: {
                color: accentColor,
                width: 2.5,
              },
              itemStyle: {
                color: accentColor,
                borderColor: '#FFFFFF',
                borderWidth: 2,
              },
              data: weightSeriesData,
            },
          ]
        : [
            {
              name: 'Peso (kg)',
              type: 'line',
              smooth: false,
              symbol: 'circle',
              symbolSize: 8,
              lineStyle: {
                color: accentColor,
                width: 2.5,
              },
              itemStyle: {
                color: accentColor,
                borderColor: '#FFFFFF',
                borderWidth: 2,
              },
              data: weightSeriesData,
            },
          ],
    };

    chart.setOption(option, true);
  }, [points, accentColor]);

  return (
    <div className="gdp-chart-wrap">
      <div
        ref={containerRef}
        className="gdp-chart-canvas"
        role="img"
        aria-label="Gráfica de evolución de peso en kilogramos y ganancia diaria de peso en gramos por día"
      />
    </div>
  );
}
