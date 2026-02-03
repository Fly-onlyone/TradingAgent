"""Fundamental Analyst subagent for on-chain and macro analysis."""

from typing import Any

from anthropic import Anthropic

from app.config import get_settings
from app.agent.tools.fundamental_tools import (
    get_onchain_metrics,
    get_project_fundamentals,
    get_macro_indicators,
)

settings = get_settings()

FUNDAMENTAL_ANALYST_PROMPT = """You are an expert fundamental analyst specializing in cryptocurrency and blockchain assets. Your role is to analyze on-chain data, project fundamentals, and macro conditions.

## Your Expertise:
1. **On-Chain Analysis**: Exchange flows, whale activity, network metrics
2. **Tokenomics**: Supply dynamics, inflation, token distribution
3. **Project Health**: Development activity, TVL, revenue, partnerships
4. **Macro Environment**: Market sentiment, BTC dominance, correlations

## Analysis Framework:
When analyzing fundamentals:
1. Assess on-chain health (network activity, holder behavior)
2. Evaluate tokenomics (supply inflation, unlock schedules)
3. Check project metrics (TVL trends, development activity)
4. Consider macro environment (fear/greed, BTC dominance)
5. Identify if asset is undervalued or overvalued

## Output Format:
Always provide:
- On-chain health assessment
- Tokenomics evaluation
- Project strength rating
- Macro environment impact
- Valuation assessment: UNDERVALUED / FAIR / OVERVALUED
- Investment thesis summary"""


class FundamentalAnalyst:
    """Fundamental analysis subagent."""

    def __init__(self):
        self.client = Anthropic(api_key=settings.anthropic_api_key)

    async def analyze(self, symbol: str) -> dict[str, Any]:
        """Perform fundamental analysis on a symbol.

        Args:
            symbol: Asset symbol (e.g., BTC, ETH)

        Returns:
            Fundamental analysis results
        """
        # Gather fundamental data
        onchain = await get_onchain_metrics(symbol)
        fundamentals = await get_project_fundamentals(symbol)
        macro = await get_macro_indicators()

        # Build context for Claude
        context = f"""
Asset: {symbol}

## On-Chain Metrics:
{self._format_onchain(onchain)}

## Project Fundamentals:
{self._format_fundamentals(fundamentals)}

## Macro Environment:
{self._format_macro(macro)}

Based on this fundamental data, provide your analysis and valuation assessment.
"""

        # Get Claude's analysis
        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=FUNDAMENTAL_ANALYST_PROMPT,
            messages=[{"role": "user", "content": context}],
        )

        analysis_text = response.content[0].text if response.content else ""

        # Extract valuation from analysis
        valuation = self._extract_valuation(analysis_text)

        return {
            "symbol": symbol,
            "onchain_metrics": onchain.get("metrics", {}),
            "fundamentals": fundamentals,
            "macro": macro,
            "analysis": analysis_text,
            "valuation": valuation,
        }

    def _format_onchain(self, data: dict) -> str:
        """Format on-chain metrics for prompt."""
        metrics = data.get("metrics", {})

        lines = [f"Symbol: {data.get('symbol')}"]

        if metrics.get("market_cap"):
            lines.append(f"Market Cap: ${metrics.get('market_cap'):,.0f}")
        if metrics.get("market_cap_rank"):
            lines.append(f"Rank: #{metrics.get('market_cap_rank')}")
        if metrics.get("total_volume_24h"):
            lines.append(f"24h Volume: ${metrics.get('total_volume_24h'):,.0f}")

        # Price changes
        lines.append("")
        lines.append("Price Performance:")
        if metrics.get("price_change_24h_pct"):
            lines.append(f"  24h: {metrics.get('price_change_24h_pct'):.2f}%")
        if metrics.get("price_change_7d_pct"):
            lines.append(f"  7d: {metrics.get('price_change_7d_pct'):.2f}%")
        if metrics.get("price_change_30d_pct"):
            lines.append(f"  30d: {metrics.get('price_change_30d_pct'):.2f}%")

        # Supply
        lines.append("")
        lines.append("Supply Metrics:")
        if metrics.get("circulating_supply"):
            lines.append(f"  Circulating: {metrics.get('circulating_supply'):,.0f}")
        if metrics.get("max_supply"):
            lines.append(f"  Max Supply: {metrics.get('max_supply'):,.0f}")
            if metrics.get("circulating_supply"):
                pct = (
                    metrics.get("circulating_supply") / metrics.get("max_supply")
                ) * 100
                lines.append(f"  % Circulating: {pct:.1f}%")

        # ATH
        if metrics.get("ath"):
            lines.append("")
            lines.append(
                f"ATH: ${metrics.get('ath'):,.2f} ({metrics.get('ath_change_pct'):.1f}% from ATH)"
            )

        # Development
        if metrics.get("github_commits_4w"):
            lines.append("")
            lines.append("Developer Activity:")
            lines.append(f"  Commits (4w): {metrics.get('github_commits_4w')}")
            lines.append(f"  GitHub Stars: {metrics.get('github_stars')}")

        if data.get("note"):
            lines.append("")
            lines.append(f"Note: {data.get('note')}")

        return "\n".join(lines)

    def _format_fundamentals(self, data: dict) -> str:
        """Format project fundamentals for prompt."""
        lines = []

        tokenomics = data.get("tokenomics", {})
        if tokenomics:
            lines.append("Tokenomics:")
            if tokenomics.get("market_cap"):
                lines.append(f"  Market Cap: ${tokenomics.get('market_cap'):,.0f}")
            if tokenomics.get("fully_diluted_valuation"):
                lines.append(
                    f"  FDV: ${tokenomics.get('fully_diluted_valuation'):,.0f}"
                )

        defi = data.get("defi_metrics", {})
        if defi and defi.get("tvl"):
            lines.append("")
            lines.append("DeFi Metrics:")
            lines.append(f"  TVL: ${defi.get('tvl'):,.0f}")
            if defi.get("tvl_change_1d"):
                lines.append(f"  TVL Change (1d): {defi.get('tvl_change_1d'):.2f}%")
            if defi.get("category"):
                lines.append(f"  Category: {defi.get('category')}")

        project = data.get("project_info", {})
        if project:
            lines.append("")
            lines.append("Project Info:")
            if project.get("name"):
                lines.append(f"  Name: {project.get('name')}")
            if project.get("categories"):
                lines.append(
                    f"  Categories: {', '.join(project.get('categories', [])[:3])}"
                )

        return "\n".join(lines) if lines else "Limited fundamental data available"

    def _format_macro(self, data: dict) -> str:
        """Format macro indicators for prompt."""
        lines = []

        crypto = data.get("crypto_market", {})
        if crypto:
            lines.append("Crypto Market:")
            if crypto.get("total_market_cap_usd"):
                lines.append(
                    f"  Total Market Cap: ${crypto.get('total_market_cap_usd'):,.0f}"
                )
            if crypto.get("btc_dominance"):
                lines.append(f"  BTC Dominance: {crypto.get('btc_dominance'):.1f}%")
            if crypto.get("eth_dominance"):
                lines.append(f"  ETH Dominance: {crypto.get('eth_dominance'):.1f}%")

        fg = data.get("fear_greed", {})
        if fg and fg.get("value"):
            lines.append("")
            lines.append("Fear & Greed Index:")
            lines.append(f"  Value: {fg.get('value')}")
            lines.append(f"  Classification: {fg.get('classification')}")
            lines.append(f"  Signal: {fg.get('signal')}")

        return "\n".join(lines) if lines else "Macro data unavailable"

    def _extract_valuation(self, analysis: str) -> dict:
        """Extract valuation assessment from analysis text."""
        analysis_lower = analysis.lower()

        if (
            "significantly undervalued" in analysis_lower
            or "strongly undervalued" in analysis_lower
        ):
            assessment = "STRONGLY_UNDERVALUED"
            score = 90
        elif "undervalued" in analysis_lower:
            assessment = "UNDERVALUED"
            score = 70
        elif (
            "significantly overvalued" in analysis_lower
            or "strongly overvalued" in analysis_lower
        ):
            assessment = "STRONGLY_OVERVALUED"
            score = 10
        elif "overvalued" in analysis_lower:
            assessment = "OVERVALUED"
            score = 30
        else:
            assessment = "FAIR_VALUE"
            score = 50

        return {
            "assessment": assessment,
            "score": score,
        }
