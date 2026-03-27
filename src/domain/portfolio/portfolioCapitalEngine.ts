import type {
  BotSettings,
  DiscoveryBucketType,
  OpportunityAssessment,
  PairClass,
  PortfolioCapitalPlan,
  PositionRecord,
  RuntimeCandidateCapitalContext,
} from '../../core/types';

interface PortfolioCapitalPlanInput {
  settings: BotSettings;
  opportunity: OpportunityAssessment;
  policyDecision: {
    action: 'ENTER' | 'SKIP' | 'WAIT';
    sizeMultiplier: number;
  };
  openPositions: PositionRecord[];
  opportunities: OpportunityAssessment[];
}

interface PositionExposureContext {
  pairClass: PairClass;
  discoveryBucket: DiscoveryBucketType;
  notionalIdr: number;
}

function toNotionalIdr(position: PositionRecord): number {
  if (!Number.isFinite(position.currentPrice) || position.currentPrice <= 0) {
    return 0;
  }

  return Math.max(0, position.quantity * position.currentPrice);
}

export class PortfolioCapitalEngine {
  private positionContext(
    position: PositionRecord,
    opportunitiesByPair: Map<string, OpportunityAssessment>,
  ): PositionExposureContext {
    const fromOpportunity = opportunitiesByPair.get(position.pair);

    return {
      pairClass: fromOpportunity?.pairClass ?? 'MAJOR',
      discoveryBucket: fromOpportunity?.discoveryBucket ?? 'LIQUID_LEADER',
      notionalIdr: toNotionalIdr(position),
    };
  }

  plan(input: PortfolioCapitalPlanInput): {
    capitalPlan: PortfolioCapitalPlan;
    capitalContext: RuntimeCandidateCapitalContext;
  } {
    const settings = input.settings.portfolio;
    const reasons: string[] = [];
    const opportunitiesByPair = new Map(input.opportunities.map((item) => [item.pair, item]));
    const currentPairClass = input.opportunity.pairClass ?? 'MAJOR';
    const currentBucket = input.opportunity.discoveryBucket ?? 'LIQUID_LEADER';

    const exposures = input.openPositions
      .map((position) => this.positionContext(position, opportunitiesByPair));

    const totalDeployed = exposures.reduce((sum, item) => sum + item.notionalIdr, 0);
    const currentPairClassExposure = exposures
      .filter((item) => item.pairClass === currentPairClass)
      .reduce((sum, item) => sum + item.notionalIdr, 0);
    const currentBucketExposure = exposures
      .filter((item) => item.discoveryBucket === currentBucket)
      .reduce((sum, item) => sum + item.notionalIdr, 0);

    const requestedNotional = Math.max(0, settings.baseEntryCapitalIdr * input.policyDecision.sizeMultiplier);
    const riskBudgetCap = Math.max(0, settings.maxTotalDeployedCapitalIdr * settings.riskBudgetPerPositionPct);
    const totalRemaining = Math.max(0, settings.maxTotalDeployedCapitalIdr - totalDeployed);
    const pairClassCap = Math.max(0, settings.maxTotalDeployedCapitalIdr * settings.maxExposurePerPairClassPct[currentPairClass]);
    const pairClassRemaining = Math.max(0, pairClassCap - currentPairClassExposure);
    const discoveryCap = Math.max(
      0,
      settings.maxTotalDeployedCapitalIdr * settings.maxExposurePerDiscoveryBucketPct[currentBucket],
    );
    const discoveryRemaining = Math.max(0, discoveryCap - currentBucketExposure);

    const depthScore = input.opportunity.depthScore ?? 0;
    const thinBookCap = depthScore < settings.thinBookDepthScoreThreshold
      ? Math.max(0, requestedNotional * settings.thinBookCapMultiplier)
      : null;

    if (input.policyDecision.action !== 'ENTER') {
      reasons.push(`Policy action ${input.policyDecision.action}: capital allocation diblok`);
    }

    if (thinBookCap !== null) {
      reasons.push(
        `Thin-book cap aktif: depthScore=${depthScore.toFixed(1)} < threshold=${settings.thinBookDepthScoreThreshold.toFixed(1)}`,
      );
    }

    const allowedNotional = Math.max(
      0,
      Math.min(
        requestedNotional,
        riskBudgetCap,
        totalRemaining,
        pairClassRemaining,
        discoveryRemaining,
        thinBookCap ?? Number.MAX_SAFE_INTEGER,
      ),
    );

    if (allowedNotional < requestedNotional) {
      reasons.push('Capital layer mengecilkan notional untuk menjaga budget/exposure');
    }

    if (allowedNotional <= 0) {
      reasons.push('Tidak ada budget/exposure tersisa untuk entry baru');
    }

    const blocked = input.policyDecision.action !== 'ENTER' || allowedNotional <= 0;
    const allocatedNotional = blocked ? 0 : allowedNotional;

    const capitalPlan: PortfolioCapitalPlan = {
      policySizeIntentMultiplier: input.policyDecision.sizeMultiplier,
      baseEntryCapitalIdr: settings.baseEntryCapitalIdr,
      policyIntentNotionalIdr: requestedNotional,
      riskBudgetCapIdr: riskBudgetCap,
      thinBookCapIdr: thinBookCap,
      allowedNotionalIdr: allowedNotional,
      cappedNotionalIdr: Math.max(0, requestedNotional - allowedNotional),
      allocatedNotionalIdr: allocatedNotional,
      blocked,
      reasons,
      exposure: {
        totalDeployedCapitalIdr: totalDeployed,
        totalRemainingCapitalIdr: totalRemaining,
        pairClass: {
          key: currentPairClass,
          usedNotionalIdr: currentPairClassExposure,
          capNotionalIdr: pairClassCap,
          remainingNotionalIdr: pairClassRemaining,
        },
        discoveryBucket: {
          key: currentBucket,
          usedNotionalIdr: currentBucketExposure,
          capNotionalIdr: discoveryCap,
          remainingNotionalIdr: discoveryRemaining,
        },
      },
    };

    return {
      capitalPlan,
      capitalContext: {
        policyIntentNotionalIdr: capitalPlan.policyIntentNotionalIdr,
        allocatedNotionalIdr: capitalPlan.allocatedNotionalIdr,
        cappedNotionalIdr: capitalPlan.cappedNotionalIdr,
        blocked: capitalPlan.blocked,
        reasons: capitalPlan.reasons,
        pairClassBucket: capitalPlan.exposure.pairClass.key,
        discoveryBucket: capitalPlan.exposure.discoveryBucket.key,
      },
    };
  }
}
