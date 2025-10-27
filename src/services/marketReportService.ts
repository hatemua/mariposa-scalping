import PDFDocument from 'pdfkit';
import { marketDataAggregatorService } from './marketDataAggregatorService';
import {
  COLORS,
  FONTS,
  addPageHeader,
  addPageFooter,
  addSectionHeader,
  drawTable,
  drawProgressBar,
  drawBadge,
  drawKeyValue,
  drawBox,
  formatCurrency,
  formatPercentage,
  getRiskColor,
  getRecommendationColor,
  wrapText,
  checkPageBreak
} from '../utils/pdfHelpers';
import {
  generatePieChart,
  generateBarChart,
  generateDoughnutChart,
  generateHorizontalBarChart
} from '../utils/chartGenerator';

export class MarketReportService {
  /**
   * Generate daily market analysis PDF report
   */
  async generateDailyMarketReport(date: Date): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        // Gather all data
        console.log('📊 Gathering market data...');
        const marketSnapshot = await marketDataAggregatorService.getDailyMarketSnapshot(date);
        const topOpportunities = await marketDataAggregatorService.getTopOpportunities(date, 10);
        const whaleActivities = await marketDataAggregatorService.getWhaleActivities(date, 5);
        const statistics = await marketDataAggregatorService.getMarketStatistics(date);
        const benchmarks = await marketDataAggregatorService.getMarketBenchmarks(date);

        console.log('📈 Generating charts...');
        // Generate charts
        const categoryChart = await this.generateCategoryChart(statistics);
        const riskChart = await this.generateRiskChart(statistics);
        const confidenceChart = await this.generateConfidenceChart(statistics);

        console.log('📄 Creating PDF document...');
        // Create PDF document
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 70, bottom: 50, left: 50, right: 50 },
          bufferPages: true
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Track page numbers
        let pageNumber = 1;

        // COVER PAGE
        this.addCoverPage(doc, date);
        doc.addPage();
        pageNumber++;

        // SECTION 1: MARKET OVERVIEW
        addPageHeader(doc, 'Daily Crypto Market Analysis', date, pageNumber);
        this.addMarketOverview(doc, marketSnapshot, benchmarks);
        doc.addPage();
        pageNumber++;

        // SECTION 2: TOP OPPORTUNITIES
        addPageHeader(doc, 'Top Trading Opportunities', date, pageNumber);
        await this.addTopOpportunities(doc, topOpportunities);
        doc.addPage();
        pageNumber++;

        // SECTION 3: WHALE ACTIVITY
        addPageHeader(doc, 'Whale Activity Analysis', date, pageNumber);
        this.addWhaleAnalysis(doc, whaleActivities, marketSnapshot);
        doc.addPage();
        pageNumber++;

        // SECTION 4: TECHNICAL ANALYSIS
        addPageHeader(doc, 'Technical Analysis Breakdown', date, pageNumber);
        await this.addTechnicalCharts(doc, statistics, categoryChart, riskChart, confidenceChart);
        doc.addPage();
        pageNumber++;

        // SECTION 5: AI RECOMMENDATIONS
        addPageHeader(doc, 'AI Recommendations', date, pageNumber);
        this.addAIRecommendations(doc, topOpportunities);
        doc.addPage();
        pageNumber++;

        // SECTION 6: RISK ANALYSIS
        addPageHeader(doc, 'Risk Analysis', date, pageNumber);
        this.addRiskAnalysis(doc, statistics, marketSnapshot);
        doc.addPage();
        pageNumber++;

        // SECTION 7: BENCHMARKS
        addPageHeader(doc, 'Market Benchmarks', date, pageNumber);
        this.addBenchmarks(doc, benchmarks, marketSnapshot, statistics);
        doc.addPage();
        pageNumber++;

        // SECTION 8: METHODOLOGY & DISCLAIMER
        addPageHeader(doc, 'Methodology & Disclaimer', date, pageNumber);
        this.addMethodology(doc);

        // Add page numbers to all pages
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(i);
          if (i > 0) { // Skip cover page
            addPageFooter(doc, i, range.count - 1);
          }
        }

        doc.end();
        console.log('✅ PDF generation complete');
      } catch (error) {
        console.error('❌ Error generating PDF report:', error);
        reject(error);
      }
    });
  }

  /**
   * Add cover page
   */
  private addCoverPage(doc: PDFKit.PDFDocument, date: Date): void {
    const centerX = doc.page.width / 2;

    // Title
    doc
      .fontSize(36)
      .fillColor(COLORS.primary)
      .font('Helvetica-Bold')
      .text('Daily Crypto Market Analysis', centerX - 250, 200, {
        width: 500,
        align: 'center'
      });

    // Date
    doc
      .fontSize(20)
      .fillColor(COLORS.text)
      .font('Helvetica')
      .text(date.toLocaleDateString('en-US', { dateStyle: 'full' }), centerX - 250, 280, {
        width: 500,
        align: 'center'
      });

    // Subtitle
    doc
      .fontSize(14)
      .fillColor(COLORS.textLight)
      .font('Helvetica')
      .text('AI-Powered Trading Insights & Opportunities', centerX - 250, 330, {
        width: 500,
        align: 'center'
      });

    // Decorative line
    doc
      .strokeColor(COLORS.primary)
      .lineWidth(3)
      .moveTo(centerX - 100, 370)
      .lineTo(centerX + 100, 370)
      .stroke();

    // Footer
    doc
      .fontSize(12)
      .fillColor(COLORS.textLight)
      .font('Helvetica')
      .text('Generated by Mariposa Scalping Bot', centerX - 200, doc.page.height - 150, {
        width: 400,
        align: 'center'
      });

    doc
      .fontSize(10)
      .fillColor(COLORS.textLight)
      .text('Powered by AI & Real-Time Binance Data', centerX - 200, doc.page.height - 120, {
        width: 400,
        align: 'center'
      });
  }

  /**
   * Add market overview section
   */
  private addMarketOverview(
    doc: PDFKit.PDFDocument,
    snapshot: any,
    benchmarks: any
  ): void {
    addSectionHeader(doc, '📈', 'Market Overview', 'Daily snapshot of cryptocurrency market conditions');

    // Market sentiment box
    const sentimentColor = snapshot.marketSentiment === 'BULLISH' ? COLORS.success :
      snapshot.marketSentiment === 'BEARISH' ? COLORS.danger : COLORS.warning;

    doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
      .text('Market Sentiment:');
    doc.moveDown(0.3);
    drawBadge(doc, doc.x, doc.y, snapshot.marketSentiment,
      snapshot.marketSentiment === 'BULLISH' ? 'success' :
      snapshot.marketSentiment === 'BEARISH' ? 'danger' : 'warning');
    doc.moveDown(1);

    // Key statistics in a grid
    const startX = doc.page.margins.left;
    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
    let currentY = doc.y;

    // Left column
    this.addStatBox(doc, startX, currentY, colWidth - 10, 'Total Opportunities', String(snapshot.totalOpportunities));
    currentY += 60;
    this.addStatBox(doc, startX, currentY, colWidth - 10, 'High Confidence Signals', String(snapshot.highConfidenceSignals));
    currentY += 60;
    this.addStatBox(doc, startX, currentY, colWidth - 10, 'Whale Activities', String(snapshot.whaleActivitiesCount));

    // Right column
    currentY = doc.y;
    this.addStatBox(doc, startX + colWidth, currentY, colWidth - 10, 'Avg Opportunity Score',
      `${snapshot.averageOpportunityScore.toFixed(1)}/100`);
    currentY += 60;
    this.addStatBox(doc, startX + colWidth, currentY, colWidth - 10, 'BTC 24h Change',
      formatPercentage(benchmarks.btcPerformance24h));
    currentY += 60;
    this.addStatBox(doc, startX + colWidth, currentY, colWidth - 10, 'ETH 24h Change',
      formatPercentage(benchmarks.ethPerformance24h));

    doc.y = currentY + 70;

    // Top gainers and losers
    if (snapshot.topGainers.length > 0 || snapshot.topLosers.length > 0) {
      doc.moveDown(1);
      addSectionHeader(doc, '🏆', 'Top Movers', '24-hour price changes');

      const tableStartX = doc.page.margins.left;
      const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colWidth2 = tableWidth / 2;

      doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica-Bold')
        .text('Top Gainers', tableStartX, doc.y)
        .text('Top Losers', tableStartX + colWidth2, doc.y);

      doc.moveDown(0.5);

      const maxRows = Math.max(snapshot.topGainers.length, snapshot.topLosers.length);
      for (let i = 0; i < Math.min(maxRows, 5); i++) {
        const gainer = snapshot.topGainers[i];
        const loser = snapshot.topLosers[i];

        if (gainer) {
          doc.fontSize(FONTS.small).fillColor(COLORS.text).font('Helvetica')
            .text(`${gainer.symbol}: `, tableStartX, doc.y, { continued: true })
            .fillColor(COLORS.success).font('Helvetica-Bold')
            .text(formatPercentage(gainer.priceChange));
        }

        if (loser) {
          doc.fontSize(FONTS.small).fillColor(COLORS.text).font('Helvetica')
            .text(`${loser.symbol}: `, tableStartX + colWidth2, doc.y, { continued: true })
            .fillColor(COLORS.danger).font('Helvetica-Bold')
            .text(formatPercentage(loser.priceChange));
        }

        doc.moveDown(0.5);
      }
    }
  }

  /**
   * Add stat box helper
   */
  private addStatBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string
  ): void {
    const height = 50;

    drawBox(doc, x, y, width, height, COLORS.border, COLORS.background);

    doc.fontSize(FONTS.small).fillColor(COLORS.textLight).font('Helvetica')
      .text(label, x + 10, y + 10, { width: width - 20 });

    doc.fontSize(FONTS.heading).fillColor(COLORS.primary).font('Helvetica-Bold')
      .text(value, x + 10, y + 25, { width: width - 20 });
  }

  /**
   * Add top opportunities section
   */
  private async addTopOpportunities(doc: PDFKit.PDFDocument, opportunities: any[]): Promise<void> {
    addSectionHeader(doc, '🎯', 'Top Trading Opportunities', 'Highest-rated opportunities detected today');

    if (opportunities.length === 0) {
      doc.fontSize(FONTS.body).fillColor(COLORS.textLight).font('Helvetica')
        .text('No significant opportunities detected for this date.');
      return;
    }

    for (let i = 0; i < opportunities.length; i++) {
      const opp = opportunities[i];

      checkPageBreak(doc, 200);

      // Opportunity header
      doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
        .text(`${i + 1}. ${opp.symbol}`, { continued: true })
        .fontSize(FONTS.small).fillColor(COLORS.textLight).font('Helvetica')
        .text(`  •  ${opp.category}`, { continued: false });

      doc.moveDown(0.3);

      // Score and confidence
      const startY = doc.y;
      doc.fontSize(FONTS.small).fillColor(COLORS.textLight).font('Helvetica')
        .text('Score:', doc.x, startY);
      drawProgressBar(doc, doc.x + 50, startY - 2, 100, opp.score, 100);

      doc.fontSize(FONTS.small).fillColor(COLORS.textLight).font('Helvetica')
        .text('Confidence:', doc.x + 180, startY);
      drawProgressBar(doc, doc.x + 250, startY - 2, 100, opp.confidence * 100, 100);

      doc.y = startY + 20;

      // Recommendation and risk badges
      const badgeY = doc.y;
      drawBadge(doc, doc.x, badgeY, opp.recommendation,
        opp.recommendation === 'BUY' ? 'success' :
        opp.recommendation === 'SELL' ? 'danger' : 'warning');

      drawBadge(doc, doc.x + 80, badgeY, `${opp.riskLevel} RISK`,
        opp.riskLevel === 'LOW' ? 'success' :
        opp.riskLevel === 'HIGH' ? 'danger' : 'warning');

      doc.y = badgeY + 25;

      // Price levels
      const priceY = doc.y;
      drawKeyValue(doc, doc.x, priceY, 'Entry', formatCurrency(opp.entry, 4), COLORS.text);
      drawKeyValue(doc, doc.x + 150, priceY, 'Target', formatCurrency(opp.target, 4), COLORS.success);
      drawKeyValue(doc, doc.x + 300, priceY, 'Stop Loss', formatCurrency(opp.stopLoss, 4), COLORS.danger);
      doc.y = priceY + 20;

      // Risk/Reward and Expected Return
      drawKeyValue(doc, doc.x, doc.y, 'R/R Ratio', `1:${opp.riskReward.toFixed(2)}`, COLORS.text);
      drawKeyValue(doc, doc.x + 150, doc.y, 'Expected Return', formatPercentage(opp.expectedReturn), COLORS.success);
      drawKeyValue(doc, doc.x + 300, doc.y, 'Timeframe', opp.timeframe, COLORS.text);
      doc.moveDown();

      // Indicators
      doc.fontSize(FONTS.small).fillColor(COLORS.textLight).font('Helvetica')
        .text(`RSI: ${opp.indicators.rsi.toFixed(1)} | Volume Ratio: ${opp.indicators.volume_ratio.toFixed(2)}x | Volatility: ${(opp.indicators.volatility * 100).toFixed(1)}%`);
      doc.moveDown(0.5);

      // LLM Insights if available
      if (opp.llmInsights?.traderThoughts) {
        doc.fontSize(FONTS.small).fillColor(COLORS.text).font('Helvetica-Bold')
          .text('AI Analysis: ', { continued: true })
          .font('Helvetica').fillColor(COLORS.textLight)
          .text(opp.llmInsights.traderThoughts.substring(0, 200) + (opp.llmInsights.traderThoughts.length > 200 ? '...' : ''));
      }

      doc.moveDown(1);

      // Separator line
      doc.strokeColor(COLORS.border).lineWidth(0.5)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();

      doc.moveDown(0.5);
    }
  }

  /**
   * Generate category distribution chart
   */
  private async generateCategoryChart(statistics: any): Promise<Buffer> {
    const data: Array<{ label: string; value: number }> = [];

    statistics.opportunitiesByCategory.forEach((value: number, label: string) => {
      data.push({ label, value });
    });

    if (data.length === 0) {
      data.push({ label: 'No data', value: 1 });
    }

    return await generatePieChart(data, 'Opportunities by Category');
  }

  /**
   * Generate risk distribution chart
   */
  private async generateRiskChart(statistics: any): Promise<Buffer> {
    const data: Array<{ label: string; value: number; color?: string }> = [];

    statistics.opportunitiesByRiskLevel.forEach((value: number, label: string) => {
      data.push({
        label,
        value,
        color: label === 'LOW' ? COLORS.success : label === 'HIGH' ? COLORS.danger : COLORS.warning
      });
    });

    if (data.length === 0) {
      data.push({ label: 'No data', value: 1, color: COLORS.neutral });
    }

    return await generateDoughnutChart(data, 'Risk Level Distribution');
  }

  /**
   * Generate confidence distribution chart
   */
  private async generateConfidenceChart(statistics: any): Promise<Buffer> {
    const data = [
      { label: 'High (>70%)', value: statistics.confidenceDistribution.high, color: COLORS.success },
      { label: 'Medium (40-70%)', value: statistics.confidenceDistribution.medium, color: COLORS.warning },
      { label: 'Low (<40%)', value: statistics.confidenceDistribution.low, color: COLORS.danger }
    ];

    return await generateDoughnutChart(data, 'Confidence Distribution');
  }

  // Continued in next part...
  private addWhaleAnalysis(doc: PDFKit.PDFDocument, whaleActivities: any[], snapshot: any): void {
    addSectionHeader(doc, '🐋', 'Whale Activity Analysis', 'Notable large-scale market movements');

    if (whaleActivities.length === 0) {
      doc.fontSize(FONTS.body).fillColor(COLORS.textLight).font('Helvetica')
        .text('No significant whale activity detected for this date.');
      return;
    }

    // Summary
    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica')
      .text(`Total whale activities detected: ${snapshot.whaleActivitiesCount}`);
    doc.moveDown();

    // Individual whale activities
    whaleActivities.forEach((whale, i) => {
      checkPageBreak(doc, 150);

      doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
        .text(`${i + 1}. ${whale.symbol} - ${whale.type}`);
      doc.moveDown(0.3);

      // Badges
      const badgeY = doc.y;
      drawBadge(doc, doc.x, badgeY, whale.side, whale.side === 'BUY' ? 'success' : 'danger');
      drawBadge(doc, doc.x + 70, badgeY, `${whale.impact} IMPACT`,
        whale.impact === 'HIGH' ? 'danger' : whale.impact === 'MEDIUM' ? 'warning' : 'info');
      doc.y = badgeY + 25;

      // Details
      drawKeyValue(doc, doc.x, doc.y, 'Size', whale.size.toLocaleString());
      drawKeyValue(doc, doc.x + 200, doc.y, 'Value', formatCurrency(whale.value, 0));
      doc.moveDown();
      drawKeyValue(doc, doc.x, doc.y, 'Volume Spike', `${whale.volumeSpike.toFixed(1)}x`);
      drawKeyValue(doc, doc.x + 200, doc.y, 'Confidence', `${(whale.confidence * 100).toFixed(0)}%`);
      doc.moveDown();

      // LLM insights
      if (whale.llmInsights) {
        doc.fontSize(FONTS.small).fillColor(COLORS.text).font('Helvetica-Bold')
          .text('Market Impact: ', { continued: true })
          .font('Helvetica').fillColor(COLORS.textLight)
          .text(whale.llmInsights.marketImpact.substring(0, 150) + '...');
      }

      doc.moveDown(1);
      doc.strokeColor(COLORS.border).lineWidth(0.5)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.5);
    });
  }

  private async addTechnicalCharts(doc: PDFKit.PDFDocument, statistics: any, categoryChart: Buffer, riskChart: Buffer, confidenceChart: Buffer): Promise<void> {
    addSectionHeader(doc, '📊', 'Technical Analysis', 'Market condition visualizations');

    // Category chart
    if (categoryChart) {
      doc.image(categoryChart, doc.page.margins.left, doc.y, { width: 500, height: 300 });
      doc.y += 320;
    }

    checkPageBreak(doc, 350);

    // Risk and confidence charts side by side
    const chartWidth = 250;
    const chartX1 = doc.page.margins.left;
    const chartX2 = doc.page.margins.left + chartWidth + 20;

    if (riskChart) {
      doc.image(riskChart, chartX1, doc.y, { width: chartWidth, height: chartWidth });
    }

    if (confidenceChart) {
      doc.image(confidenceChart, chartX2, doc.y, { width: chartWidth, height: chartWidth });
    }

    doc.y += chartWidth + 20;

    // Top symbols table
    if (statistics.topSymbolsByOpportunities.length > 0) {
      doc.moveDown();
      doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
        .text('Most Active Symbols');
      doc.moveDown(0.5);

      const tableData = statistics.topSymbolsByOpportunities.slice(0, 5).map((s: any) => [
        s.symbol,
        String(s.count),
        `${((s.count / statistics.topSymbolsByOpportunities.reduce((sum: number, x: any) => sum + x.count, 0)) * 100).toFixed(1)}%`
      ]);

      drawTable(doc, tableData, [
        { header: 'Symbol', width: 150, align: 'left' },
        { header: 'Opportunities', width: 120, align: 'center' },
        { header: 'Share', width: 100, align: 'right' }
      ], doc.page.margins.left, doc.y);
    }
  }

  private addAIRecommendations(doc: PDFKit.PDFDocument, opportunities: any[]): void {
    addSectionHeader(doc, '💡', 'AI Trading Recommendations', 'Top picks for today');

    if (opportunities.length === 0) {
      doc.fontSize(FONTS.body).fillColor(COLORS.textLight).font('Helvetica')
        .text('No recommendations available for this date.');
      return;
    }

    // Best R/R Setup
    const bestRR = opportunities.sort((a, b) => b.riskReward - a.riskReward)[0];
    this.addRecommendationCard(doc, '1. Best Risk/Reward Setup', bestRR,
      `Optimal risk management with ${bestRR.riskReward.toFixed(2)}:1 reward-to-risk ratio.`);

    doc.moveDown(1);

    // Highest Confidence
    const highestConf = opportunities.sort((a, b) => b.confidence - a.confidence)[0];
    this.addRecommendationCard(doc, '2. Highest Confidence Signal', highestConf,
      `AI models show ${(highestConf.confidence * 100).toFixed(0)}% confidence in this opportunity.`);

    doc.moveDown(1);

    // Momentum Play
    const momentum = opportunities.find(o => o.category === 'MOMENTUM' || o.indicators.momentum > 5) || opportunities[0];
    this.addRecommendationCard(doc, '3. Momentum Play', momentum,
      `Strong momentum indicators suggest continuation of current trend.`);
  }

  private addRecommendationCard(doc: PDFKit.PDFDocument, title: string, opp: any, reasoning: string): void {
    checkPageBreak(doc, 120);

    drawBox(doc, doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 100, COLORS.primary, COLORS.background);

    const boxX = doc.page.margins.left + 10;
    const boxY = doc.y + 10;

    doc.fontSize(FONTS.subheading).fillColor(COLORS.primary).font('Helvetica-Bold')
      .text(title, boxX, boxY);

    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica-Bold')
      .text(`${opp.symbol} - ${opp.recommendation}`, boxX, boxY + 20);

    doc.fontSize(FONTS.small).fillColor(COLORS.textLight).font('Helvetica')
      .text(reasoning, boxX, boxY + 40, { width: 400 });

    doc.fontSize(FONTS.small).fillColor(COLORS.text).font('Helvetica')
      .text(`Entry: ${formatCurrency(opp.entry, 4)} | Target: ${formatCurrency(opp.target, 4)} | Stop: ${formatCurrency(opp.stopLoss, 4)}`, boxX, boxY + 70);

    doc.y += 110;
  }

  private addRiskAnalysis(doc: PDFKit.PDFDocument, statistics: any, snapshot: any): void {
    addSectionHeader(doc, '⚖️', 'Risk Analysis', 'Market risk assessment and position sizing');

    // Risk metrics
    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica-Bold')
      .text('Average Risk/Reward Ratio: ', { continued: true })
      .font('Helvetica').fillColor(COLORS.success)
      .text(`1:${statistics.averageRiskReward.toFixed(2)}`);
    doc.moveDown();

    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica-Bold')
      .text('Average Expected Return: ', { continued: true })
      .font('Helvetica').fillColor(COLORS.success)
      .text(formatPercentage(statistics.averageExpectedReturn));
    doc.moveDown(2);

    // Position sizing recommendations
    doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
      .text('Position Sizing Recommendations');
    doc.moveDown(0.5);

    const portfolioTypes = [
      { type: 'Conservative', risk: 'LOW', size: '1-2%' },
      { type: 'Moderate', risk: 'MEDIUM', size: '2-5%' },
      { type: 'Aggressive', risk: 'HIGH', size: '5-10%' }
    ];

    portfolioTypes.forEach(p => {
      doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica-Bold')
        .text(`${p.type} Portfolio: `, { continued: true })
        .font('Helvetica')
        .text(`${p.size} per position (${p.risk} risk tolerance)`);
      doc.moveDown(0.5);
    });
  }

  private addBenchmarks(doc: PDFKit.PDFDocument, benchmarks: any, snapshot: any, statistics: any): void {
    addSectionHeader(doc, '📉', 'Market Benchmarks', 'Performance metrics and comparisons');

    // BTC & ETH Performance
    doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
      .text('Major Assets Performance');
    doc.moveDown(0.5);

    const btcColor = benchmarks.btcPerformance24h >= 0 ? COLORS.success : COLORS.danger;
    const ethColor = benchmarks.ethPerformance24h >= 0 ? COLORS.success : COLORS.danger;

    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica')
      .text('BTC: ', { continued: true })
      .fillColor(btcColor).font('Helvetica-Bold')
      .text(`${formatPercentage(benchmarks.btcPerformance24h)} (24h) | ${formatPercentage(benchmarks.btcPerformance7d)} (7d)`);
    doc.moveDown(0.5);

    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica')
      .text('ETH: ', { continued: true })
      .fillColor(ethColor).font('Helvetica-Bold')
      .text(`${formatPercentage(benchmarks.ethPerformance24h)} (24h) | ${formatPercentage(benchmarks.ethPerformance7d)} (7d)`);
    doc.moveDown(2);

    // Market dominance
    doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
      .text('Market Dominance');
    doc.moveDown(0.5);

    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica')
      .text(`BTC: ${benchmarks.btcDominance.toFixed(1)}% | ETH: ${benchmarks.ethDominance.toFixed(1)}%`);
    doc.moveDown(2);

    // Trading condition rating
    doc.fontSize(FONTS.subheading).fillColor(COLORS.text).font('Helvetica-Bold')
      .text('Market Condition Rating');
    doc.moveDown(0.5);

    const tradingCondition = snapshot.averageOpportunityScore > 70 ? 'EXCELLENT' : snapshot.averageOpportunityScore > 50 ? 'GOOD' : 'FAIR';
    const opportunityQuality = statistics.confidenceDistribution.high > statistics.confidenceDistribution.low ? 'HIGH' : 'MEDIUM';

    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica')
      .text(`Trading Condition: ${tradingCondition} | Opportunity Quality: ${opportunityQuality}`);
  }

  private addMethodology(doc: PDFKit.PDFDocument): void {
    addSectionHeader(doc, '📝', 'Methodology', 'How this analysis is generated');

    doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica')
      .text('This daily market analysis report is generated using:', { underline: false });
    doc.moveDown(0.5);

    const methodology = [
      '• Real-time data from Binance API (prices, volumes, order books)',
      '• 4 advanced AI models analyzing market conditions',
      '• Technical indicators: RSI, MACD, Volume Ratio, Momentum, Volatility',
      '• Whale activity detection algorithms',
      '• Risk/reward calculations and position sizing recommendations',
      '• Historical pattern recognition and trend analysis'
    ];

    methodology.forEach(item => {
      doc.fontSize(FONTS.body).fillColor(COLORS.text).font('Helvetica')
        .text(item);
      doc.moveDown(0.3);
    });

    doc.moveDown(2);

    // Disclaimer
    doc.fontSize(FONTS.subheading).fillColor(COLORS.danger).font('Helvetica-Bold')
      .text('⚠️ DISCLAIMER');
    doc.moveDown(0.5);

    doc.fontSize(FONTS.small).fillColor(COLORS.text).font('Helvetica')
      .text('This report is for informational purposes only and does not constitute financial advice. Cryptocurrency trading carries significant risk. Past performance does not guarantee future results. Always conduct your own research (DYOR) and never invest more than you can afford to lose. The creators of this report are not responsible for any trading losses incurred.');
  }
}

export const marketReportService = new MarketReportService();
