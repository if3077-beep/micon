/**
 * MCP Server 质量评分模块
 *
 * 根据 Activity、Test Coverage、Documentation、Security、Community
 * 五个维度计算综合质量评分，并映射为 HubGrade 等级。
 */

import type { McpQuality, HubGrade } from '../core/types.js';

/** 活动度评分：基于最近更新时间 */
function activityScore(lastUpdate: string): number {
  const now = Date.now();
  const updated = new Date(lastUpdate).getTime();
  const daysSinceUpdate = (now - updated) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate <= 7) return 100;
  if (daysSinceUpdate <= 30) return 80;
  if (daysSinceUpdate <= 90) return 60;
  if (daysSinceUpdate <= 180) return 30;
  return 10;
}

/** 社区评分：基于 Stars 数量 */
function communityScore(stars: number): number {
  if (stars >= 1000) return 100;
  if (stars >= 500) return 80;
  if (stars >= 100) return 60;
  if (stars >= 50) return 40;
  if (stars >= 10) return 20;
  return 5;
}

/**
 * 计算 MCP Server 综合质量评分
 *
 * 权重分配：
 * - Activity (25%): 基于最近更新时间
 * - Test coverage (20%): 直接使用 testCoverage 值
 * - Documentation (20%): 基于描述长度和能力数量估算
 * - Security (20%): 安全审计通过=100，否则=30
 * - Community (15%): 基于 Stars 数量
 *
 * @returns 0-100 的综合评分
 */
export function calculateQualityScore(quality: McpQuality): number {
  const activity = activityScore(quality.lastUpdate);
  const testCov = quality.testCoverage;
  const security = quality.securityAudit ? 100 : 30;
  const community = communityScore(quality.stars);

  // Documentation 需要额外信息，此处用 testCoverage 和 securityAudit 辅助估算
  const docEstimate = Math.min(100, Math.round(
    (quality.testCoverage > 70 ? 60 : 30) +
    (quality.securityAudit ? 40 : 10)
  ));

  const score = Math.round(
    activity * 0.25 +
    testCov * 0.20 +
    docEstimate * 0.20 +
    security * 0.20 +
    community * 0.15
  );

  return Math.max(0, Math.min(100, score));
}

/**
 * 将质量评分映射为等级
 *
 * - A: 90+
 * - B: 75+
 * - C: 60+
 * - D: 40+
 * - F: 40 以下
 */
export function scoreToGrade(score: number): HubGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
