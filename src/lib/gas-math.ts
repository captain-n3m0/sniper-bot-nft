export interface GasEstimatorInputs {
  floorPriceEth: number;
  pendingBids: number;
  supplyLeft: number;
  currentBaseFeeGwei: number;
}

export interface GasEstimatorOutputs {
  priorityFeeGwei: number;
  maxFeeGwei: number;
  strategyName: string;
  riskLevel: 'Safe' | 'Aggressive' | 'Ape';
}

/**
 * Modular Gas Calculation Strategy definition.
 * You can inject custom math strategies here that replace the default logic.
 */
export type GasCalculationStrategy = (inputs: GasEstimatorInputs) => GasEstimatorOutputs;

/**
 * Default Strategy: Calculates recommended gas based on competitive pressure (bids vs supply)
 * and the maximum potential value of the asset (floor price).
 */
export const defaultGasStrategy: GasCalculationStrategy = (inputs) => {
  const { floorPriceEth, pendingBids, supplyLeft, currentBaseFeeGwei } = inputs;

  let priority = 1.5; // Baseline priority fee
  let riskLevel: 'Safe' | 'Aggressive' | 'Ape' = 'Safe';
  let strategyName = 'Standard';

  // Prevent division by zero
  const safeSupply = supplyLeft > 0 ? supplyLeft : 1;
  const competitionRatio = pendingBids / safeSupply;

  if (competitionRatio > 2 || safeSupply < 50) {
    // Gas War scenario: high competition or extremely low supply
    // People are willing to spend a significant fraction of the floor price in priority fees
    priority = Math.max(15, floorPriceEth * 150); 
    riskLevel = 'Ape';
    strategyName = 'Gas War (Frontrun)';
  } else if (competitionRatio > 0.8) {
    // Competitive scenario
    priority = Math.max(5, floorPriceEth * 30);
    riskLevel = 'Aggressive';
    strategyName = 'Competitive';
  }

  // Cap insanely high outliers for safety unless overridden by custom math
  if (priority > 500) {
    priority = 500; 
  }

  // Round priority to 1 decimal place
  priority = Math.ceil(priority * 10) / 10;
  
  // Calculate Max Fee (Base * 1.5 + Priority is a standard safe EIP-1559 heuristic)
  const maxFee = Math.ceil((currentBaseFeeGwei * 1.5) + priority);

  return {
    priorityFeeGwei: priority,
    maxFeeGwei: maxFee,
    strategyName,
    riskLevel
  };
};
