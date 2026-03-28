/** Бросок d6 и попарное сравнение (как в README): сортируем по убыванию, ничья — защитник. */

export interface BattleOutcome {
  attackerRolls: number[]
  defenderRolls: number[]
  attackerPairWins: number
  defenderPairWins: number
}

export function rollBattle(
  attackerDice: number,
  defenderDice: number,
  rnd: () => number,
): BattleOutcome {
  const na = Math.max(1, Math.min(8, attackerDice))
  const nd = Math.max(1, Math.min(8, defenderDice))
  const attackerRolls = Array.from(
    { length: na },
    () => 1 + Math.floor(rnd() * 6),
  )
  const defenderRolls = Array.from(
    { length: nd },
    () => 1 + Math.floor(rnd() * 6),
  )
  attackerRolls.sort((a, b) => b - a)
  defenderRolls.sort((a, b) => b - a)
  const pairs = Math.min(na, nd)
  let attackerPairWins = 0
  let defenderPairWins = 0
  for (let i = 0; i < pairs; i++) {
    if (attackerRolls[i] > defenderRolls[i]) attackerPairWins++
    else defenderPairWins++
  }
  return { attackerRolls, defenderRolls, attackerPairWins, defenderPairWins }
}

export function attackerCaptures(outcome: BattleOutcome): boolean {
  return outcome.attackerPairWins > outcome.defenderPairWins
}

/** Кубики в захваченной зоне: разница побед в парах, минимум 1. */
export function diceAfterCapture(outcome: BattleOutcome): number {
  const net = outcome.attackerPairWins - outcome.defenderPairWins
  return Math.min(8, Math.max(1, net))
}
