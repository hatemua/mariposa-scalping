import { ChartConfiguration, ChartData } from 'chart.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

const width = 600;
const height = 400;

/**
 * Generate a pie chart as a buffer
 */
export async function generatePieChart(
  data: { label: string; value: number; color?: string }[],
  title?: string
): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const colors = [
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f59e0b', // Yellow
    '#ef4444', // Red
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#14b8a6', // Teal
    '#f97316'  // Orange
  ];

  const chartData: ChartData<'pie'> = {
    labels: data.map(d => d.label),
    datasets: [{
      data: data.map(d => d.value),
      backgroundColor: data.map((d, i) => d.color || colors[i % colors.length]),
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const configuration: ChartConfiguration<'pie'> = {
    type: 'pie',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { size: 12 },
            padding: 15
          }
        },
        title: title ? {
          display: true,
          text: title,
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 20 }
        } : undefined
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generate a bar chart as a buffer
 */
export async function generateBarChart(
  data: { label: string; value: number }[],
  title?: string,
  horizontal: boolean = false
): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const chartData: ChartData<'bar'> = {
    labels: data.map(d => d.label),
    datasets: [{
      label: 'Value',
      data: data.map(d => d.value),
      backgroundColor: '#3b82f6',
      borderColor: '#2563eb',
      borderWidth: 1
    }]
  };

  const configuration: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: chartData,
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        title: title ? {
          display: true,
          text: title,
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 20 }
        } : undefined
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          grid: { color: '#e5e7eb' },
          ticks: { font: { size: 10 } }
        }
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generate a doughnut chart as a buffer
 */
export async function generateDoughnutChart(
  data: { label: string; value: number; color?: string }[],
  title?: string
): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 400, height: 400 });

  const colors = ['#10b981', '#f59e0b', '#ef4444'];

  const chartData: ChartData<'doughnut'> = {
    labels: data.map(d => d.label),
    datasets: [{
      data: data.map(d => d.value),
      backgroundColor: data.map((d, i) => d.color || colors[i % colors.length]),
      borderWidth: 3,
      borderColor: '#ffffff'
    }]
  };

  const configuration: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 14, weight: 'bold' },
            padding: 20
          }
        },
        title: title ? {
          display: true,
          text: title,
          font: { size: 18, weight: 'bold' },
          padding: { bottom: 30 }
        } : undefined
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generate a stacked bar chart for comparing metrics
 */
export async function generateStackedBarChart(
  categories: string[],
  datasets: Array<{ label: string; data: number[]; color?: string }>,
  title?: string
): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  const chartData: ChartData<'bar'> = {
    labels: categories,
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color || colors[i % colors.length],
      borderWidth: 1,
      borderColor: '#ffffff'
    }))
  };

  const configuration: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11 },
            padding: 15
          }
        },
        title: title ? {
          display: true,
          text: title,
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 20 }
        } : undefined
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          stacked: true,
          grid: { color: '#e5e7eb' },
          ticks: { font: { size: 10 } }
        }
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generate a line chart
 */
export async function generateLineChart(
  data: Array<{ x: string | number; y: number }>,
  label: string,
  title?: string
): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const chartData: ChartData<'line'> = {
    labels: data.map(d => String(d.x)),
    datasets: [{
      label,
      data: data.map(d => d.y),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#3b82f6'
    }]
  };

  const configuration: ChartConfiguration<'line'> = {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        title: title ? {
          display: true,
          text: title,
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 20 }
        } : undefined
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 } }
        },
        y: {
          grid: { color: '#e5e7eb' },
          ticks: { font: { size: 10 } }
        }
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generate a horizontal bar chart (useful for rankings)
 */
export async function generateHorizontalBarChart(
  data: { label: string; value: number }[],
  title?: string
): Promise<Buffer> {
  return generateBarChart(data, title, true);
}

/**
 * Generate a comparison chart (grouped bars)
 */
export async function generateComparisonChart(
  categories: string[],
  dataset1: { label: string; data: number[] },
  dataset2: { label: string; data: number[] },
  title?: string
): Promise<Buffer> {
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const chartData: ChartData<'bar'> = {
    labels: categories,
    datasets: [
      {
        label: dataset1.label,
        data: dataset1.data,
        backgroundColor: '#3b82f6',
        borderWidth: 1
      },
      {
        label: dataset2.label,
        data: dataset2.data,
        backgroundColor: '#10b981',
        borderWidth: 1
      }
    ]
  };

  const configuration: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11 },
            padding: 15
          }
        },
        title: title ? {
          display: true,
          text: title,
          font: { size: 16, weight: 'bold' },
          padding: { bottom: 20 }
        } : undefined
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          grid: { color: '#e5e7eb' },
          ticks: { font: { size: 10 } }
        }
      }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
}
