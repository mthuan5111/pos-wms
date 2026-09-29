import React from 'react';
import { LineChart } from 'react-native-chart-kit';

export interface DashboardChartProps {
  data: {
    labels: string[];
    datasets: Array<{
      data: number[];
      color?: (opacity?: number) => string;
      strokeWidth?: number;
    }>;
    legend?: string[];
  };
  width: number;
  height: number;
  yAxisLabel?: string;
  yAxisSuffix?: string;
  chartConfig: {
    backgroundColor?: string;
    backgroundGradientFrom?: string;
    backgroundGradientTo?: string;
    decimalPlaces?: number;
    color?: (opacity?: number) => string;
    labelColor?: (opacity?: number) => string;
    propsForDots?: {
      r?: string | number;
      strokeWidth?: string | number;
      stroke?: string;
    };
  };
  bezier?: boolean;
  style?: any;
}

/**
 * Mobile implementation for iOS / Android
 * Preserves full PanResponder and react-native-chart-kit native interaction.
 */
export default function DashboardChart(props: DashboardChartProps) {
  return <LineChart {...props} />;
}
